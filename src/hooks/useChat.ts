import { useCallback } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore, type ContentBlock, type Message, type RawEvent, rebuildTasksFromHistory } from "@/stores/conversationStore";
import type { SourceCitation } from "@/stores/conversationStore";
import { useConversationListStore } from "@/stores/conversationListStore";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

const getState = () => useConversationStore.getState();

// ── Module-level singleton abort management ──
// Shared across all useChat() call sites — fixes the multi-instance bug.

const abortMap = new Map<string, AbortController>();

function beginStream(convId: string): AbortSignal {
  abortMap.get(convId)?.abort();
  const ac = new AbortController();
  abortMap.set(convId, ac);
  getState().addStreamingConv(convId);
  getState().setStreaming(true);
  getState().setError(null);
  return ac.signal;
}

async function runStream(
  iter: AsyncIterable<AgentStreamEvent>,
  signal: AbortSignal,
  convId: string,
) {
  try {
    for await (const event of iter) {
      if (signal.aborted) break;
      getState().processEventForConv(convId, event);
    }
  } catch (err) {
    if (signal.aborted) return;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Stream error:", err);
    if (getState().conversationId === convId) {
      getState().setError(msg);
    }
  } finally {
    // Only clean up if our controller is still the active one
    if (abortMap.get(convId)?.signal === signal) {
      getState().removeStreamingConv(convId);
      abortMap.delete(convId);
    }
  }
}

// ── History parsing ──

let messageIdCounter = 0;
function nextHistoryId(): string {
  return `hist-${Date.now()}-${++messageIdCounter}`;
}

function turnsToRawEvents(turns: { user: unknown[]; assistant: unknown[] }[]): RawEvent[] {
  const events: RawEvent[] = [];
  for (const turn of turns) {
    for (const block of turn.user as { type: string; data: unknown }[]) {
      events.push({ timestamp: 0, type: "history:" + block.type, data: block.data, role: "user" });
    }
    for (const block of turn.assistant as { type: string; data: unknown; toolCallId?: string }[]) {
      events.push({ timestamp: 0, type: "history:" + block.type, data: block.data, role: "assistant" });
    }
  }
  return events;
}

function parseHistoryTurns(turns: { user: unknown[]; assistant: unknown[] }[]): Message[] {
  const messages: Message[] = [];
  for (const turn of turns) {
    const userBlocks = turn.user as { type: string; data: unknown }[];
    const userText = userBlocks
      .filter((b) => b.type === "Message")
      .map((b) => (b.data as Record<string, unknown>)?.content ?? JSON.stringify(b.data))
      .join("\n");
    if (userText) {
      messages.push({ id: nextHistoryId(), role: "user", blocks: [{ type: "Message", content: userText }], nodes: [], workers: {}, sources: [] });
    }
    const assistantBlocks: ContentBlock[] = [];
    const turnSources: SourceCitation[] = [];
    const aBlocks = turn.assistant as { type: string; data: unknown; toolCallId?: string }[];
    for (const block of aBlocks) {
      if (block.type === "Message") {
        const content = (block.data as Record<string, unknown>)?.content as string ?? JSON.stringify(block.data);
        assistantBlocks.push({ type: "Message", content });
      } else if (block.type === "Reasoning") {
        const content = (block.data as Record<string, unknown>)?.content as string ?? "";
        if (content) assistantBlocks.push({ type: "Reasoning", content });
      } else if (block.type === "ToolCallStart") {
        const data = block.data as Record<string, unknown>;
        assistantBlocks.push({
          type: "ToolCallStart",
          data: {
            toolCallId: block.toolCallId || "",
            toolName: (data?.name as string) ?? "",
            toolInput: (data?.input as Record<string, unknown>) ?? {},
          },
        });
      } else if (block.type === "HumanReview") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        assistantBlocks.push({
          type: "human_review",
          data: { payload: data, resolved: true },
        });
      } else if (block.type === "SourcesCited") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        const sources = (data.sources as SourceCitation[]) ?? [];
        turnSources.push(...sources);
      } else if (block.type === "ToolCallResult") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        const existing = assistantBlocks.find(
          (b) => b.type === "ToolCallStart" && b.data.toolCallId === block.toolCallId,
        );
        if (existing && existing.type === "ToolCallStart") {
          existing.data.toolResult = data;
          if (!existing.data.toolName && typeof data.tool_name === "string") {
            existing.data.toolName = data.tool_name;
          }
        }
      }
    }
    // Inject TaskList anchor if this message has a create_task tool call
    const hasCreateTask = assistantBlocks.some(
      (b) => b.type === "ToolCallStart" && b.data.toolName === "create_task",
    );
    if (hasCreateTask && !assistantBlocks.some((b) => b.type === "TaskList")) {
      assistantBlocks.push({ type: "TaskList" });
    }
    if (assistantBlocks.length > 0) {
      messages.push({ id: nextHistoryId(), role: "assistant", blocks: assistantBlocks, nodes: [], workers: {}, sources: turnSources });
    }
  }
  return messages;
}

