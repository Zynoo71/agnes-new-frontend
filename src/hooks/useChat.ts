import { useCallback, useRef } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore } from "@/stores/conversationStore";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

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

  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream };
}
