import { useCallback, useRef } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore, type ContentBlock, type Message } from "@/stores/conversationStore";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";
import { addConversation as dbAdd, updateConversation as dbUpdate } from "@/db";

const getState = () => useConversationStore.getState();

/** Parse server history turns into client Message array. */
function parseHistoryTurns(turns: { user: unknown[]; assistant: unknown[] }[]): Message[] {
  const messages: Message[] = [];
  for (const turn of turns) {
    const userBlocks = turn.user as { type: string; data: unknown }[];
    const userText = userBlocks
      .filter((b) => b.type === "human" || b.type === "text")
      .map((b) => (b.data as Record<string, unknown>)?.content ?? JSON.stringify(b.data))
      .join("\n");
    if (userText) {
      messages.push({ role: "user", blocks: [{ type: "text", content: userText }], nodes: [] });
    }
    const assistantBlocks: ContentBlock[] = [];
    const aBlocks = turn.assistant as { type: string; data: unknown; toolCallId?: string }[];
    for (const block of aBlocks) {
      if (block.type === "text") {
        const content = (block.data as Record<string, unknown>)?.content as string ?? JSON.stringify(block.data);
        assistantBlocks.push({ type: "text", content });
      } else if (block.type === "reasoning") {
        const content = (block.data as Record<string, unknown>)?.content as string ?? "";
        if (content) assistantBlocks.push({ type: "reasoning", content });
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
        const data = (block.data ?? {}) as Record<string, unknown>;
        const existing = assistantBlocks.find(
          (b) => b.type === "tool_call" && b.data.toolCallId === block.toolCallId,
        );
        if (existing && existing.type === "tool_call") {
          // tool_result data is the full artifact: { tool_name, content/results/error/... }
          existing.data.toolResult = data;
          // Backfill toolName from result if missing on the tool_call
          if (!existing.data.toolName && typeof data.tool_name === "string") {
            existing.data.toolName = data.tool_name;
          }
        }
      }
    }
    if (assistantBlocks.length > 0) {
      messages.push({ role: "assistant", blocks: assistantBlocks, nodes: [] });
    }
  }
  return messages;
}

export function useChat() {
  const abortMapRef = useRef<Map<string, AbortController>>(new Map());

  const runStream = async (
    iter: AsyncIterable<AgentStreamEvent>,
    signal: AbortSignal,
    convId: string,
  ) => {
    try {
      for await (const event of iter) {
        if (signal.aborted) break;
        getState().processEventForConv(convId, event);
      }
    } catch (err) {
      if (signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Stream error:", err);
      if (String(getState().conversationId) === convId) {
        getState().setError(msg);
      }
    } finally {
      // Only clean up if our controller is still the active one (not replaced by resume/reconnect)
      if (abortMapRef.current.get(convId)?.signal === signal) {
        getState().removeStreamingConv(convId);
        abortMapRef.current.delete(convId);
      }
    }
  };

  const beginStream = (convId: string): AbortSignal => {
    abortMapRef.current.get(convId)?.abort();
    const ac = new AbortController();
    abortMapRef.current.set(convId, ac);
    getState().addStreamingConv(convId);
    getState().setStreaming(true);
    getState().setError(null);
    return ac.signal;
  };

  const loadHistory = async (id: bigint): Promise<void> => {
    const resp = await agentClient.getConversationHistory({ conversationId: id });
    getState().setMessages(parseHistoryTurns(resp.turns));
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
    const convId = String(s.conversationId);
    const isFirstMessage = s.messages.every((m) => m.role !== "user");

    s.addUserMessage(query);
    s.startAssistantMessage();
    const signal = beginStream(convId);

    // Update title before streaming — user may switch conversations during the stream
    if (isFirstMessage) {
      const title = query.length > 50 ? query.slice(0, 50) + "..." : query;
      dbUpdate(convId, { title });
      getState().loadConversations();
    }

    const stream = agentClient.chatStream(
      { conversationId: s.conversationId, query, agentType: s.agentType },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const hitlResume = useCallback(async (action: "approve" | "modify", feedback?: string) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = String(s.conversationId);

    s.resolveHumanReview();
    s.startAssistantMessage();
    const signal = beginStream(convId);

    const resumePayload: Record<string, unknown> = { action };
    if (action === "modify" && feedback) resumePayload.feedback = feedback;

    const stream = agentClient.hitlResumeStream(
      {
        conversationId: s.conversationId,
        resumeData: new TextEncoder().encode(JSON.stringify(resumePayload)),
      },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const editResend = useCallback(async (newQuery: string) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = String(s.conversationId);

    s.removeLastRound();
    s.addUserMessage(newQuery);
    s.startAssistantMessage();
    const signal = beginStream(convId);

    const stream = agentClient.editResendStream(
      { conversationId: s.conversationId, query: newQuery },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const regenerate = useCallback(async () => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = String(s.conversationId);

    s.removeLastAssistantMessage();
    s.startAssistantMessage();
    const signal = beginStream(convId);

    const stream = agentClient.regenerateStream(
      { conversationId: s.conversationId },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const cancelStream = useCallback(async () => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = String(s.conversationId);

    abortMapRef.current.get(convId)?.abort();
    abortMapRef.current.delete(convId);

    try {
      await agentClient.cancelStream({ conversationId: s.conversationId });
    } catch (err) {
      console.error("CancelStream RPC error:", err);
    }
  }, []);

  const selectConversation = useCallback(async (id: bigint) => {
    const s = getState();
    const targetId = String(id);

    if (String(s.conversationId) === targetId) return;

    // Abort any existing resume stream for the target BEFORE loading history,
    // so stale events can't leak in during the async loadHistory call.
    abortMapRef.current.get(targetId)?.abort();
    abortMapRef.current.delete(targetId);

    s.setConversationId(id);
    s.setError(null);

    const isTargetStreaming = s.streamingConvIds.has(targetId);

    try {
      await loadHistory(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      getState().setError(`Load history: ${msg}`);
      return;
    }

    if (isTargetStreaming) {
      // History excludes the current RUNNING request — always add an empty
      // assistant message for resume events to target.
      getState().startAssistantMessage();
      const signal = beginStream(targetId);
      const stream = agentClient.resumeStream({ conversationId: id }, { signal });
      runStream(stream, signal, targetId);
    } else {
      getState().setStreaming(false);
    }
  }, []);

  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream, selectConversation };
}