// ── Hook ──

export function useChat() {
  const loadHistory = async (id: string) => {
    const resp = await agentClient.getConversationHistory({ conversationId: BigInt(id) });
    const messages = parseHistoryTurns(resp.turns);
    // If there's a pending review, mark the last HumanReview as unresolved
    // ONLY if it's the very last block in the last message (no subsequent content
    // means the agent hasn't continued after the review).
    if (resp.pendingReview && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1];
      if (lastBlock?.type === "human_review") {
        lastMsg.blocks[lastMsg.blocks.length - 1] = {
          type: "human_review",
          data: { ...lastBlock.data, resolved: false },
        };
      }
    }
    // Set messages, tasks, and history events in a single state update
    const tasks = rebuildTasksFromHistory(messages);
    const rawEvents = turnsToRawEvents(resp.turns as { user: unknown[]; assistant: unknown[] }[]);
    useConversationStore.setState({ messages, rawEvents, tasks });
    return resp;
  };

  const createConversation = useCallback(async () => {
    getState().reset();
    const reply = await agentClient.createConversation({});
    const id = String(reply.conversationId);
    getState().setConversationId(id);
    useConversationListStore.getState().add(id, getState().agentType);
    return id;
  }, []);

  const sendMessage = useCallback(async (query: string) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;
    const isFirstMessage = s.messages.every((m) => m.role !== "user");

    s.addUserMessage(query);
    s.startAssistantMessage();
    const signal = beginStream(convId);

    if (isFirstMessage) {
      const title = query.length > 50 ? query.slice(0, 50) + "..." : query;
      useConversationListStore.getState().update(convId, { title });
    }

    const stream = agentClient.chatStream(
      { conversationId: BigInt(convId), query, agentType: s.agentType },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const hitlResume = useCallback(async (action: "approve" | "modify", feedback?: string) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;

    s.resolveHumanReview();
    s.startAssistantMessage();
    const signal = beginStream(convId);

    const resumePayload: Record<string, unknown> = { action };
    if (action === "modify" && feedback) resumePayload.feedback = feedback;

    const stream = agentClient.hitlResumeStream(
      {
        conversationId: BigInt(convId),
        resumeData: new TextEncoder().encode(JSON.stringify(resumePayload)),
      },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const editResend = useCallback(async (newQuery: string) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;

    s.removeLastRound();
    s.addUserMessage(newQuery);
    s.startAssistantMessage();
    const signal = beginStream(convId);

    const stream = agentClient.editResendStream(
      { conversationId: BigInt(convId), query: newQuery },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const regenerate = useCallback(async () => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;

    s.removeLastAssistantMessage();
    s.startAssistantMessage();
    const signal = beginStream(convId);

    const stream = agentClient.regenerateStream(
      { conversationId: BigInt(convId) },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const cancelStream = useCallback(async () => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;

    abortMap.get(convId)?.abort();

    try {
      await agentClient.cancelStream({ conversationId: BigInt(convId) });
    } catch (err) {
      console.error("CancelStream RPC error:", err);
    }
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    const s = getState();
    if (s.conversationId === id) return;

    // Abort any existing resume stream for the target
    abortMap.get(id)?.abort();
    abortMap.delete(id);

    s.setConversationId(id);
    s.setError(null);
    s.setLoadingHistory(true);

    // Restore agentType from the conversation list
    const conv = useConversationListStore.getState().conversations.find((c) => c.id === id);
    if (conv) s.setAgentType(conv.agentType);

    let resp;
    try {
      resp = await loadHistory(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      getState().setError(`Load history: ${msg}`);
      getState().setLoadingHistory(false);
      return;
    }

    getState().setLoadingHistory(false);

    const shouldResume = s.streamingConvIds.has(id) || resp.isRunning;

    if (shouldResume) {
      getState().startAssistantMessage();
      const signal = beginStream(id);
      const stream = agentClient.resumeStream({ conversationId: BigInt(id) }, { signal });
      runStream(stream, signal, id);
    } else {
      getState().setStreaming(false);
    }
  }, []);

  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream, selectConversation };
}
