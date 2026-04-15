import { create } from "zustand";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";
import { pickWorkerCharacter, type WorkerCharacter } from "@/workerCharacters";

// ── Helpers ──

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

function tryDecodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function asRecord(val: unknown): Record<string, unknown> {
  return typeof val === "object" && val !== null ? (val as Record<string, unknown>) : {};
}

// Per-turn max seq tracking for ResumeStream(from_seq).
// Lives outside the store (non-reactive); cleared on turn-end events
// (AgentEnd/AgentError/AgentCancelled) and on new-turn initiation.
const latestSeqByConv = new Map<string, bigint>();

export function getLatestSeq(convId: string): bigint {
  return latestSeqByConv.get(convId) ?? 0n;
}

export function resetLatestSeq(convId: string): void {
  latestSeqByConv.delete(convId);
}

// ── Types ──

export interface ToolCallData {
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
}

export interface NodeData {
  node: string;
  status: "running" | "done";
}

export interface HumanReviewData {
  payload: Record<string, unknown>;
  resolved: boolean;
}

export interface WorkerToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
}

export interface WorkerState {
  workerId: string;
  description: string;
  status: "running" | "done" | "error";
  character: WorkerCharacter;
  characterIndex: number;
  text: string;
  toolCalls: WorkerToolCall[];
  summary?: string;
  error?: string;
}

export interface AgentTask {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "done";
  result: string | null;
  depends_on: number[];
}

export const PLANNING_TOOL_NAMES = new Set([
  "create_task", "update_task", "list_tasks", "get_task",
]);

export interface SlideOutlineData {
  outline: Record<string, unknown>;
}

export interface SlideDesignSystemData {
  summary: string;
}

export interface SourceCitation {
  ref: number;
  url: string;
  title: string;
  snippet?: string;
}

export interface MemoryUpdateData {
  field: "soul" | "identity";
  content: string;
}

export type ContentBlock =
  | { type: "Message"; content: string }
  | { type: "Reasoning"; content: string }
  | { type: "ToolCallStart"; data: ToolCallData }
  | { type: "human_review"; data: HumanReviewData }
  | { type: "TaskList" }
  | { type: "ContextCompacting"; done: boolean }
  | { type: "SlideOutline"; data: SlideOutlineData }
  | { type: "SlideDesignSystem"; data: SlideDesignSystemData }
  | { type: "MemoryUpdate"; data: MemoryUpdateData };

export interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  nodes: NodeData[];
  workers: Record<string, WorkerState>;
  sources: SourceCitation[];
  requestStartedAt?: number;
  ttftMs?: number;
  agentStartedAt?: number;
  agentDurationMs?: number;
  error?: { errorType: string; message: string; recoverable: boolean };
}

export interface RawEvent {
  timestamp: number;
  type: string;
  data: unknown;
  role?: "user" | "assistant";
  seq?: number;
  messageId?: string;
}

// ── Event processing (pure functions) ──

const MAX_RAW_EVENTS = 2000;

function appendOrPushBlock(
  blocks: ContentBlock[],
  blockType: "Message" | "Reasoning",
  content: string,
): void {
  // Search backwards for the last block of the same type,
  // stopping at ToolCallStart boundaries (those separate logical segments).
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === blockType) {
      blocks[i] = { type: blockType, content: (blocks[i] as { content: string }).content + content };
      return;
    }
    if (blocks[i].type === "ToolCallStart") break;
  }
  blocks.push({ type: blockType, content });
}

function setTtftIfNeeded(message: Message, eventTimestamp: number): Message {
  if (message.role !== "assistant" || message.ttftMs != null || message.requestStartedAt == null) {
    return message;
  }

  return {
    ...message,
    ttftMs: Math.max(0, eventTimestamp - message.requestStartedAt),
  };
}

