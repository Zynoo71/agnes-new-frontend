import { useCallback } from "react";
import { Code, ConnectError } from "@connectrpc/connect";
import { agentClient } from "@/grpc/client";
import { createAgnesConversation } from "@/api/agnesConversation";
import { useConversationStore, type AgentTask, type ContentBlock, type Message, type RawEvent, type ReviewState, rebuildTasksFromHistory, getLatestSeq, resetLatestSeq, applyWorkerContentBlock, normalizeWorkerBlockType, extractUserBlockMessageId, userMessageIdFromBackend, parseHitlResumeBlock, resolveReviewsByHitlBlocks, parseGenerationArtifact } from "@/stores/conversationStore";
import type { SourceCitation, SheetArtifactData, SheetPlanDimension, WorkerState } from "@/stores/conversationStore";
import type { ChatAttachment } from "@/types/chatAttachment";
import { useConversationListStore } from "@/stores/conversationListStore";
import { PENDING_SKILLS_CONV_ID, useChatSelectedSkillsStore } from "@/stores/chatSelectedSkillsStore";
import { hydrateConversationSkillsFromServer, persistConversationSkillSelections } from "@/lib/conversationSkillSync";
import { syncExtraContextDisallowedSkills } from "@/config/agentAdditionalDisallowedSkills";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

const getState = () => useConversationStore.getState();

/**
 * 当前 conversation 在 chatSelectedSkillsStore 中的选用 → proto SelectedSkill。
 * 后端会校验/过滤，此处全量上送，不在前端做权限判断。
 */
function pickSelectedSkillsForRequest(convId: string): { skillId: string; version: string }[] {
  const list = useChatSelectedSkillsStore.getState().get(convId);
  return list.filter((it) => it.skillId).map((it) => ({ skillId: it.skillId, version: it.version || "" }));
}

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

// Reset per-turn seq tracker before initiating a new turn. Per spec §8.9,
// HitlResume actions (approve / modify / reject) all open new turns now —
// the legacy "approve reuses request_id" path was removed backend-side.
function beginNewTurn(convId: string): AbortSignal {
  resetLatestSeq(convId);
  return beginStream(convId);
}

// §6.6 AGENT_STREAM_BUSY envelope code — 同会话已有活跃流，前端必须改走 ResumeStream。
const AGENT_STREAM_BUSY_CODE = "070301";

// Pull business error_code out of ConnectError.details without importing the generated
// schema (src/gen/common/v1/error_pb.ts contains a plain `enum` incompatible with
// erasableSyntaxOnly). Fall back to JSON debug; both snake_case and camelCase observed.
function getEnvelopeCode(err: unknown): string | null {
  if (!(err instanceof ConnectError)) return null;
  for (const d of err.details) {
    if (!("type" in d) || d.type !== "common.v1.ErrorDetail") continue;
    const debug = (d as { debug?: unknown }).debug;
    if (!debug || typeof debug !== "object") continue;
    const code =
      (debug as { error_code?: unknown }).error_code ??
      (debug as { errorCode?: unknown }).errorCode;
    if (typeof code === "string") return code;
  }
  return null;
}

