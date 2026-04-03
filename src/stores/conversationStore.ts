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

export type ContentBlock =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; data: ToolCallData }
  | { type: "human_review"; data: HumanReviewData };

export interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  nodes: NodeData[];
  workers: Record<string, WorkerState>;
  error?: { errorType: string; message: string; recoverable: boolean };
}

export interface RawEvent {
  timestamp: number;
  type: string;
  data: unknown;
}

// ── Event processing (pure functions) ──

const MAX_RAW_EVENTS = 500;

function appendOrPushBlock(
  blocks: ContentBlock[],
  blockType: "text" | "reasoning",
  content: string,
): void {
  const last = blocks[blocks.length - 1];
  if (last && last.type === blockType) {
    blocks[blocks.length - 1] = { type: blockType, content: last.content + content };
  } else {
    blocks.push({ type: blockType, content });
  }
}

export function applyStreamEvent(messages: Message[], event: AgentStreamEvent): Message[] {
  const msgs = [...messages];
  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "assistant") return msgs;

  const updated = { ...last, blocks: [...last.blocks], workers: { ...last.workers } };

  switch (event.event.case) {
    case "messageDelta": {
      const delta = event.event.value;
      if (delta.content) appendOrPushBlock(updated.blocks, "text", delta.content);
      break;
    }
    case "reasoningDelta": {
      const delta = event.event.value;
      if (delta.content) appendOrPushBlock(updated.blocks, "reasoning", delta.content);
      break;
    }
    case "toolCallStart": {
      const tc = event.event.value;
      const input = (tryDecodeJson(tc.toolInput) ?? {}) as Record<string, unknown>;
      updated.blocks.push({
        type: "tool_call",
        data: { toolCallId: tc.toolCallId, toolName: tc.toolName, toolInput: input },
      });
      break;
    }
    case "toolCallResult": {
      const tr = event.event.value;
      const result = (tryDecodeJson(tr.toolResult) ?? {}) as Record<string, unknown>;
      updated.blocks = updated.blocks.map((block) =>
        block.type === "tool_call" && block.data.toolCallId === tr.toolCallId
          ? { type: "tool_call", data: { ...block.data, toolResult: result } }
          : block
      );
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

      if (custom.type === "human_review") {
        updated.blocks.push({
          type: "human_review",
          data: { payload, resolved: false },
        });
        break;
      }

      // Worker events — route by worker_id
      const workerId = payload.worker_id as string | undefined;
      if (workerId) {
        updated.workers = { ...updated.workers };

        switch (custom.type) {
          case "worker_start": {
            const usedIndices = new Set(
              Object.values(updated.workers).map((w) => w.characterIndex),
            );
            const { index, character } = pickWorkerCharacter(usedIndices);
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
          case "message_delta": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = {
                ...w,
                text: w.text + ((payload.content as string) ?? ""),
              };
            }
            break;
          }
          case "tool_call_start": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = {
                ...w,
                toolCalls: [
                  ...w.toolCalls,
                  {
                    toolName: (payload.tool_name as string) ?? "",
                    toolInput: (payload.tool_input as Record<string, unknown>) ?? {},
                  },
                ],
              };
            }
            break;
          }
          case "tool_call_result": {
            const w = updated.workers[workerId];
            if (w) {
              const toolCalls = [...w.toolCalls];
              for (let i = toolCalls.length - 1; i >= 0; i--) {
                if (
                  toolCalls[i].toolName === (payload.tool_name as string) &&
                  !toolCalls[i].toolResult
                ) {
                  toolCalls[i] = { ...toolCalls[i], toolResult: payload.tool_result as Record<string, unknown> };
                  break;
                }
              }
              updated.workers[workerId] = { ...w, toolCalls };
            }
            break;
          }
          case "worker_end": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = {
                ...w,
                status: "done",
                summary: (payload.summary as string) ?? "",
              };
            }
            break;
          }
          case "worker_error": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = {
                ...w,
                status: "error",
                error: (payload.error as string) ?? "Unknown error",
              };
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
  return { timestamp: Date.now(), type: event.event.case ?? "unknown", data: cleaned };
}

function pushRawEvent(events: RawEvent[], event: RawEvent): RawEvent[] {
  if (events.length >= MAX_RAW_EVENTS) {
    // Drop oldest 20% when hitting the cap
    const trimmed = events.slice(Math.floor(MAX_RAW_EVENTS * 0.2));
    return [...trimmed, event];
  }
  return [...events, event];
}

// ── Store ──

interface ConversationStore {
  conversationId: string | null;
  agentType: string;
  messages: Message[];
  rawEvents: RawEvent[];
  isStreaming: boolean;
  error: string | null;
  streamingConvIds: Set<string>;

  setConversationId: (id: string) => void;
  setAgentType: (type: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (err: string | null) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  resolveHumanReview: () => void;
  removeLastRound: () => void;
  removeLastAssistantMessage: () => void;
  setMessages: (messages: Message[]) => void;
  reset: () => void;

  addStreamingConv: (convId: string) => void;
  removeStreamingConv: (convId: string) => void;
  processEventForConv: (convId: string, event: AgentStreamEvent) => void;
}

export const useConversationStore = create<ConversationStore>((set, get) => ({
  conversationId: null,
  agentType: "super",
  messages: [],
  rawEvents: [],
  isStreaming: false,
  error: null,
  streamingConvIds: new Set(),

  setConversationId: (id) => set({ conversationId: id }),
  setAgentType: (type) => set({ agentType: type }),
  setStreaming: (v) => set({ isStreaming: v }),
  setError: (err) => set({ error: err }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextMessageId(), role: "user", blocks: [{ type: "text", content }], nodes: [], workers: {} },
      ],
    })),

  startAssistantMessage: () =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: nextMessageId(), role: "assistant", blocks: [], nodes: [], workers: {} },
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
    const rawEvent = buildRawEvent(event);
    set((prev) => ({
      messages: applyStreamEvent(prev.messages, event),
      rawEvents: pushRawEvent(prev.rawEvents, rawEvent),
    }));
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

  reset: () =>
    set({ conversationId: null, messages: [], rawEvents: [], isStreaming: false, error: null }),
}));