export function applyStreamEvent(messages: Message[], event: AgentStreamEvent, eventTimestamp = Date.now()): Message[] {
  const msgs = [...messages];

  // HumanInput: insert user message before the trailing assistant message (ResumeStream replay)
  if (event.event.case === "custom") {
    const custom = event.event.value;
    if (custom.type === "HumanInput") {
      const payload = asRecord(tryDecodeJson(custom.payload));
      const blocks = (payload.blocks as { type: string; data: unknown }[]) ?? [];
      const userText = blocks
        .filter((b) => b.type === "Message")
        .map((b) => ((b.data as Record<string, unknown>)?.content as string) ?? "")
        .join("\n");
      if (userText) {
        const userMsg: Message = {
          id: nextMessageId(), role: "user",
          blocks: [{ type: "Message", content: userText }], nodes: [], workers: {}, sources: [],
        };
        const lastIdx = msgs.length - 1;
        if (msgs[lastIdx]?.role === "assistant") {
          msgs.splice(lastIdx, 0, userMsg);
        } else {
          msgs.push(userMsg);
        }
      }
      return msgs;
    }
  }

  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "assistant") return msgs;

  const updated = { ...last, blocks: [...last.blocks], workers: { ...last.workers }, sources: [...last.sources] };

  switch (event.event.case) {
    case "agentStart": {
      updated.agentStartedAt = eventTimestamp;
      updated.agentDurationMs = undefined;
      break;
    }
    case "agentEnd": {
      if (updated.agentStartedAt != null) {
        updated.agentDurationMs = Math.max(0, eventTimestamp - updated.agentStartedAt);
      }
      break;
    }
    case "messageDelta": {
      const delta = event.event.value;
      if (delta.content) appendOrPushBlock(updated.blocks, "Message", delta.content);
      break;
    }
    case "reasoningDelta": {
      const delta = event.event.value;
      if (delta.content) appendOrPushBlock(updated.blocks, "Reasoning", delta.content);
      break;
    }
    case "toolCallStart": {
      const tc = event.event.value;
      const input = asRecord(tryDecodeJson(tc.toolInput));
      const ttftUpdated = setTtftIfNeeded(updated, eventTimestamp);
      updated.blocks.push({
        type: "ToolCallStart",
        data: { toolCallId: tc.toolCallId, toolName: tc.toolName, toolInput: input },
      });
      updated.ttftMs = ttftUpdated.ttftMs;
      break;
    }
    case "toolCallResult": {
      const tr = event.event.value;
      const result = asRecord(tryDecodeJson(tr.toolResult));
      const ttftUpdated = setTtftIfNeeded(updated, eventTimestamp);
      const hasIdMatch = tr.toolCallId
        ? updated.blocks.some(
            (b) => b.type === "ToolCallStart" && b.data.toolCallId === tr.toolCallId,
          )
        : false;
      let fallbackUsed = false;
      updated.blocks = updated.blocks.map((block) => {
        if (block.type !== "ToolCallStart") return block;
        if (hasIdMatch) {
          return block.data.toolCallId === tr.toolCallId
            ? { type: "ToolCallStart", data: { ...block.data, toolResult: result } }
            : block;
        }
        if (!fallbackUsed && block.data.toolName === tr.toolName && !block.data.toolResult) {
          fallbackUsed = true;
          return { type: "ToolCallStart", data: { ...block.data, toolResult: result } };
        }
        return block;
      });
      updated.ttftMs = ttftUpdated.ttftMs;
      break;
    }
    case "nodeStart": {
      const ns = event.event.value;
      updated.nodes = [...updated.nodes, { node: ns.node, status: "running" }];
      break;
    }
    case "nodeEnd": {
      const ne = event.event.value;
      updated.nodes = updated.nodes.map((n) =>
        n.node === ne.node ? { ...n, status: "done" } : n
      );
      break;
    }
    case "agentError": {
      const err = event.event.value;
      updated.error = {
        errorType: err.errorType,
        message: err.message,
        recoverable: err.recoverable,
      };
      break;
    }
    case "custom": {
      const custom = event.event.value;
      const payload = (tryDecodeJson(custom.payload) ?? {}) as Record<string, unknown>;

      if (custom.type === "ContextCompactStart") {
        updated.blocks.push({ type: "ContextCompacting", done: false });
        break;
      }

      if (custom.type === "ContextCompactEnd") {
        for (let i = updated.blocks.length - 1; i >= 0; i--) {
          const block = updated.blocks[i];
          if (block.type === "ContextCompacting" && !block.done) {
            updated.blocks[i] = { type: "ContextCompacting", done: true };
            break;
          }
        }
        break;
      }

      if (custom.type === "HumanReview") {
        updated.blocks.push({
          type: "human_review",
          data: { payload, resolved: false },
        });
        break;
      }

      if (custom.type === "SourcesCited") {
        const sources = (payload.sources as SourceCitation[]) ?? [];
        if (sources.length > 0) {
          updated.sources = [...updated.sources, ...sources];
        }
        break;
      }

      if (custom.type === "TaskUpdate") {
        const action = payload.action as string;
        if (action === "create") {
          const hasAnchor = updated.blocks.some((b) => b.type === "TaskList");
          if (!hasAnchor) {
            updated.blocks.push({ type: "TaskList" });
          }
        }
        break;
      }

      if (custom.type === "OutlineGenerated") {
        updated.blocks.push({
          type: "SlideOutline",
          data: { outline: (payload.outline as Record<string, unknown>) ?? {} },
        });
        break;
      }

      if (custom.type === "DesignSystemGenerated") {
        updated.blocks.push({
          type: "SlideDesignSystem",
          data: { summary: (payload.summary as string) ?? "" },
        });
        break;
      }

      if (custom.type === "MemoryUpdate") {
        const field = payload.field as string;
        const content = payload.content as string;
        if (field && content) {
          updated.blocks.push({
            type: "MemoryUpdate",
            data: { field: field as "soul" | "identity", content },
          });
        }
        break;
      }

      // Worker events
      const workerId = payload.worker_id as string | undefined;
      if (workerId) {
        updated.workers = { ...updated.workers };
        switch (custom.type) {
          case "WorkerStart": {
            const usedIndices = new Set(Object.values(updated.workers).map((w) => w.characterIndex));
            const { index, character } = pickWorkerCharacter(usedIndices, workerId);
            updated.workers[workerId] = {
              workerId,
              description: (payload.description as string) ?? "",
              status: "running",
              character,
              characterIndex: index,
              text: "",
              toolCalls: [],
            };
            break;
          }
          case "MessageDelta": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = { ...w, text: w.text + ((payload.content as string) ?? "") };
            }
            break;
          }
          case "ToolCallStart": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = {
                ...w,
                toolCalls: [...w.toolCalls, { toolName: (payload.tool_name as string) ?? "", toolInput: (payload.tool_input as Record<string, unknown>) ?? {} }],
              };
            }
            break;
          }
          case "ToolCallResult": {
            const w = updated.workers[workerId];
            if (w) {
              const toolCalls = [...w.toolCalls];
              for (let i = toolCalls.length - 1; i >= 0; i--) {
                if (toolCalls[i].toolName === (payload.tool_name as string) && !toolCalls[i].toolResult) {
                  toolCalls[i] = { ...toolCalls[i], toolResult: payload.tool_result as Record<string, unknown> };
                  break;
                }
              }
              updated.workers[workerId] = { ...w, toolCalls };
            }
            break;
          }
          case "WorkerEnd": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = { ...w, status: "done", summary: (payload.summary as string) ?? "" };
            }
            break;
          }
          case "WorkerError": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = { ...w, status: "error", error: (payload.error as string) ?? "Unknown error" };
            }
            break;
          }
        }
      }
      break;
    }
  }

  msgs[msgs.length - 1] = updated;
  return msgs;
}

