import { useCallback } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore, type AgentTask, type ContentBlock, type Message, type RawEvent, rebuildTasksFromHistory, getLatestSeq, resetLatestSeq } from "@/stores/conversationStore";
import type { SourceCitation, SheetArtifactData, SheetPlanDimension } from "@/stores/conversationStore";
import type { ChatAttachment } from "@/types/chatAttachment";
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

// Reset per-turn seq tracker before initiating a new turn
// (ChatStream / EditResend / Regenerate / HitlResume-modify).
// Note: HitlResume-approve keeps seq since the backend reuses the request_id.
function beginNewTurn(convId: string): AbortSignal {
  resetLatestSeq(convId);
  return beginStream(convId);
}

function isAlreadyExists(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("already_exists") || msg.includes("ALREADY_EXISTS");
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
    // Backend has an active stream for this conversation (spec §6.6) —
    // don't retry ChatStream, fall back to ResumeStream(from_seq=0) to
    // pick up the existing stream from the beginning.
    if (isAlreadyExists(err)) {
      console.warn(`Active stream exists for conv ${convId}, falling back to resumeStream(from_seq=0)`);
      const resumeIter = agentClient.resumeStream(
        { conversationId: BigInt(convId), fromSeq: 0n },
        { signal },
      );
      // Tail-call: delegate cleanup to the resumed runStream invocation.
      await runStream(resumeIter, signal, convId);
      return;
    }
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

/**
 * Rebuild tasks from TaskUpdate custom events in raw history turns.
 * This handles agents (e.g. SuperAgent) that hide planning tools via _hidden_tools,
 * where ToolCallStart/ToolCallResult for create_task/update_task are absent from history
 * but TaskUpdate custom events are still recorded.
 */
function rebuildTasksFromTurns(turns: { user: unknown[]; assistant: unknown[] }[]): AgentTask[] {
  let tasks: AgentTask[] = [];
  for (const turn of turns) {
    for (const block of turn.assistant as { type: string; data: unknown }[]) {
      if (block.type !== "TaskUpdate") continue;
      const data = (block.data ?? {}) as Record<string, unknown>;
      const action = data.action as string;
      if (action === "create" && Array.isArray(data.tasks)) {
        tasks = data.tasks as AgentTask[];
      } else if (action === "update" && typeof data.task_id === "number" && data.status) {
        tasks = tasks.map((t) =>
          t.id === data.task_id ? { ...t, status: data.status as AgentTask["status"] } : t,
        );
      } else if (action === "reset") {
        tasks = [];
      }
    }
  }
  return tasks;
}

function parseHistoryTurns(turns: { user: unknown[]; assistant: unknown[] }[]): Message[] {
  const messages: Message[] = [];
  for (const turn of turns) {
    const userBlocks = turn.user as { type: string; data: unknown }[];
    const userTextBlocks = userBlocks
      .filter((b) => b.type === "Message")
      .map((b) => ({ type: "Message", content: ((b.data as Record<string, unknown>)?.content as string) ?? JSON.stringify(b.data) }) as ContentBlock);
    const fileBlocks = userBlocks
      .filter((b) => b.type === "File")
      .map((b) => {
        const data = (b.data ?? {}) as Record<string, unknown>;
        const url = typeof data.url === "string" ? data.url : "";
        const mimeType = typeof data.mime_type === "string" ? data.mime_type : "";
        const filename = typeof data.filename === "string" ? data.filename : "";
        if (!url || !mimeType) return null;
        return { type: "File", data: { filename, mimeType, url } } as ContentBlock;
      })
      .filter((b): b is ContentBlock => b !== null);
    if (userTextBlocks.length > 0 || fileBlocks.length > 0) {
      messages.push({ id: nextHistoryId(), role: "user", blocks: [...userTextBlocks, ...fileBlocks], nodes: [], workers: {}, sources: [] });
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
      } else if (block.type === "OutlineGenerated") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        assistantBlocks.push({
          type: "SlideOutline",
          data: { outline: (data.outline as Record<string, unknown>) ?? {} },
        });
      } else if (block.type === "DesignSystemGenerated") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        assistantBlocks.push({
          type: "SlideDesignSystem",
          data: { summary: (data.summary as string) ?? "" },
        });
      } else if (block.type === "MemoryUpdate") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        const field = data.field as string | undefined;
        const content = data.content as string | undefined;
        if ((field === "soul" || field === "identity") && content) {
          assistantBlocks.push({
            type: "MemoryUpdate",
            data: { field, content },
          });
        }
      } else if (block.type === "ArtifactCreated") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        const artifactId = (data.artifact_id as string) ?? "";
        if (!artifactId) continue;
        const newData: SheetArtifactData = {
          artifactId,
          artifactType: (data.artifact_type as string) ?? "TEXT",
          name: (data.name as string) ?? artifactId.split("/").pop() ?? artifactId,
          producerNodeId: (data.producer_node_id as string) ?? "",
          content: (data.content as Record<string, unknown>) ?? {},
          createdAt: 0,
        };
        const existingIdx = assistantBlocks.findIndex(
          (b) => b.type === "SheetArtifact" && b.data.artifactId === artifactId,
        );
        if (existingIdx >= 0) {
          assistantBlocks[existingIdx] = { type: "SheetArtifact", data: newData };
        } else {
          assistantBlocks.push({ type: "SheetArtifact", data: newData });
        }
      } else if (block.type === "ArtifactInvalidated") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        const artifactId = (data.artifact_id as string) ?? "";
        if (!artifactId) continue;
        for (let i = 0; i < assistantBlocks.length; i++) {
          const b = assistantBlocks[i];
          if (b.type === "SheetArtifact" && b.data.artifactId === artifactId) {
            assistantBlocks[i] = {
              type: "SheetArtifact",
              data: {
                ...b.data,
                invalidated: true,
                invalidatedReason: (data.reason as string) ?? "",
              },
            };
          }
        }
      } else if (block.type === "TaskPlanned") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        const nodes = Array.isArray(data.nodes) ? (data.nodes as Array<Record<string, unknown>>) : [];
        if (nodes.length === 0) continue;
        const dims: SheetPlanDimension[] = nodes.map((n) => ({
          id: (n.node_id as string) ?? (n.id as string) ?? "",
          title: (n.objective as string) ?? (n.title as string) ?? (n.task_type as string) ?? "",
          role: (n.worker_role as string) ?? undefined,
          status: "pending",
        }));
        // 同 conversationStore：多 plan_analysis 的 merge / replace / append 逻辑
        const newIds = new Set(dims.map((d) => d.id));
        let mergeIdx = -1;
        let isReplace = false;
        for (let i = 0; i < assistantBlocks.length; i++) {
          const b = assistantBlocks[i];
          if (b.type !== "SheetPlan") continue;
          const existIds = new Set(b.data.dimensions.map((d) => d.id));
          const overlap = [...newIds].some((id) => existIds.has(id));
          if (overlap) {
            mergeIdx = i;
            isReplace = [...newIds].every((id) => existIds.has(id))
              && [...existIds].every((id) => newIds.has(id));
            break;
          }
        }
        if (mergeIdx < 0) {
          assistantBlocks.push({ type: "SheetPlan", data: { dimensions: dims } });
        } else if (isReplace) {
          assistantBlocks[mergeIdx] = { type: "SheetPlan", data: { dimensions: dims } };
        } else {
          const existing = assistantBlocks[mergeIdx];
          if (existing.type === "SheetPlan") {
            const existIds = new Set(existing.data.dimensions.map((d) => d.id));
            assistantBlocks[mergeIdx] = {
              type: "SheetPlan",
              data: {
                dimensions: [
                  ...existing.data.dimensions,
                  ...dims.filter((d) => !existIds.has(d.id)),
                ],
              },
            };
          }
        }
      } else if (
        block.type === "TaskStarted" ||
        block.type === "TaskCompleted" ||
        block.type === "TaskFailed"
      ) {
        const data = (block.data ?? {}) as Record<string, unknown>;
        const nodeId = (data.node_id as string) ?? "";
        if (!nodeId) continue;
        const nextStatus: SheetPlanDimension["status"] =
          block.type === "TaskStarted" ? "running"
          : block.type === "TaskCompleted" ? "done"
          : "failed";
        const error = block.type === "TaskFailed" ? ((data.error as string) ?? "") : undefined;
        for (let i = 0; i < assistantBlocks.length; i++) {
          const b = assistantBlocks[i];
          if (b.type !== "SheetPlan") continue;
          assistantBlocks[i] = {
            type: "SheetPlan",
            data: {
              dimensions: b.data.dimensions.map((d) =>
                d.id === nodeId
                  ? { ...d, status: nextStatus, ...(error != null ? { error } : {}) }
                  : d,
              ),
            },
          };
        }
      }
    }
    // Inject TaskList anchor if this message has a create_task tool call
    // or a TaskUpdate "create" custom event (for agents that hide planning tools)
    const hasCreateTask = assistantBlocks.some(
      (b) => b.type === "ToolCallStart" && b.data.toolName === "create_task",
    );
    const hasTaskUpdateCreate = aBlocks.some(
      (b) => b.type === "TaskUpdate" && (b.data as Record<string, unknown>)?.action === "create",
    );
    if ((hasCreateTask || hasTaskUpdateCreate) && !assistantBlocks.some((b) => b.type === "TaskList")) {
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
    // Try tool-result-based reconstruction first, then fall back to TaskUpdate custom events
    // (needed for agents like SuperAgent that hide planning tools via _hidden_tools)
    let tasks = rebuildTasksFromHistory(messages);
    if (tasks.length === 0) {
      tasks = rebuildTasksFromTurns(resp.turns as { user: unknown[]; assistant: unknown[] }[]);
    }
    const rawEvents = turnsToRawEvents(resp.turns as { user: unknown[]; assistant: unknown[] }[]);
    useConversationStore.setState({ messages, rawEvents, tasks });
    return resp;
  };

  const createConversation = useCallback(async () => {
    getState().reset();
    const reply = await agentClient.createConversation({});
    const id = String(reply.conversationId);
    getState().setConversationId(id);
    useConversationListStore.getState().add(id, getState().agentType, getState().systemPromptId ?? undefined);
    return id;
  }, []);

  const sendMessage = useCallback(async (query: string, files: ChatAttachment[] = []) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;
    const isFirstMessage = s.messages.every((m) => m.role !== "user");
    const requestStartedAt = Date.now();

    s.addUserMessage(query, files);
    s.startAssistantMessage(requestStartedAt);
    const signal = beginNewTurn(convId);

    if (isFirstMessage) {
      const titleSource = query || files[0]?.filename || "New chat";
      const title = titleSource.length > 50 ? titleSource.slice(0, 50) + "..." : titleSource;
      useConversationListStore.getState().update(convId, { title });
    }

    const extraContext = Object.keys(s.extraContext).length > 0 ? s.extraContext : undefined;
    const stream = agentClient.chatStream(
      {
        conversationId: BigInt(convId),
        query,
        agentType: s.agentType,
        files: files.map((file) => ({
          mimeType: file.mimeType,
          url: file.url,
          filename: file.filename,
          data: new Uint8Array(),
        })),
        systemPromptId: s.systemPromptId ? BigInt(s.systemPromptId) : 0n,
        extraContext,
      },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const hitlResume = useCallback(async (action: "approve" | "modify", feedback?: string) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;
    const requestStartedAt = Date.now();

    s.resolveHumanReview();
    s.startAssistantMessage(requestStartedAt);
    // `modify` starts a new turn (new request_id, seq resets to 1 on backend).
    // `approve` continues the current turn (same request_id), so keep seq.
    const signal = action === "modify" ? beginNewTurn(convId) : beginStream(convId);

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
    const requestStartedAt = Date.now();

    s.removeLastRound();
    s.addUserMessage(newQuery);
    s.startAssistantMessage(requestStartedAt);
    const signal = beginNewTurn(convId);

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
    const requestStartedAt = Date.now();

    s.removeLastAssistantMessage();
    s.startAssistantMessage(requestStartedAt);
    const signal = beginNewTurn(convId);

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
    if (conv) {
      s.setAgentType(conv.agentType);
      s.setSystemPromptId(conv.systemPromptId ?? null);
    }

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
      // Preserve seq across selectConversation so resume picks up where we left off.
      // 0n means we never received an event with seq (or legacy server) → full replay.
      const fromSeq = getLatestSeq(id);
      const signal = beginStream(id);
      const stream = agentClient.resumeStream(
        { conversationId: BigInt(id), fromSeq },
        { signal },
      );
      runStream(stream, signal, id);
    } else {
      getState().setStreaming(false);
    }
  }, []);

  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream, selectConversation };
}
