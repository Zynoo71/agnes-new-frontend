import { create } from "zustand";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

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

// Ordered content blocks — rendered in sequence
export type ContentBlock =
  | { type: "text"; content: string }
  | { type: "tool_call"; data: ToolCallData }
  | { type: "human_review"; data: HumanReviewData };

export interface Message {
  role: "user" | "assistant";
  blocks: ContentBlock[];
  reasoningContent: string;
  nodes: NodeData[];
  error?: { errorType: string; message: string; recoverable: boolean };
}

export interface RawEvent {
  timestamp: number;
  type: string;
  data: unknown;
}

interface ConversationState {
  conversationId: bigint | null;
  agentType: string;
  messages: Message[];
  rawEvents: RawEvent[];
  isStreaming: boolean;
  error: string | null;

  setConversationId: (id: bigint) => void;
  setAgentType: (type: string) => void;
  setStreaming: (v: boolean) => void;
  setError: (err: string | null) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  processEvent: (event: AgentStreamEvent) => void;
  addRawEvent: (type: string, data: unknown) => void;
  resolveHumanReview: () => void;
  removeLastRound: () => void;
  removeLastAssistantMessage: () => void;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversationId: null,
  agentType: "search",
  messages: [],
  rawEvents: [],
  isStreaming: false,
  error: null,

  setConversationId: (id) => set({ conversationId: id }),
  setAgentType: (type) => set({ agentType: type }),
  setStreaming: (v) => set({ isStreaming: v }),
  setError: (err) => set({ error: err }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "user", blocks: [{ type: "text", content }], reasoningContent: "", nodes: [] },
      ],
    })),

  startAssistantMessage: () =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "assistant", blocks: [], reasoningContent: "", nodes: [] },
      ],
    })),

  addRawEvent: (type, data) => {
    // Decode Uint8Array fields to strings for readable JSON display in EventStream
    let cleaned = data;
    if (data && typeof data === "object") {
      cleaned = Object.fromEntries(
        Object.entries(data as Record<string, unknown>).map(([k, v]) => [
          k,
          v instanceof Uint8Array ? tryDecodeJson(v) : v,
        ])
      );
    }
    set((s) => ({
      rawEvents: [...s.rawEvents, { timestamp: Date.now(), type, data: cleaned }],
    }));
  },

  processEvent: (event) => {
    const store = get();
    store.addRawEvent(event.event.case ?? "unknown", event.event.value);

    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") return s;

      const updated = { ...last, blocks: [...last.blocks] };

      switch (event.event.case) {
        case "messageDelta": {
          const delta = event.event.value;
          if (delta.content) {
            const lastBlock = updated.blocks[updated.blocks.length - 1];
            if (lastBlock && lastBlock.type === "text") {
              // Append to existing text block
              updated.blocks[updated.blocks.length - 1] = {
                type: "text",
                content: lastBlock.content + delta.content,
              };
            } else {
              // New text block
              updated.blocks.push({ type: "text", content: delta.content });
            }
          }
          if (delta.reasoningContent) {
            updated.reasoningContent += delta.reasoningContent;
          }
          break;
        }
        case "toolCallStart": {
          const tc = event.event.value;
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(new TextDecoder().decode(tc.toolInput));
          } catch {}
          updated.blocks.push({
            type: "tool_call",
            data: { toolCallId: tc.toolCallId, toolName: tc.toolName, toolInput: input },
          });
          break;
        }
        case "toolCallResult": {
          const tr = event.event.value;
          let result: Record<string, unknown> = {};
          try {
            result = JSON.parse(new TextDecoder().decode(tr.toolResult));
          } catch {}
          // Find and update the matching tool_call block
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
            let payload: Record<string, unknown> = {};
            try {
              payload = JSON.parse(new TextDecoder().decode(custom.payload));
            } catch {}
            updated.blocks.push({
              type: "human_review",
              data: { payload, resolved: false },
            });
          }
          break;
        }
      }

      messages[messages.length - 1] = updated;
      return { messages };
    });
  },

  resolveHumanReview: () =>
    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last) return s;
      // Find the last unresolved human_review block and mark it resolved
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

  reset: () =>
    set({ conversationId: null, messages: [], rawEvents: [], isStreaming: false, error: null }),
}));