export function buildRawEvent(event: AgentStreamEvent): RawEvent {
  let cleaned: unknown = event.event.value;
  if (cleaned && typeof cleaned === "object") {
    cleaned = Object.fromEntries(
      Object.entries(cleaned as Record<string, unknown>).map(([k, v]) => [
        k,
        v instanceof Uint8Array ? tryDecodeJson(v) : v,
      ])
    );
  }
  const seq = event.seq > 0n ? Number(event.seq) : undefined;
  return {
    timestamp: Date.now(),
    type: event.event.case ?? "unknown",
    data: cleaned,
    role: "assistant",
    seq,
    messageId: event.messageId || undefined,
  };
}

function pushRawEvent(events: RawEvent[], event: RawEvent): RawEvent[] {
  if (events.length >= MAX_RAW_EVENTS) {
    const trimmed = events.slice(Math.floor(MAX_RAW_EVENTS * 0.2));
    return [...trimmed, event];
  }
  return [...events, event];
}

export function rebuildTasksFromHistory(messages: Message[]): AgentTask[] {
  let tasks: AgentTask[] = [];
  for (const msg of messages) {
    for (const block of msg.blocks) {
      if (block.type !== "ToolCallStart" || !PLANNING_TOOL_NAMES.has(block.data.toolName) || !block.data.toolResult) continue;
      const result = block.data.toolResult;
      if (Array.isArray(result.tasks)) {
        tasks = result.tasks as AgentTask[];
      }
      if (result.action === "create" && result.task && typeof (result.task as Record<string, unknown>).id === "number") {
        const task = result.task as AgentTask;
        if (!tasks.some((t) => t.id === task.id)) {
          tasks = [...tasks, task];
        }
      }
      if (result.action === "update" && typeof result.task_id === "number" && result.status) {
        tasks = tasks.map((t) => t.id === result.task_id ? { ...t, status: result.status as AgentTask["status"] } : t);
      }
      if (result.action === "reset") {
        tasks = [];
      }
    }
  }
  return tasks;
}

// ── Store ──

interface PendingTextSegment {
  convId: string;
  type: "Message" | "Reasoning";
  content: string;
}

