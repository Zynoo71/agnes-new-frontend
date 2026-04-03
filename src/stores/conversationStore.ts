import { create } from "zustand";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";
import { listConversations as dbList, type ConvMeta } from "@/db";

function tryDecodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

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

export type ContentBlock =
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool_call"; data: ToolCallData }
  | { type: "human_review"; data: HumanReviewData };

export interface Message {
  role: "user" | "assistant";
  blocks: ContentBlock[];
  nodes: NodeData[];
  error?: { errorType: string; message: string; recoverable: boolean };
}

export interface RawEvent {
  timestamp: number;
  type: string;
  data: unknown;
}

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

  const updated = { ...last, blocks: [...last.blocks] };

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
      if (custom.type === "human_review") {
        const payload = (tryDecodeJson(custom.payload) ?? {}) as Record<string, unknown>;
        updated.blocks.push({
          type: "human_review",
          data: { payload, resolved: false },
        });
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

interface ConversationStore {
  conversationId: bigint | null;
  agentType: string;
  messages: Message[];
  rawEvents: RawEvent[];
  isStreaming: boolean;
  error: string | null;
  streamingConvIds: Set<string>;

  setConversationId: (id: bigint) => void;
  setAgentType: (type: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (err: string | null) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  resolveHumanReview: () => void;
  removeLastRound: () => void;
  removeLastAssistantMessage: () => void;
  conversations: ConvMeta[];
  loadConversations: () => void;
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
  conversations: [],
  streamingConvIds: new Set(),

  setConversationId: (id) => set({ conversationId: id }),
  setAgentType: (type) => set({ agentType: type }),
  setStreaming: (v) => set({ isStreaming: v }),
  setError: (err) => set({ error: err }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "user", blocks: [{ type: "text", content }], nodes: [] },
      ],
    })),

  startAssistantMessage: () =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "assistant", blocks: [], nodes: [] },
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
      const isActiveConv = String(s.conversationId) === convId;
      return {
        streamingConvIds: ids,
        ...(isActiveConv ? { isStreaming: false } : {}),
      };
    }),

  processEventForConv: (convId, event) => {
    const s = get();
    if (String(s.conversationId) !== convId) return; // drop events for non-active conversations
    const rawEvent = buildRawEvent(event);
    set((prev) => ({
      messages: applyStreamEvent(prev.messages, event),
      rawEvents: [...prev.rawEvents, rawEvent],
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

  loadConversations: () => set({ conversations: dbList() }),

  setMessages: (messages) => set({ messages, rawEvents: [] }),

  reset: () =>
    set({ conversationId: null, messages: [], rawEvents: [], isStreaming: false, error: null }),
}));
