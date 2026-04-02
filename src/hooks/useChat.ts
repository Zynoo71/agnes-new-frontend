import { useCallback, useRef } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore, type ContentBlock } from "@/stores/conversationStore";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";
import { addConversation as dbAdd, updateConversation as dbUpdate } from "@/db";
import type { Message } from "@/stores/conversationStore";

const getState = () => useConversationStore.getState();

export function useChat() {
  const abortRef = useRef<AbortController | null>(null);

  /** Shared streaming loop — iterates events, handles errors, resets streaming flag. */
  const runStream = async (
    iter: AsyncIterable<AgentStreamEvent>,
    signal: AbortSignal,
  ) => {
    try {
      for await (const event of iter) {
        if (signal.aborted) break;
        getState().processEvent(event);
      }
    } catch (err) {
      if (signal.aborted) return; // user-initiated cancel, not an error
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Stream error:", err);
      getState().setError(msg);
    } finally {
      getState().setStreaming(false);
    }
  };

  /** Prepare state for a new streaming call and return an AbortSignal. */
  const beginStream = (): AbortSignal => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    getState().setStreaming(true);
    getState().setError(null);
    return ac.signal;
  };

  const createConversation = useCallback(async () => {
    getState().reset();
    const reply = await agentClient.createConversation({});
    getState().setConversationId(reply.conversationId);
    dbAdd(String(reply.conversationId), getState().agentType);
    getState().loadConversations();
    return reply.conversationId;
  }, []);

  const sendMessage = useCallback(async (query: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.addUserMessage(query);
    s.startAssistantMessage();
    const signal = beginStream();

    const stream = agentClient.chatStream(
      { conversationId: s.conversationId, query, agentType: s.agentType },
      { signal },
    );
    await runStream(stream, signal);

    // Update title from first user message
    const msgs = getState().messages;
    const userMsgs = msgs.filter((m) => m.role === "user");
    if (userMsgs.length === 1 && s.conversationId) {
      const title = query.length > 50 ? query.slice(0, 50) + "..." : query;
      dbUpdate(String(s.conversationId), { title });
      getState().loadConversations();
    }
  }, []);

  const hitlResume = useCallback(async (action: "approve" | "modify", feedback?: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.resolveHumanReview();
    s.startAssistantMessage();
    const signal = beginStream();

    const resumePayload: Record<string, unknown> = { action };
    if (action === "modify" && feedback) resumePayload.feedback = feedback;

    const stream = agentClient.hitlResumeStream(
      {
        conversationId: s.conversationId,
        resumeData: new TextEncoder().encode(JSON.stringify(resumePayload)),
      },
      { signal },
    );
    await runStream(stream, signal);
  }, []);

  const editResend = useCallback(async (newQuery: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.removeLastRound();
    s.addUserMessage(newQuery);
    s.startAssistantMessage();
    const signal = beginStream();

    const stream = agentClient.editResendStream(
      { conversationId: s.conversationId, query: newQuery },
      { signal },
    );
    await runStream(stream, signal);
  }, []);

  const regenerate = useCallback(async () => {
    const s = getState();
    if (!s.conversationId) return;

    s.removeLastAssistantMessage();
    s.startAssistantMessage();
    const signal = beginStream();

    const stream = agentClient.regenerateStream(
      { conversationId: s.conversationId },
      { signal },
    );
    await runStream(stream, signal);
  }, []);

  const cancelStream = useCallback(async () => {
    const s = getState();
    abortRef.current?.abort();
    abortRef.current = null;
    if (s.conversationId) {
      try {
        await agentClient.cancelStream({ conversationId: s.conversationId });
      } catch (err) {
        console.error("CancelStream RPC error:", err);
      }
    }
  }, []);

  const selectConversation = useCallback(async (id: bigint) => {
    const s = getState();
    if (s.isStreaming) return;
    s.setConversationId(id);
    s.setError(null);

    try {
      const resp = await agentClient.getConversationHistory({ conversationId: id });
      const messages: Message[] = [];
      for (const turn of resp.turns) {
        // User message — server uses type "human" for user content blocks
        const userText = turn.user
          .filter((b) => b.type === "human" || b.type === "text")
          .map((b) => (b.data as Record<string, unknown>)?.content ?? JSON.stringify(b.data))
          .join("\n");
        if (userText) {
          messages.push({ role: "user", blocks: [{ type: "text", content: userText }], reasoningContent: "", nodes: [] });
        }
        // Assistant message
        const assistantBlocks: ContentBlock[] = [];
        let reasoning = "";
        for (const block of turn.assistant) {
          if (block.type === "text") {
            const content = (block.data as Record<string, unknown>)?.content as string ?? JSON.stringify(block.data);
            assistantBlocks.push({ type: "text", content });
          } else if (block.type === "reasoning") {
            const content = (block.data as Record<string, unknown>)?.content as string ?? "";
            reasoning += content;
          } else if (block.type === "tool_call") {
            const data = block.data as Record<string, unknown>;
            assistantBlocks.push({
              type: "tool_call",
              data: {
                toolCallId: block.toolCallId || "",
                toolName: (data?.name as string) ?? "",
                toolInput: (data?.args as Record<string, unknown>) ?? {},
              },
            });
          } else if (block.type === "tool_result") {
            const data = block.data as Record<string, unknown>;
            const existing = assistantBlocks.find(
              (b) => b.type === "tool_call" && b.data.toolCallId === block.toolCallId,
            );
            if (existing && existing.type === "tool_call") {
              existing.data.toolResult = (data?.content as Record<string, unknown>) ?? data ?? {};
            }
          }
        }
        if (assistantBlocks.length > 0 || reasoning) {
          messages.push({ role: "assistant", blocks: assistantBlocks, reasoningContent: reasoning, nodes: [] });
        }
      }
      getState().setMessages(messages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      getState().setError(`Load history: ${msg}`);
    }
  }, []);

  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream, selectConversation };
}