interface ConversationStore {
  conversationId: string | null;
  agentType: string;
  systemPromptId: string | null;
  messages: Message[];
  rawEvents: RawEvent[];
  tasks: AgentTask[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  error: string | null;
  streamingConvIds: Set<string>;

  // Typing animation state
  pendingTextQueue: PendingTextSegment[];
  isTyping: boolean;

  setConversationId: (id: string) => void;
  setAgentType: (type: string) => void;
  setSystemPromptId: (id: string | null) => void;
  setStreaming: (v: boolean) => void;
  setLoadingHistory: (v: boolean) => void;
  setError: (err: string | null) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: (requestStartedAt?: number) => void;
  resolveHumanReview: () => void;
  removeLastRound: () => void;
  removeLastAssistantMessage: () => void;
  setMessages: (messages: Message[]) => void;
  reset: () => void;

  addStreamingConv: (convId: string) => void;
  removeStreamingConv: (convId: string) => void;
  processEventForConv: (convId: string, event: AgentStreamEvent) => void;
  
  // Internal typing loop
  flushPendingText: () => void;
}

export const useConversationStore = create<ConversationStore>((set, get) => {
  let rafId: number | null = null;

  const runTypingLoop = () => {
    const { pendingTextQueue, flushPendingText } = get();
    if (pendingTextQueue.length === 0) {
      set({ isTyping: false });
      rafId = null;
      return;
    }

    flushPendingText();
    rafId = requestAnimationFrame(runTypingLoop);
  };

  return {
    conversationId: null,
    agentType: "super",
    systemPromptId: null,
    messages: [],
    rawEvents: [],
    tasks: [],
    isStreaming: false,
    isLoadingHistory: false,
    error: null,
    streamingConvIds: new Set(),
    pendingTextQueue: [],
    isTyping: false,

    setConversationId: (id) => set({ conversationId: id }),
    setAgentType: (type) => set({ agentType: type }),
    setSystemPromptId: (id) => set({ systemPromptId: id }),
    setStreaming: (v) => set({ isStreaming: v }),
    setLoadingHistory: (v) => set({ isLoadingHistory: v }),
    setError: (err) => set({ error: err }),

    addUserMessage: (content) =>
      set((s) => ({
        messages: [
          ...s.messages,
          { id: nextMessageId(), role: "user", blocks: [{ type: "Message", content }], nodes: [], workers: {}, sources: [] },
        ],
      })),

    startAssistantMessage: (requestStartedAt) =>
      set((s) => ({
        messages: [
          ...s.messages,
          { id: nextMessageId(), role: "assistant", blocks: [], nodes: [], workers: {}, sources: [], requestStartedAt },
        ],
      })),

    addStreamingConv: (convId) =>
      set((s) => {
        const ids = new Set(s.streamingConvIds);
        ids.add(convId);
        return { streamingConvIds: ids };
      }),

    removeStreamingConv: (convId) =>
      set((s) => {
        const ids = new Set(s.streamingConvIds);
        ids.delete(convId);
        const isActiveConv = s.conversationId === convId;
        return {
          streamingConvIds: ids,
          ...(isActiveConv ? { isStreaming: false } : {}),
        };
      }),

    processEventForConv: (convId, event) => {
      const s = get();
      if (s.conversationId !== convId) return;

      // Track per-turn max seq for ResumeStream resume.
      // seq === 0n means unpopulated (legacy server or non-resume path); ignore.
      if (event.seq > 0n) {
        const cur = latestSeqByConv.get(convId) ?? 0n;
        if (event.seq > cur) latestSeqByConv.set(convId, event.seq);
      }
      // Turn boundary: clear seq so the next turn starts fresh from 0.
      const caseName = event.event.case;
      if (caseName === "agentEnd" || caseName === "agentError" || caseName === "agentCancelled") {
        latestSeqByConv.delete(convId);
      }

      const rawEvent = buildRawEvent(event);

      // Handle text deltas via queue
      if (event.event.case === "messageDelta") {
        const value = event.event.value;
        if (!value?.content) return;
        set((prev) => ({
          messages: prev.messages.length > 0
            ? (() => {
                const msgs = [...prev.messages];
                const last = msgs[msgs.length - 1];
                if (!last || last.role !== "assistant" || last.ttftMs != null || last.requestStartedAt == null) {
                  return prev.messages;
                }
                msgs[msgs.length - 1] = setTtftIfNeeded(last, rawEvent.timestamp);
                return msgs;
              })()
            : prev.messages,
          pendingTextQueue: [...prev.pendingTextQueue, { convId, type: "Message", content: value.content }],
          rawEvents: pushRawEvent(prev.rawEvents, rawEvent),
        }));
        if (!get().isTyping) {
          set({ isTyping: true });
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(runTypingLoop);
        }
        return;
      }
      if (event.event.case === "reasoningDelta") {
        const value = event.event.value;
        if (!value?.content) return;
        set((prev) => ({
          pendingTextQueue: [...prev.pendingTextQueue, { convId, type: "Reasoning", content: value.content }],
          rawEvents: pushRawEvent(prev.rawEvents, rawEvent),
        }));
        if (!get().isTyping) {
          set({ isTyping: true });
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(runTypingLoop);
        }
        return;
      }

      // Extract tasks from TaskUpdate custom events
      let newTasks: AgentTask[] | undefined;
      if (event.event.case === "custom" && event.event.value.type === "TaskUpdate") {
        const payload = asRecord(tryDecodeJson(event.event.value.payload));
        const action = payload.action as string;
        if (action === "create") {
          const existing = get().tasks;
          const task = payload.task as AgentTask | undefined;
          if (task && !existing.some((t) => t.id === task.id)) {
            // Incremental add: append single new task (order-safe for concurrent emits)
            newTasks = [...existing, task];
          } else {
            // Fallback: accept full list only if it's strictly longer (prevents out-of-order overwrites)
            const tasks = payload.tasks as AgentTask[] | undefined;
            if (tasks && tasks.length > existing.length) {
              newTasks = tasks;
            }
          }
        } else if (action === "update") {
          const taskId = payload.task_id as number;
          const status = payload.status as AgentTask["status"];
          if (taskId != null && status) {
            newTasks = get().tasks.map((t) => (t.id === taskId ? { ...t, status } : t));
          }
        } else if (action === "reset") {
          newTasks = [];
        }
      }

      set((prev) => ({
        messages: applyStreamEvent(prev.messages, event, rawEvent.timestamp),
        rawEvents: pushRawEvent(prev.rawEvents, rawEvent),
        ...(newTasks !== undefined ? { tasks: newTasks } : {}),
      }));
    },

    flushPendingText: () => {
      const { pendingTextQueue, conversationId, messages } = get();
      if (pendingTextQueue.length === 0) return;

      const newQueue = [...pendingTextQueue];
      const msgs = [...messages];
      
      const CHARS_PER_FRAME = Math.max(2, Math.floor(newQueue.reduce((acc, s) => acc + s.content.length, 0) / 10));
      let charsRemaining = CHARS_PER_FRAME;

      while (charsRemaining > 0 && newQueue.length > 0) {
        const segment = newQueue[0];
        
        if (segment.convId !== conversationId) {
          newQueue.shift();
          continue;
        }

        const toTake = Math.min(segment.content.length, charsRemaining);
        const chunk = segment.content.slice(0, toTake);
        const remainingInSegment = segment.content.slice(toTake);

        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          const updated = { ...last, blocks: [...last.blocks], workers: { ...last.workers }, sources: [...last.sources] };
          appendOrPushBlock(updated.blocks, segment.type, chunk);
          msgs[msgs.length - 1] = updated;
        }

        charsRemaining -= toTake;
        if (remainingInSegment) {
          newQueue[0] = { ...segment, content: remainingInSegment };
        } else {
          newQueue.shift();
        }
      }

      set({ messages: msgs, pendingTextQueue: newQueue });
    },

    resolveHumanReview: () =>
      set((s) => {
        const messages = [...s.messages];
        const last = messages[messages.length - 1];
        if (!last) return s;
        const blocks = [...last.blocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          const block = blocks[i];
          if (block.type === "human_review" && !block.data.resolved) {
            blocks[i] = { type: "human_review", data: { ...block.data, resolved: true } };
            break;
          }
        }
        messages[messages.length - 1] = { ...last, blocks };
        return { messages };
      }),

    removeLastRound: () =>
      set((s) => {
        const messages = [...s.messages];
        if (messages.length > 0 && messages[messages.length - 1].role === "assistant") messages.pop();
        if (messages.length > 0 && messages[messages.length - 1].role === "user") messages.pop();
        return { messages };
      }),

    removeLastAssistantMessage: () =>
      set((s) => {
        const messages = [...s.messages];
        if (messages.length > 0 && messages[messages.length - 1].role === "assistant") messages.pop();
        return { messages };
      }),

    setMessages: (messages) => set({ messages, rawEvents: [] }),

    reset: () => {
      const cur = get().conversationId;
      if (cur) latestSeqByConv.delete(cur);
      set({ conversationId: null, systemPromptId: null, messages: [], rawEvents: [], tasks: [], isStreaming: false, isLoadingHistory: false, error: null, pendingTextQueue: [], isTyping: false });
    },
  };
});