// "服务端已有活跃流"信号：gRPC code = AlreadyExists 或业务 envelope code = 070301。
// 保留字符串兜底以防网关透传失真。
function isStreamBusy(err: unknown): boolean {
  if (err instanceof ConnectError) {
    if (err.code === Code.AlreadyExists) return true;
    if (getEnvelopeCode(err) === AGENT_STREAM_BUSY_CODE) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("ALREADY_EXISTS") || msg.includes("already_exists");
}

// 网络/传输层断线，适合用 from_seq=latestSeq 重连续播（spec §6.5）。
// 不含 Canceled（通常是自己 abort 的），不含业务错（AgentError 走事件帧，不进 catch）。
function isRetriableDisconnect(err: unknown): boolean {
  if (!(err instanceof ConnectError)) return false;
  return err.code === Code.Unavailable || err.code === Code.Unknown;
}

function describeErr(err: unknown): string {
  if (err instanceof ConnectError) return `code=${Code[err.code]}`;
  return err instanceof Error ? err.message : String(err);
}

async function runStream(
  iter: AsyncIterable<AgentStreamEvent>,
  signal: AbortSignal,
  convId: string,
  isResumeRetry = false,
) {
  try {
    for await (const event of iter) {
      if (signal.aborted) break;
      getState().processEventForConv(convId, event);
    }
  } catch (err) {
    if (signal.aborted) return;

    // §6.6 冲突路径：from_seq=0 从头回放 Redis buffer + 续实时。
    if (isStreamBusy(err)) {
      console.warn(`[useChat] stream busy for conv ${convId}, pivoting to resumeStream(from_seq=0)`);
      const resumeIter = agentClient.resumeStream(
        { conversationId: BigInt(convId), fromSeq: 0n },
        { signal },
      );
      await runStream(resumeIter, signal, convId, true);
      return;
    }

    // §6.5 中途断线：用 latestSeq 只拉增量；已是 resume 重试则不再嵌套避免死循环。
    if (!isResumeRetry && isRetriableDisconnect(err)) {
      const fromSeq = getLatestSeq(convId);
      console.warn(`[useChat] stream dropped for conv ${convId} (${describeErr(err)}), resuming from seq=${fromSeq}`);
      const resumeIter = agentClient.resumeStream(
        { conversationId: BigInt(convId), fromSeq },
        { signal },
      );
      await runStream(resumeIter, signal, convId, true);
      return;
    }

    console.error("Stream error:", err);
    if (getState().conversationId === convId) {
      getState().setError(describeErr(err));
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

// §8.9: ConversationTurn.status → HumanReview card state. Card defaults to
// `decided` for unknown/empty status (history default = the agent ran past it).
// `pending` (from `interrupted`) is the only state where decision buttons render.
function turnStatusToReviewState(status: string | undefined): ReviewState {
  switch (status) {
    case "interrupted": return "pending";
    case "ignored":     return "ignored";
    case "cancelled":   return "cancelled";
    case "completed":
    case "failed":
    case "exhausted":
    default:            return "decided";
  }
}

function parseHistoryTurns(turns: { user: unknown[]; assistant: unknown[]; status?: string }[]): Message[] {
  const messages: Message[] = [];
  const hitlBlocksAll: ContentBlock[] = [];
  for (const turn of turns) {
    const reviewState = turnStatusToReviewState(turn.status);
    const userBlocks = turn.user as Array<Record<string, unknown> & { type: string; data: unknown }>;
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
    // §8.9: history `turn.user[]` may carry HitlResume blocks alongside Message/File.
    const hitlBlocks: ContentBlock[] = userBlocks
      .filter((b) => b.type === "HitlResume")
      .map((b) => parseHitlResumeBlock((b.data ?? {}) as Record<string, unknown>))
      .filter((b): b is ContentBlock => b !== null);
    hitlBlocksAll.push(...hitlBlocks);
    if (userTextBlocks.length > 0 || fileBlocks.length > 0 || hitlBlocks.length > 0) {
      // Derive the user message id from the backend message_id so a later Resume
      // HumanInput replay can be deduplicated against this bubble.
      const backendMsgId = extractUserBlockMessageId(userBlocks);
      const userId = backendMsgId ? userMessageIdFromBackend(backendMsgId) : nextHistoryId();
      messages.push({ id: userId, role: "user", blocks: [...userTextBlocks, ...fileBlocks, ...hitlBlocks], nodes: [], workers: {}, sources: [] });
    }
    const assistantBlocks: ContentBlock[] = [];
    const turnSources: SourceCitation[] = [];
    let workers: Record<string, WorkerState> = {};
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
        const blockRec = block as Record<string, unknown>;
        const eventId = typeof blockRec.event_id === "string" ? blockRec.event_id
          : typeof blockRec.eventId === "string" ? blockRec.eventId
          : undefined;
        assistantBlocks.push({
          type: "human_review",
          data: { payload: data, state: reviewState, event_id: eventId },
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
      } else if (block.type === "PromptEnhanced") {
        const data = (block.data ?? {}) as Record<string, unknown>;
        assistantBlocks.push({
          type: "PromptEnhanced",
          data: {
            originalPrompt: (data.original_prompt as string) ?? "",
            enhancedPrompt: (data.enhanced_prompt as string) ?? "",
            message: data.message as string | undefined,
            mediaType: data.media_type as string | undefined,
            style: data.style as string | undefined,
          },
        });
      } else if (block.type === "GenerationArtifact") {
        // History replay — agent_artifact rows are union'd back into the turn
        // stream and surface as the same wire shape as live SSE.
        const data = (block.data ?? {}) as Record<string, unknown>;
        const blockRec = block as Record<string, unknown>;
        // history blocks carry event_id at the envelope level; rebuild a
        // synthetic envelope so parseGenerationArtifact can read it uniformly.
        const eventId = typeof blockRec.event_id === "string" ? blockRec.event_id
          : typeof blockRec.eventId === "string" ? blockRec.eventId
          : "";
        const parsed = parseGenerationArtifact({ event_id: eventId }, data);
        if (parsed) assistantBlocks.push({ type: "GenerationArtifact", data: parsed });
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
      } else if (normalizeWorkerBlockType(block.type)) {
        workers = applyWorkerContentBlock(
          workers,
          normalizeWorkerBlockType(block.type)!,
          (block.data ?? {}) as Record<string, unknown>,
        );
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
      messages.push({ id: nextHistoryId(), role: "assistant", blocks: assistantBlocks, nodes: [], workers, sources: turnSources });
    }
  }
  // §8.9 #4: link HitlResume blocks back to their HumanReview cards via event_id.
  // (History HumanReview is already resolved=true; this is a no-op today but keeps
  // the pipeline consistent should that default ever change.)
  return resolveReviewsByHitlBlocks(messages, hitlBlocksAll);
}

// ── Hook ──

export function useChat() {
  const loadHistory = async (id: string) => {
    const resp = await agentClient.getConversationHistory({ conversationId: BigInt(id) });
    const messages = parseHistoryTurns(resp.turns);
    // §8.9: turn.status="interrupted" already maps to state="pending" inside
    // parseHistoryTurns. The legacy `resp.pendingReview` flag is a fallback for
    // older backends that don't populate turn.status — only flip the very last
    // HumanReview to pending if no turn.status told us so.
    if (resp.pendingReview && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const lastBlock = lastMsg.blocks[lastMsg.blocks.length - 1];
      if (lastBlock?.type === "human_review" && lastBlock.data.state === "decided") {
        lastMsg.blocks[lastMsg.blocks.length - 1] = {
          type: "human_review",
          data: { ...lastBlock.data, state: "pending" },
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
    const id = await createAgnesConversation();
    getState().setConversationId(id);
    useConversationListStore.getState().add(id, getState().agentType, getState().systemPromptId ?? undefined);
    const skillsStore = useChatSelectedSkillsStore.getState();
    const pending = skillsStore.get(PENDING_SKILLS_CONV_ID);
    if (pending.length > 0) {
      skillsStore.setForConv(id, pending);
      skillsStore.clear(PENDING_SKILLS_CONV_ID);
    }
    return id;
  }, []);

  const sendMessage = useCallback(async (query: string, files: ChatAttachment[] = []) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;
    const isFirstMessage = s.messages.every((m) => m.role !== "user");
    const requestStartedAt = Date.now();

    // §8.9 IGNORED: if a HumanReview was pending, the backend will mark the old
    // turn as `ignored` once this ChatStream lands. Optimistically grey out the
    // card so the UI flips immediately instead of waiting for the next history
    // refresh.
    s.dismissPendingHumanReviews();
    s.addUserMessage(query, files);
    s.startAssistantMessage(requestStartedAt);
    const signal = beginNewTurn(convId);

    if (isFirstMessage) {
      const titleSource = query || files[0]?.filename || "New chat";
      const title = titleSource.length > 50 ? titleSource.slice(0, 50) + "..." : titleSource;
      useConversationListStore.getState().update(convId, { title });
    }

    try {
      await persistConversationSkillSelections(convId);
    } catch (e) {
      console.warn("[useChat] persist conversation skills before ChatStream failed", e);
    }

    const extraContext = Object.keys(s.extraContext).length > 0 ? s.extraContext : undefined;
    // Local toggle for hitting the real GrpcReservationClient (credits 扣费).
    // VITE_BILLING_ENABLED=true → backend `billing_enabled=true` →
    // _build_subscription_quota_client(); anything else → null (no-op).
    const billingEnabled = import.meta.env.VITE_BILLING_ENABLED === "true" ? true : undefined;
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
        selectedSkills: pickSelectedSkillsForRequest(convId),
        billingEnabled,
      },
      { signal },
    );
    await runStream(stream, signal, convId);
  }, []);

  const hitlResume = useCallback(async (
    action: "approve" | "modify",
    feedback?: string,
    data?: Record<string, unknown>,
  ) => {
    const s = getState();
    if (!s.conversationId) return;
    const convId = s.conversationId;
    const requestStartedAt = Date.now();

    s.resolveHumanReview(action, feedback);
    s.startAssistantMessage(requestStartedAt);
    // §8.9: approve / modify / reject 一律开新 turn，新 request_id，seq 重置为 1。
    const signal = beginNewTurn(convId);

    const resumePayload: Record<string, unknown> = { action };
    if (action === "modify" && feedback) resumePayload.feedback = feedback;
    if (action === "modify" && data) resumePayload.data = data;

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

    try {
      await persistConversationSkillSelections(convId);
    } catch (e) {
      console.warn("[useChat] persist conversation skills before EditResend failed", e);
    }

    const stream = agentClient.editResendStream(
      {
        conversationId: BigInt(convId),
        query: newQuery,
        selectedSkills: pickSelectedSkillsForRequest(convId),
      },
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

    try {
      await persistConversationSkillSelections(convId);
    } catch (e) {
      console.warn("[useChat] persist conversation skills before Regenerate failed", e);
    }

    const stream = agentClient.regenerateStream(
      {
        conversationId: BigInt(convId),
        selectedSkills: pickSelectedSkillsForRequest(convId),
      },
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

    useChatSelectedSkillsStore.getState().clear(PENDING_SKILLS_CONV_ID);

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
      const ec = getState().extraContext;
      getState().setExtraContext(syncExtraContextDisallowedSkills(ec, conv.agentType));
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
    void hydrateConversationSkillsFromServer(id);

    const shouldResume = s.streamingConvIds.has(id) || resp.isRunning;

    if (shouldResume) {
      getState().startAssistantMessage();
      // loadHistory already wiped per-conv UI state; the right thing is a full
      // Redis replay of the current turn (from_seq=0), not picking up from a
      // latestSeq that was tracked by a previous visit to this conv. Reset the
      // counter so subsequent in-stream disconnects measure from this resume.
      resetLatestSeq(id);
      const signal = beginStream(id);
      const stream = agentClient.resumeStream(
        { conversationId: BigInt(id), fromSeq: 0n },
        { signal },
      );
      runStream(stream, signal, id);
    } else {
      getState().setStreaming(false);
    }
  }, []);

  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream, selectConversation };
}
