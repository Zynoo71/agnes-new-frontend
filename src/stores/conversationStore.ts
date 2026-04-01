import { create } from "zustand";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

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

export interface Message {
  role: "user" | "assistant";
  content: string;
  reasoningContent: string;
  toolCalls: ToolCallData[];
  nodes: NodeData[];
  error?: { errorType: string; message: string; recoverable: boolean };
  humanReview?: HumanReviewData;
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

  setConversationId: (id: bigint) => void;
  setAgentType: (type: string) => void;
  setStreaming: (v: boolean) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  processEvent: (event: AgentStreamEvent) => void;
  addRawEvent: (type: string, data: unknown) => void;
  resolveHumanReview: () => void;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversationId: null,
  agentType: "search",
  messages: [],
  rawEvents: [],
  isStreaming: false,

  setConversationId: (id) => set({ conversationId: id }),
  setAgentType: (type) => set({ agentType: type }),
  setStreaming: (v) => set({ isStreaming: v }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "user", content, reasoningContent: "", toolCalls: [], nodes: [] },
      ],
    })),

  startAssistantMessage: () =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "assistant", content: "", reasoningContent: "", toolCalls: [], nodes: [] },
      ],
    })),

  addRawEvent: (type, data) =>
    set((s) => ({
      rawEvents: [...s.rawEvents, { timestamp: Date.now(), type, data }],
    })),

  processEvent: (event) => {
    const store = get();
    store.addRawEvent(event.event.case ?? "unknown", event.event.value);

    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") return s;

      const updated = { ...last };

      switch (event.event.case) {
        case "messageDelta": {
          const delta = event.event.value;
          updated.content += delta.content;
          updated.reasoningContent += delta.reasoningContent;
          break;
        }
        case "toolCallStart": {
          const tc = event.event.value;
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(new TextDecoder().decode(tc.toolInput));
          } catch {}
          updated.toolCalls = [
            ...updated.toolCalls,
            { toolCallId: tc.toolCallId, toolName: tc.toolName, toolInput: input },
          ];
          break;
        }
        case "toolCallResult": {
          const tr = event.event.value;
          let result: Record<string, unknown> = {};
          try {
            result = JSON.parse(new TextDecoder().decode(tr.toolResult));
          } catch {}
          updated.toolCalls = updated.toolCalls.map((tc) =>
            tc.toolCallId === tr.toolCallId ? { ...tc, toolResult: result } : tc
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
            updated.humanReview = { payload, resolved: false };
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
      if (!last || !last.humanReview) return s;
      messages[messages.length - 1] = {
        ...last,
        humanReview: { ...last.humanReview, resolved: true },
      };
      return { messages };
    }),

  reset: () =>
    set({ conversationId: null, messages: [], rawEvents: [], isStreaming: false }),
}));
