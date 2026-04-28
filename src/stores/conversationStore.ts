import { create } from "zustand";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";
import type { ChatAttachment } from "@/types/chatAttachment";
import { pickWorkerCharacter, type WorkerCharacter } from "@/workerCharacters";

// ── Helpers ──

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

function tryDecodeJson(bytes: Uint8Array | string): unknown {
  try {
    const text = typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
  }
}

function asRecord(val: unknown): Record<string, unknown> {
  return typeof val === "object" && val !== null ? (val as Record<string, unknown>) : {};
}

// EmitEvent envelope {event_id, data: {...}} → flatten to the inner data.
// Framework events and PixaLegacyEvent keep flat shape (no event_id), so they pass through untouched.
function unwrapEmitEvent(payload: Record<string, unknown>): Record<string, unknown> {
  if (
    typeof payload.event_id === "string" &&
    payload.event_id.startsWith("evt_") &&
    payload.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data)
  ) {
    return payload.data as Record<string, unknown>;
  }
  return payload;
}

// Per-turn max seq tracking for ResumeStream(from_seq).
// Lives outside the store (non-reactive); cleared on turn-end events
// (AgentEnd/AgentError/AgentCancelled) and on new-turn initiation.
const latestSeqByConv = new Map<string, bigint>();

export function getLatestSeq(convId: string): bigint {
  return latestSeqByConv.get(convId) ?? 0n;
}

export function resetLatestSeq(convId: string): void {
  latestSeqByConv.delete(convId);
}

// ── Types ──

export interface ToolCallData {
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  streamStdout?: string;
  streamStderr?: string;
}

export interface NodeData {
  node: string;
  status: "running" | "done";
}

// §8.9: HumanReview card lifecycle. Sourced from `turn.status` on history,
// or set by client-side actions for the live turn.
//   pending   — INTERRUPTED, awaiting user decision (decision buttons shown)
//   decided   — user clicked approve/modify/reject (or normal completion)
//   cancelled — user explicitly cancelled the stream
//   ignored   — user bypassed the card by sending a new ChatStream
export type ReviewState = "pending" | "decided" | "cancelled" | "ignored";

export interface HumanReviewData {
  payload: Record<string, unknown>;
  state: ReviewState;
  // EmitEvent envelope event_id (e.g. "evt_..."). Used as the match key for
  // HitlResume.resolves_event_id (spec §8.9). Optional for legacy data.
  event_id?: string;
  // §8.9: when this review is resolved by a HitlResume block, the action and
  // optional feedback are merged here so the card itself can render the
  // decision (no separate user-side chip).
  resumeAction?: HitlAction;
  resumeFeedback?: string;
}

export type HitlAction = "approve" | "modify" | "reject";

export interface HitlResumeData {
  action: HitlAction;
  resolves_event_id: string;
  feedback?: string;
  modify_data?: Record<string, unknown> | null;
}

export type WorkerItem =
  | { kind: "text"; messageId: string; content: string; finalized: boolean }
  | {
      kind: "tool";
      toolName: string;
      toolInput: Record<string, unknown>;
      toolResult?: Record<string, unknown>;
    };

export interface WorkerState {
  workerId: string;
  description: string;
  status: "running" | "done" | "error";
  character: WorkerCharacter;
  characterIndex: number;
  items: WorkerItem[];
  summary?: string;
  error?: string;
}

export interface AgentTask {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "done";
  result: string | null;
  depends_on: number[];
}

// ── Worker items helpers ──

// Tool boundary closes a text segment; scanning past it would cross into a prior segment.
function findOpenTextSegment(items: WorkerItem[], messageId: string, requireOpen: boolean): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "tool") return -1;
    if (it.messageId === messageId && (!requireOpen || !it.finalized)) return i;
  }
  return -1;
}

function appendWorkerDelta(items: WorkerItem[], messageId: string, content: string): WorkerItem[] {
  if (!content) return items;
  const idx = findOpenTextSegment(items, messageId, true);
  if (idx >= 0) {
    const next = [...items];
    const it = next[idx] as Extract<WorkerItem, { kind: "text" }>;
    next[idx] = { ...it, content: it.content + content };
    return next;
  }
  return [...items, { kind: "text", messageId, content, finalized: false }];
}

function finalizeWorkerMessage(items: WorkerItem[], messageId: string, content: string): WorkerItem[] {
  const idx = findOpenTextSegment(items, messageId, false);
  if (idx >= 0) {
    const next = [...items];
    const it = next[idx] as Extract<WorkerItem, { kind: "text" }>;
    next[idx] = { ...it, content, finalized: true };
    return next;
  }
  return [...items, { kind: "text", messageId, content, finalized: true }];
}

function finalizeAllText(items: WorkerItem[]): WorkerItem[] {
  let changed = false;
  const next = items.map((it) => {
    if (it.kind === "text" && !it.finalized) {
      changed = true;
      return { ...it, finalized: true };
    }
    return it;
  });
  return changed ? next : items;
}

// Unified Worker block reducer — shared by live SSE handler and history replay parser.
// Live stream uses aliases (ToolCallStart/Result, MessageDelta, WorkerEnd): normalize via
// `normalizeWorkerBlockType` before calling. WorkerDelta stays ephemeral/stream-only.
export type WorkerBlockType =
  | "WorkerStart"
  | "WorkerMessage"
  | "WorkerToolCall"
  | "WorkerToolResult"
  | "WorkerComplete"
  | "WorkerError";

const STREAM_ALIAS_TO_WORKER_TYPE: Record<string, WorkerBlockType> = {
  WorkerStart: "WorkerStart",
  WorkerMessage: "WorkerMessage",
  WorkerToolCall: "WorkerToolCall",
  ToolCallStart: "WorkerToolCall",
  WorkerToolResult: "WorkerToolResult",
  ToolCallResult: "WorkerToolResult",
  WorkerComplete: "WorkerComplete",
  WorkerEnd: "WorkerComplete",
  WorkerError: "WorkerError",
};

export function normalizeWorkerBlockType(customType: string): WorkerBlockType | null {
  return STREAM_ALIAS_TO_WORKER_TYPE[customType] ?? null;
}

export function applyWorkerContentBlock(
  workers: Record<string, WorkerState>,
  type: WorkerBlockType,
  data: Record<string, unknown>,
): Record<string, WorkerState> {
  const workerId = (data.worker_id as string) ?? "";
  if (!workerId) return workers;

  if (type === "WorkerStart") {
    const usedIndices = new Set(Object.values(workers).map((w) => w.characterIndex));
    const { index, character } = pickWorkerCharacter(usedIndices, workerId);
    return {
      ...workers,
      [workerId]: {
        workerId,
        description: (data.description as string) ?? "",
        status: "running",
        character,
        characterIndex: index,
        items: [],
      },
    };
  }

  const w = workers[workerId];
  if (!w) return workers;

  let next: WorkerState;
  switch (type) {
    case "WorkerMessage":
      next = {
        ...w,
        items: finalizeWorkerMessage(w.items, (data.message_id as string) ?? "", (data.content as string) ?? ""),
      };
      break;
    case "WorkerToolCall": {
      const items = finalizeAllText(w.items);
      items.push({
        kind: "tool",
        toolName: (data.tool_name as string) ?? "",
        toolInput: (data.tool_input as Record<string, unknown>) ?? {},
      });
      next = { ...w, items };
      break;
    }
    case "WorkerToolResult": {
      const toolName = (data.tool_name as string) ?? "";
      const items = [...w.items];
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.kind === "tool" && it.toolName === toolName && !it.toolResult) {
          items[i] = { ...it, toolResult: (data.tool_result as Record<string, unknown>) ?? {} };
          break;
        }
      }
      next = { ...w, items };
      break;
    }
    case "WorkerComplete":
      next = {
        ...w,
        status: "done",
        summary: (data.summary as string) ?? "",
        items: finalizeAllText(w.items),
      };
      break;
    case "WorkerError":
      next = {
        ...w,
        status: "error",
        error: (data.error as string) ?? "Unknown error",
        items: finalizeAllText(w.items),
      };
      break;
  }
  return { ...workers, [workerId]: next };
}

export const PLANNING_TOOL_NAMES = new Set([
  "create_task", "update_task", "list_tasks", "get_task",
]);

export const SWARM_TOOL_NAMES = new Set([
  "spawn_worker", "delegate_to_image_studio", "spawn_data_worker", "delegate_to_slide_agent",
  "delegate_to_sheet_agent",
]);

export interface SlideOutlineData {
  outline: Record<string, unknown>;
}

export interface SlideDesignSystemData {
  summary: string;
}

export interface SourceCitation {
  ref: number;
  url: string;
  title: string;
  snippet?: string;
}

export interface MemoryUpdateData {
  field: "soul" | "identity";
  content: string;
}

export interface PromptEnhancedData {
  originalPrompt: string;
  enhancedPrompt: string;
  message?: string;
  mediaType?: string;
  style?: string;
}

export interface SheetArtifactData {
  artifactId: string;
  artifactType: string;            // CHART / TABLE / REPORT / DASHBOARD / EXPORT / TEXT / DATASET
  name: string;
  producerNodeId: string;
  content: Record<string, unknown>;
  createdAt: number;
  invalidated?: boolean;
  invalidatedReason?: string;
}

export interface SheetPlanDimension {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "failed" | "aborted";
  role?: string;
  error?: string;
}

export interface SheetPlanData {
  dimensions: SheetPlanDimension[];
}

export type FileData = ChatAttachment;

// GenerationArtifact: spec §"write_report 工具 → 报告卡片". Single wire type
// "GenerationArtifact" with `kind` discriminator (report | image | video).
// Decoupled from tool_call_id — front-end pairs by toolName + temporal locality.
export type ArtifactKind = "report" | "image" | "video" | "slide";

export interface ImageArtifactResult {
  url: string;
  originalUrl?: string;
  thumbnailUrl?: string;
  ratio?: string;
  mimetype?: string;
  width?: number;
  height?: number;
}

export interface VideoArtifactResult {
  url: string;
  originalUrl?: string;
  firstFrameUrl?: string;
  coverUrl?: string;
  webpUrl?: string;
  ratio?: string;
  resolution?: string;
  duration?: number; // seconds
  width?: number;
  height?: number;
  fps?: number;
  webpDuration?: number;
}

export interface SlideArtifactData {
  eventId: string;
  kind: "slide";
  title: string;
  html: string;
  cover: string;
  pageCount: number;
  slideUrls: string[];
  outlinePath: string;
  previewPath: string;
}

export type GenerationArtifactData =
  | { eventId: string; kind: "report"; title: string; content: string; durationMs: number }
  | {
      eventId: string;
      kind: "image";
      title: string;
      prompt: string;
      modelCode: string;
      results: ImageArtifactResult[];
      taskId: string;
      traceId: string;
    }
  | {
      eventId: string;
      kind: "video";
      title: string;
      prompt: string;
      modelCode: string;
      results: VideoArtifactResult[];
      taskId: string;
      traceId: string;
    }
  | SlideArtifactData;

// kind → ToolCallStart.toolName that emits this artifact. Used to find the
// matching skeleton in `updated.blocks` for in-place replacement.
const KIND_TO_TOOL_NAME: Record<ArtifactKind, string> = {
  report: "write_report",
  image: "generate_image",
  video: "generate_video",
  slide: "delegate_to_slide_agent",
};

function parseGenerationArtifact(
  rawPayload: Record<string, unknown>,
  payload: Record<string, unknown>,
): GenerationArtifactData | null {
  const eventId = typeof rawPayload.event_id === "string" ? rawPayload.event_id : "";
  const kind = (payload.kind as string) ?? "";
  const title = (payload.title as string) ?? "";
  if (kind === "report") {
    return {
      eventId,
      kind: "report",
      title,
      content: (payload.content as string) ?? "",
      durationMs: typeof payload.duration_ms === "number" ? payload.duration_ms : 0,
    };
  }
  if (kind === "slide") {
    return {
      eventId,
      kind: "slide",
      title,
      html: (payload.html as string) ?? "",
      cover: (payload.cover as string) ?? "",
      pageCount: typeof payload.page_count === "number" ? payload.page_count : 0,
      slideUrls: Array.isArray(payload.slide_urls) ? (payload.slide_urls as string[]) : [],
      outlinePath: (payload.outline_path as string) ?? "",
      previewPath: (payload.preview_path as string) ?? "",
    };
  }
  if (kind === "image" || kind === "video") {
    const rawResults = Array.isArray(payload.results) ? (payload.results as Record<string, unknown>[]) : [];
    const prompt = (payload.prompt as string) ?? "";
    const modelCode = (payload.model_code as string) ?? "";
    const taskId = (payload.task_id as string) ?? "";
    const traceId = (payload.trace_id as string) ?? "";
    if (kind === "image") {
      const results: ImageArtifactResult[] = rawResults
        .map((r): ImageArtifactResult | null => {
          const url = typeof r.url === "string" ? r.url : "";
          if (!url) return null;
          return {
            url,
            originalUrl: typeof r.original_url === "string" ? r.original_url : undefined,
            thumbnailUrl: typeof r.thumbnail_url === "string" ? r.thumbnail_url : undefined,
            ratio: typeof r.ratio === "string" ? r.ratio : undefined,
            mimetype: typeof r.mimetype === "string" ? r.mimetype : undefined,
            width: typeof r.width === "number" ? r.width : undefined,
            height: typeof r.height === "number" ? r.height : undefined,
          };
        })
        .filter((r): r is ImageArtifactResult => r !== null);
      return { eventId, kind: "image", title, prompt, modelCode, results, taskId, traceId };
    }
    const results: VideoArtifactResult[] = rawResults
      .map((r): VideoArtifactResult | null => {
        const url = typeof r.url === "string" ? r.url : "";
        if (!url) return null;
        return {
          url,
          originalUrl: typeof r.original_url === "string" ? r.original_url : undefined,
          firstFrameUrl: typeof r.first_frame_url === "string" ? r.first_frame_url : undefined,
          coverUrl: typeof r.cover_url === "string" ? r.cover_url : undefined,
          webpUrl: typeof r.webp_url === "string" ? r.webp_url : undefined,
          ratio: typeof r.ratio === "string" ? r.ratio : undefined,
          resolution: typeof r.resolution === "string" ? r.resolution : undefined,
          duration: typeof r.duration === "number" ? r.duration : undefined,
          width: typeof r.width === "number" ? r.width : undefined,
          height: typeof r.height === "number" ? r.height : undefined,
          fps: typeof r.fps === "number" ? r.fps : undefined,
          webpDuration: typeof r.webp_duration === "number" ? r.webp_duration : undefined,
        };
      })
      .filter((r): r is VideoArtifactResult => r !== null);
    return { eventId, kind: "video", title, prompt, modelCode, results, taskId, traceId };
  }
  return null;
}

export { parseGenerationArtifact, KIND_TO_TOOL_NAME };

export type ContentBlock =
  | { type: "Message"; content: string }
  | { type: "File"; data: FileData }
  | { type: "Reasoning"; content: string }
  | { type: "ToolCallStart"; data: ToolCallData }
  | { type: "human_review"; data: HumanReviewData }
  | { type: "HitlResume"; data: HitlResumeData }
  | { type: "TaskList" }
  | { type: "ContextCompacting"; done: boolean }
  | { type: "SlideOutline"; data: SlideOutlineData }
  | { type: "SlideDesignSystem"; data: SlideDesignSystemData }
  | { type: "MemoryUpdate"; data: MemoryUpdateData }
  | { type: "PromptEnhanced"; data: PromptEnhancedData }
  | { type: "GenerationArtifact"; data: GenerationArtifactData }
  | { type: "SheetArtifact"; data: SheetArtifactData }
  | { type: "SheetPlan"; data: SheetPlanData }
  | { type: "AgentThinking"; phase?: string; hint?: string; items?: string[] };

export interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  nodes: NodeData[];
  workers: Record<string, WorkerState>;
  sources: SourceCitation[];
  requestStartedAt?: number;
  ttftMs?: number;
  agentStartedAt?: number;
  agentDurationMs?: number;
  error?: { errorType: string; message: string; recoverable: boolean };
}

export interface RawEvent {
  timestamp: number;
  type: string;
  data: unknown;
  role?: "user" | "assistant";
  seq?: number;
  messageId?: string;
}

// ── Event processing (pure functions) ──

const MAX_RAW_EVENTS = 2000;

function appendOrPushBlock(
  blocks: ContentBlock[],
  blockType: "Message" | "Reasoning",
  content: string,
): void {
  // Search backwards for the last block of the same type,
  // stopping at ToolCallStart boundaries (those separate logical segments).
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === blockType) {
      blocks[i] = { type: blockType, content: (blocks[i] as { content: string }).content + content };
      return;
    }
    if (blocks[i].type === "ToolCallStart") break;
  }
  blocks.push({ type: blockType, content });
}

function asFileData(val: unknown): FileData | null {
  const data = asRecord(val);
  const url = typeof data.url === "string" ? data.url : "";
  const mimeType = typeof data.mime_type === "string"
    ? data.mime_type
    : typeof data.mimeType === "string"
      ? data.mimeType
      : "";
  const filename = typeof data.filename === "string" ? data.filename : "";
  if (!url || !mimeType) return null;
  return { filename, mimeType, url };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function removeAgentThinking(blocks: ContentBlock[]): ContentBlock[] {
  // 不再硬移除：清掉 in-progress hint，items 作为永久"行为日志"保留。
  // 若 items 也为空则真正移除（避免空块占位）。
  const idx = blocks.findIndex((b) => b.type === "AgentThinking");
  if (idx < 0) return blocks;
  const prev = blocks[idx] as { type: "AgentThinking"; items?: string[] };
  const items = prev.items ?? [];
  const next = [...blocks];
  if (items.length === 0) {
    next.splice(idx, 1);
  } else {
    next[idx] = { type: "AgentThinking", phase: undefined, hint: undefined, items };
  }
  return next;
}

function appendExecuteStreamDelta(
  blocks: ContentBlock[],
  payload: Record<string, unknown>,
): ContentBlock[] {
  const content = typeof payload.content === "string" ? payload.content : "";
  if (!content) return blocks;

  const streamKey = payload.stream === "stderr" ? "streamStderr" : "streamStdout";
  const toolCallId = typeof payload.tool_call_id === "string" ? payload.tool_call_id : "";
  const nextBlocks = [...blocks];

  let matchIndex = -1;
  if (toolCallId) {
    matchIndex = nextBlocks.findIndex(
      (block) => block.type === "ToolCallStart" && block.data.toolCallId === toolCallId,
    );
  }
  if (matchIndex < 0) {
    for (let i = nextBlocks.length - 1; i >= 0; i--) {
      const block = nextBlocks[i];
      if (
        block.type === "ToolCallStart"
        && block.data.toolName === "execute"
        && !block.data.toolResult
      ) {
        matchIndex = i;
        break;
      }
    }
  }
  if (matchIndex < 0) return blocks;

  const block = nextBlocks[matchIndex];
  if (block.type !== "ToolCallStart") return blocks;
  const timedOut = block.data.toolResult?.timed_out === true;
  const prevStdout = block.data.streamStdout ?? (timedOut && typeof block.data.toolResult?.stdout === "string"
    ? block.data.toolResult.stdout
    : "");
  const prevStderr = block.data.streamStderr ?? (timedOut && typeof block.data.toolResult?.stderr === "string"
    ? block.data.toolResult.stderr
    : "");
  const prev = streamKey === "streamStderr" ? prevStderr : prevStdout;
  const nextData: ToolCallData = {
    ...block.data,
    streamStdout: prevStdout,
    streamStderr: prevStderr,
    [streamKey]: prev + content,
  };
  if (timedOut) {
    nextData.toolResult = undefined;
  }
  nextBlocks[matchIndex] = {
    type: "ToolCallStart",
    data: nextData,
  };
  return nextBlocks;
}

function ensureAgentThinking(blocks: ContentBlock[], phase?: string, hint?: string): ContentBlock[] {
  // 如果已经有 AgentThinking，原地更新 phase / hint（保留 items 行为日志）
  const idx = blocks.findIndex((b) => b.type === "AgentThinking");
  if (idx >= 0) {
    const next = [...blocks];
    const prev = next[idx] as { type: "AgentThinking"; phase?: string; hint?: string; items?: string[] };
    next[idx] = { type: "AgentThinking", phase, hint, items: prev.items };
    return next;
  }
  return [...blocks, { type: "AgentThinking", phase, hint, items: [] }];
}

// R20-F: 按 matcher（key 函数）upsert —— 已存在匹配项则替换，否则追加。
// 用于 DataUploaded/DataProfiled 等同 asset_id 重复事件的去重。
function upsertAgentThinkingItem(
  blocks: ContentBlock[],
  matcher: (existing: string) => boolean,
  item: string,
): ContentBlock[] {
  const idx = blocks.findIndex((b) => b.type === "AgentThinking");
  if (idx < 0) {
    return [...blocks, { type: "AgentThinking", phase: undefined, hint: undefined, items: [item] }];
  }
  const next = [...blocks];
  const prev = next[idx] as { type: "AgentThinking"; phase?: string; hint?: string; items?: string[] };
  const existing = prev.items ?? [];
  const itemIdx = existing.findIndex(matcher);
  let merged: string[];
  if (itemIdx >= 0) {
    merged = [...existing];
    merged[itemIdx] = item;
  } else {
    merged = [...existing, item];
  }
  next[idx] = { ...prev, items: merged };
  return next;
}

function setTtftIfNeeded(message: Message, eventTimestamp: number): Message {
  if (message.role !== "assistant" || message.ttftMs != null || message.requestStartedAt == null) {
    return message;
  }

  return {
    ...message,
    ttftMs: Math.max(0, eventTimestamp - message.requestStartedAt),
  };
}

// Extract the LangChain message_id shared by all blocks of a single HumanInput /
// ConversationHistory user turn. Accepts both snake_case (JSON payload from
// backend) and camelCase (protobuf-ts field mapping) keys.
export function extractUserBlockMessageId(blocks: Array<Record<string, unknown>>): string | undefined {
  for (const b of blocks) {
    const mid =
      (b.message_id as string | undefined) ??
      (b.messageId as string | undefined);
    if (typeof mid === "string" && mid.length > 0) return mid;
  }
  return undefined;
}

// Stable id for user messages derived from backend message_id so that
// HumanInput replays can be matched against already-rendered history.
export function userMessageIdFromBackend(backendMessageId: string): string {
  return `user-${backendMessageId}`;
}

// §8.9: parse a HitlResume block payload from `HumanInput.blocks[]` or `turn.user[]`.
export function parseHitlResumeBlock(d: Record<string, unknown>): ContentBlock | null {
  const action = d.action;
  if (action !== "approve" && action !== "modify" && action !== "reject") return null;
  const resolvesEventId = typeof d.resolves_event_id === "string" ? d.resolves_event_id : "";
  const feedback = typeof d.feedback === "string" && d.feedback.length > 0 ? d.feedback : undefined;
  const modifyData = d.modify_data && typeof d.modify_data === "object" && !Array.isArray(d.modify_data)
    ? (d.modify_data as Record<string, unknown>)
    : null;
  return {
    type: "HitlResume",
    data: { action, resolves_event_id: resolvesEventId, feedback, modify_data: modifyData },
  };
}

// Apply HitlResume.modify_data onto the matching HumanReview's payload so the
// existing renderer (e.g. MaterialSupplementRenderer) reflects the user's
// decision automatically. The merge strategy is **review_type-dependent** per
// spec §8.9 — naive shallow merge would corrupt material_supplement (drops
// candidates), so each type is handled explicitly.
function applyModifyDataToPayload(
  payload: Record<string, unknown>,
  modifyData: Record<string, unknown>,
): Record<string, unknown> {
  const reviewType = typeof payload.review_type === "string" ? payload.review_type : "";
  const dataKey = payload.details !== undefined ? "details" : "data";
  const inner = (payload[dataKey] ?? {}) as Record<string, unknown>;

  // material_supplement: modify_data only carries `slots[i].selected_index`;
  // candidates live exclusively on the original review (per spec — avoids
  // duplicating url data). Per-slot overwrite preserves candidates so the
  // existing image-picker renderer naturally highlights the user's choice.
  if (reviewType === "material_supplement") {
    const modSlots = Array.isArray(modifyData.slots) ? modifyData.slots as Array<Record<string, unknown>> : null;
    if (!modSlots) return payload;
    const origSlots = Array.isArray(inner.slots) ? inner.slots as Array<Record<string, unknown>> : [];
    const mergedSlots = origSlots.map((slot, i) => {
      const upd = modSlots[i];
      if (!upd || typeof upd.selected_index !== "number") return slot;
      return { ...slot, selected_index: upd.selected_index };
    });
    return { ...payload, [dataKey]: { ...inner, slots: mergedSlots } };
  }

  // research_plan / batch_generation_plan: modify_data ships full top-level
  // replacement structures (e.g. `{tasks: [...]}` or `{items: [...]}` already
  // contain complete records), so shallow merge is correct here.
  return { ...payload, [dataKey]: { ...inner, ...modifyData } };
}

// §8.9 #4: scan all messages, flip `human_review` blocks whose event_id
// matches any `HitlResume.resolves_event_id` in the new user turn AND merge
// action / feedback / (review-type-aware) modify_data onto the card so its
// renderer shows the decision inline (no separate user-side chip).
export function resolveReviewsByHitlBlocks(messages: Message[], hitlBlocks: ContentBlock[]): Message[] {
  const byEventId = new Map<string, HitlResumeData>();
  for (const b of hitlBlocks) {
    if (b.type === "HitlResume" && b.data.resolves_event_id) {
      byEventId.set(b.data.resolves_event_id, b.data);
    }
  }
  if (byEventId.size === 0) return messages;
  let touched = false;
  const next = messages.map((m) => {
    let blockChanged = false;
    const blocks = m.blocks.map((b) => {
      if (b.type !== "human_review") return b;
      const eid = b.data.event_id;
      if (!eid) return b;
      const hitl = byEventId.get(eid);
      if (!hitl) return b;
      if (b.data.state === "decided" && b.data.resumeAction === hitl.action && b.data.resumeFeedback === hitl.feedback) return b;
      blockChanged = true;
      const mergedPayload = hitl.modify_data
        ? applyModifyDataToPayload(b.data.payload, hitl.modify_data)
        : b.data.payload;
      return {
        type: "human_review",
        data: {
          ...b.data,
          payload: mergedPayload,
          state: "decided",
          resumeAction: hitl.action,
          resumeFeedback: hitl.feedback,
        },
      } as ContentBlock;
    });
    if (!blockChanged) return m;
    touched = true;
    return { ...m, blocks };
  });
  return touched ? next : messages;
}

export function applyStreamEvent(messages: Message[], event: AgentStreamEvent, eventTimestamp = Date.now()): Message[] {
  const msgs = [...messages];

  // HumanInput: inserted as the first frame of every Resume (spec §6.5). Duplicates
  // are expected on mid-stream reconnects and on refreshes where the turn was
  // already DB-persisted, so the handler is idempotent by backend message_id.
  if (event.event.case === "custom") {
    const custom = event.event.value;
    if (custom.type === "HumanInput") {
      const payload = asRecord(tryDecodeJson(custom.payload));
      const rawBlocks = (payload.blocks as Array<Record<string, unknown>>) ?? [];
      const backendMsgId = extractUserBlockMessageId(rawBlocks);
      const userMsgId = backendMsgId ? userMessageIdFromBackend(backendMsgId) : nextMessageId();

      // Case 1 — message already in the list under the backend-derived id
      // (came from parseHistoryTurns after a refresh, or from an earlier
      // Resume retry). Replay is equivalent; skip the duplicate.
      if (backendMsgId && msgs.some((m) => m.role === "user" && m.id === userMsgId)) {
        return msgs;
      }

      const userText = rawBlocks
        .filter((b) => b.type === "Message")
        .map((b) => ((asRecord(b.data).content as string) ?? ""))
        .join("\n");
      const fileBlocks = rawBlocks
        .filter((b) => b.type === "File")
        .map((b) => asFileData(b.data))
        .filter((b): b is FileData => b !== null)
        .map((data) => ({ type: "File", data }) as ContentBlock);
      // §8.9: HitlResumeStream 首帧的 user blocks[0] = HitlResume(action, resolves_event_id, ...)
      const hitlBlocks: ContentBlock[] = rawBlocks
        .filter((b) => b.type === "HitlResume")
        .map((b) => parseHitlResumeBlock(asRecord(b.data)))
        .filter((b): b is ContentBlock => b !== null);
      if (!userText && fileBlocks.length === 0 && hitlBlocks.length === 0) return msgs;

      const lastIdx = msgs.length - 1;
      const trailingAssistantIdx = msgs[lastIdx]?.role === "assistant" ? lastIdx : -1;
      const candidateIdx = trailingAssistantIdx >= 0 ? trailingAssistantIdx - 1 : lastIdx;
      const candidate = msgs[candidateIdx];

      // Case 2 — mid-stream reconnect: addUserMessage pushed a user bubble with
      // a local id (e.g. "msg-…") before the disconnect, and that message is
      // still the one immediately before the trailing assistant. Adopt the
      // backend id so future replays hit Case 1 instead of duplicating.
      if (
        backendMsgId &&
        candidate &&
        candidate.role === "user" &&
        !candidate.id.startsWith("user-")
      ) {
        msgs[candidateIdx] = { ...candidate, id: userMsgId };
        return msgs;
      }

      // Case 3 — genuinely new; insert before the trailing assistant or at the end.
      const userMsg: Message = {
        id: userMsgId,
        role: "user",
        blocks: [
          ...(userText ? [{ type: "Message", content: userText } as ContentBlock] : []),
          ...fileBlocks,
          ...hitlBlocks,
        ],
        nodes: [], workers: {}, sources: [],
      };
      if (trailingAssistantIdx >= 0) {
        msgs.splice(trailingAssistantIdx, 0, userMsg);
      } else {
        msgs.push(userMsg);
      }
      // §8.9 #4: flip matching HumanReview cards via resolves_event_id reverse-link.
      return resolveReviewsByHitlBlocks(msgs, hitlBlocks);
    }
  }

  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "assistant") return msgs;

  const updated = {
    ...last,
    blocks: [...last.blocks],
    workers: { ...last.workers },
    sources: [...last.sources],
  };

  switch (event.event.case) {
    case "agentStart": {
      updated.agentStartedAt = eventTimestamp;
      updated.agentDurationMs = undefined;
      // R21: 不再插入"正在为您准备..."占位 —— 直接等待真实事件（避免和后续 tool 卡片重复）
      break;
    }
    case "agentEnd": {
      if (updated.agentStartedAt != null) {
        updated.agentDurationMs = Math.max(0, eventTimestamp - updated.agentStartedAt);
      }
      updated.blocks = removeAgentThinking(updated.blocks);
      break;
    }
    case "messageDelta": {
      const delta = event.event.value;
      if (delta.content) {
        updated.blocks = removeAgentThinking(updated.blocks);
        appendOrPushBlock(updated.blocks, "Message", delta.content);
      }
      break;
    }
    case "reasoningDelta": {
      const delta = event.event.value;
      if (delta.content) {
        updated.blocks = removeAgentThinking(updated.blocks);
        appendOrPushBlock(updated.blocks, "Reasoning", delta.content);
      }
      break;
    }
    case "toolCallStart": {
      const tc = event.event.value;
      const input = asRecord(tryDecodeJson(tc.toolInput));
      const ttftUpdated = setTtftIfNeeded(updated, eventTimestamp);
      updated.blocks = removeAgentThinking(updated.blocks);
      updated.blocks.push({
        type: "ToolCallStart",
        data: { toolCallId: tc.toolCallId, toolName: tc.toolName, toolInput: input },
      });
      updated.ttftMs = ttftUpdated.ttftMs;
      break;
    }
    case "toolCallResult": {
      const tr = event.event.value;
      const result = asRecord(tryDecodeJson(tr.toolResult));
      const ttftUpdated = setTtftIfNeeded(updated, eventTimestamp);
      const hasIdMatch = tr.toolCallId
        ? updated.blocks.some(
            (b) => b.type === "ToolCallStart" && b.data.toolCallId === tr.toolCallId,
          )
        : false;
      let fallbackUsed = false;
      updated.blocks = updated.blocks.map((block) => {
        if (block.type !== "ToolCallStart") return block;
        if (hasIdMatch) {
          return block.data.toolCallId === tr.toolCallId
            ? { type: "ToolCallStart", data: { ...block.data, toolResult: result } }
            : block;
        }
        if (!fallbackUsed && block.data.toolName === tr.toolName && !block.data.toolResult) {
          fallbackUsed = true;
          return { type: "ToolCallStart", data: { ...block.data, toolResult: result } };
        }
        return block;
      });
      updated.ttftMs = ttftUpdated.ttftMs;
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
      const rawPayload = asRecord(tryDecodeJson(custom.payload));
      const payload = unwrapEmitEvent(rawPayload);

      // ── Sub-agent typed event passthrough ──
      // SuperAgent 把 SheetAgent 的 planner 流式事件用 custom 通道转发出来,
      // 这里按事件类型映射回与原生 typed 事件完全一致的渲染逻辑（保持 UX 与
      // 直接选 sheet 时一致）。delegate_tool.py 侧把 type 串原样保留为
      // "MessageDelta" / "ReasoningDelta" / "ToolCallStart" / "ToolCallResult"。
      if (custom.type === "MessageDelta") {
        const content = payload.content;
        if (typeof content === "string" && content.length > 0) {
          updated.blocks = removeAgentThinking(updated.blocks);
          appendOrPushBlock(updated.blocks, "Message", content);
        }
        break;
      }
      if (custom.type === "ReasoningDelta") {
        const content = payload.content;
        if (typeof content === "string" && content.length > 0) {
          updated.blocks = removeAgentThinking(updated.blocks);
          appendOrPushBlock(updated.blocks, "Reasoning", content);
        }
        break;
      }
      if (custom.type === "ToolCallStart") {
        const toolName = (payload.tool_name as string | undefined) ?? "";
        const toolCallId = (payload.tool_call_id as string | undefined) ?? "";
        const rawInput = payload.tool_input;
        const input = asRecord(
          typeof rawInput === "string" ? tryDecodeJson(rawInput) : rawInput,
        );
        const ttftUpdated = setTtftIfNeeded(updated, eventTimestamp);
        updated.blocks = removeAgentThinking(updated.blocks);
        updated.blocks.push({
          type: "ToolCallStart",
          data: { toolCallId, toolName, toolInput: input },
        });
        updated.ttftMs = ttftUpdated.ttftMs;
        break;
      }
      if (custom.type === "ToolCallResult") {
        const toolName = (payload.tool_name as string | undefined) ?? "";
        const toolCallId = (payload.tool_call_id as string | undefined) ?? "";
        const rawResult = payload.tool_result;
        const result = asRecord(
          typeof rawResult === "string" ? tryDecodeJson(rawResult) : rawResult,
        );
        const ttftUpdated = setTtftIfNeeded(updated, eventTimestamp);
        const hasIdMatch = toolCallId
          ? updated.blocks.some(
              (b) => b.type === "ToolCallStart" && b.data.toolCallId === toolCallId,
            )
          : false;
        let fallbackUsed = false;
        updated.blocks = updated.blocks.map((block) => {
          if (block.type !== "ToolCallStart") return block;
          if (hasIdMatch) {
            return block.data.toolCallId === toolCallId
              ? { type: "ToolCallStart", data: { ...block.data, toolResult: result } }
              : block;
          }
          if (!fallbackUsed && block.data.toolName === toolName && !block.data.toolResult) {
            fallbackUsed = true;
            return { type: "ToolCallStart", data: { ...block.data, toolResult: result } };
          }
          return block;
        });
        updated.ttftMs = ttftUpdated.ttftMs;
        break;
      }

      if (custom.type === "ContextCompactStart") {
        updated.blocks.push({ type: "ContextCompacting", done: false });
        break;
      }

      if (custom.type === "ContextCompactEnd") {
        for (let i = updated.blocks.length - 1; i >= 0; i--) {
          const block = updated.blocks[i];
          if (block.type === "ContextCompacting" && !block.done) {
            updated.blocks[i] = { type: "ContextCompacting", done: true };
            break;
          }
        }
        break;
      }

      if (custom.type === "HumanReview") {
        // §8.9: capture envelope event_id so a downstream HitlResume block
        // (with `resolves_event_id`) can flip this card's state.
        const eventId = typeof rawPayload.event_id === "string" ? rawPayload.event_id : undefined;
        updated.blocks.push({
          type: "human_review",
          data: { payload, state: "pending", event_id: eventId },
        });
        break;
      }

      if (custom.type === "ExecuteStreamDelta") {
        updated.blocks = appendExecuteStreamDelta(updated.blocks, payload);
        break;
      }

      if (custom.type === "SourcesCited") {
        const sources = (payload.sources as SourceCitation[]) ?? [];
        if (sources.length > 0) {
          updated.sources = [...updated.sources, ...sources];
        }
        break;
      }

      if (custom.type === "TaskUpdate") {
        const action = payload.action as string;
        if (action === "create") {
          const hasAnchor = updated.blocks.some((b) => b.type === "TaskList");
          if (!hasAnchor) {
            updated.blocks.push({ type: "TaskList" });
          }
        }
        break;
      }

      if (custom.type === "OutlineGenerated") {
        updated.blocks.push({
          type: "SlideOutline",
          data: { outline: (payload.outline as Record<string, unknown>) ?? {} },
        });
        break;
      }

      if (custom.type === "DesignSystemGenerated") {
        updated.blocks.push({
          type: "SlideDesignSystem",
          data: { summary: (payload.summary as string) ?? "" },
        });
        break;
      }

      if (custom.type === "MemoryUpdate") {
        const field = payload.field as string;
        const content = payload.content as string;
        if (field && content) {
          updated.blocks.push({
            type: "MemoryUpdate",
            data: { field: field as "soul" | "identity", content },
          });
        }
        break;
      }

      if (custom.type === "PromptEnhanced") {
        updated.blocks.push({
          type: "PromptEnhanced",
          data: {
            originalPrompt: (payload.original_prompt as string) ?? "",
            enhancedPrompt: (payload.enhanced_prompt as string) ?? "",
            message: payload.message as string | undefined,
            mediaType: payload.media_type as string | undefined,
            style: payload.style as string | undefined,
          },
        });
        break;
      }

      // GenerationArtifact carries the final card payload; envelope event_id is
      // the global handle. wire_type fixed to "GenerationArtifact"; `kind`
      // discriminates report/image/video. We replace the matching tool's
      // ToolCallStart skeleton in-place so the chat shows one card, not
      // skeleton + final.
      if (custom.type === "GenerationArtifact") {
        const data = parseGenerationArtifact(rawPayload, payload);
        if (!data) break;
        const block: ContentBlock = { type: "GenerationArtifact", data };
        const targetToolName = KIND_TO_TOOL_NAME[data.kind];
        let replaced = false;
        for (let i = updated.blocks.length - 1; i >= 0; i--) {
          const b = updated.blocks[i];
          if (b.type === "ToolCallStart" && b.data.toolName === targetToolName) {
            updated.blocks = [
              ...updated.blocks.slice(0, i),
              block,
              ...updated.blocks.slice(i + 1),
            ];
            replaced = true;
            break;
          }
        }
        if (!replaced) updated.blocks.push(block);
        break;
      }

      // ── Sheet Agent v3 events ──
      if (custom.type === "TurnStarted") {
        // 替换/插入"思考中"占位，用 user_message_preview 提示用户在做什么
        const preview = (payload.user_message_preview as string) ?? "";
        updated.blocks = ensureAgentThinking(
          updated.blocks,
          "thinking",
          preview ? `正在分析您的请求：${preview.slice(0, 30)}...` : "智能体正在思考中...",
        );
        break;
      }

      if (custom.type === "TurnPhaseChanged") {
        // R20-E: 后端已大幅减少 phase 事件，仅 IngestUploadsHook 仍 emit ingesting_uploads。
        // 其他 phase 即便误传过来也只更新 hint，不再硬编码大量阶段文案，让 LLM narrate 主导。
        const phase = (payload.phase as string) ?? "";
        const visibleTools = Array.isArray(payload.visible_tools)
          ? (payload.visible_tools as string[])
          : [];
        const phaseHint: Record<string, string> = {
          ingesting_uploads: "正在为您接收上传的文件",
        };
        const hint = phaseHint[phase] ?? "";
        if (!hint) break;  // 未知 phase 不打扰
        const toolsSuffix = visibleTools.length > 0
          ? `（${visibleTools.slice(0, 3).join("、")}${visibleTools.length > 3 ? " 等" : ""}）`
          : "";
        updated.blocks = ensureAgentThinking(updated.blocks, phase, hint + toolsSuffix);
        break;
      }

      if (custom.type === "DataUploaded") {
        const filename = (payload.filename as string) ?? (payload.asset_id as string) ?? "";
        const sizeBytes = (payload.file_size as number) ?? 0;
        const fileType = (payload.file_type as string) ?? "";
        if (filename) {
          const failed = sizeBytes === 0 || fileType.startsWith("failed");
          // R20-F: dedupe by filename —— 同文件多次 emit 只保留最新一条
          const matcher = (it: string) =>
            it.includes(`已收到 ${filename}`) || it.includes(`未能接收 ${filename}`);
          if (failed) {
            const reason = fileType.startsWith("failed:") ? fileType.slice(7) : "下载失败";
            updated.blocks = upsertAgentThinkingItem(updated.blocks, matcher, `未能接收 ${filename}：${reason}`);
          } else {
            const sizeText = sizeBytes > 0 ? `（${formatFileSize(sizeBytes)}）` : "";
            updated.blocks = upsertAgentThinkingItem(updated.blocks, matcher, `已收到 ${filename}${sizeText}`);
          }
        }
        break;
      }

      if (custom.type === "DataProfiled") {
        // R21: profile_data 工具本身已经渲染为独立 tool 卡片（"🔍 Profile Data inputs/xxx.csv"），
        // DataProfiled 是 streaming 元数据，前端不再额外插入 AgentThinking "读懂 xxx" 行
        //（避免与工具卡片重复 + 风格断裂）。如需查看 dims/columns，展开 tool 卡片 Output 即可。
        break;
      }

      if (custom.type === "ArtifactCreated") {
        const artifactId = (payload.artifact_id as string) ?? "";
        if (!artifactId) break;
        const newData: SheetArtifactData = {
          artifactId,
          artifactType: (payload.artifact_type as string) ?? "TEXT",
          name: (payload.name as string) ?? artifactId.split("/").pop() ?? artifactId,
          producerNodeId: (payload.producer_node_id as string) ?? "",
          content: asRecord(payload.content),
          createdAt: eventTimestamp,
        };
        // Dedupe: if same artifact_id already exists, replace in place.
        const existingIdx = updated.blocks.findIndex(
          (b) => b.type === "SheetArtifact" && b.data.artifactId === artifactId,
        );
        if (existingIdx >= 0) {
          updated.blocks = [...updated.blocks];
          updated.blocks[existingIdx] = { type: "SheetArtifact", data: newData };
        } else {
          updated.blocks.push({ type: "SheetArtifact", data: newData });
        }
        break;
      }

      if (custom.type === "ArtifactInvalidated") {
        const artifactId = (payload.artifact_id as string) ?? "";
        if (!artifactId) break;
        updated.blocks = updated.blocks.map((b) =>
          b.type === "SheetArtifact" && b.data.artifactId === artifactId
            ? {
                type: "SheetArtifact",
                data: {
                  ...b.data,
                  invalidated: true,
                  invalidatedReason: (payload.reason as string) ?? "",
                },
              }
            : b,
        );
        break;
      }

      if (custom.type === "TaskPlanned") {
        const nodes = Array.isArray(payload.nodes) ? (payload.nodes as Array<Record<string, unknown>>) : [];
        if (nodes.length === 0) break;
        const dims: SheetPlanDimension[] = nodes.map((n) => ({
          id: (n.node_id as string) ?? (n.id as string) ?? "",
          title: (n.objective as string) ?? (n.title as string) ?? (n.task_type as string) ?? "",
          role: (n.worker_role as string) ?? undefined,
          status: "pending",
        }));
        // 多文件 / 增量场景：plan_analysis 可能被多次调用。
        // - 同一 plan 重发（dim_ids 完全相同）→ 替换最后一个 SheetPlan（幂等）
        // - 增量 plan（部分 dim_ids 命中已有）→ merge 进对应 SheetPlan，保留旧 dims 状态
        // - 新一轮 plan（无任何 dim_id 命中）→ append 一个新的 SheetPlan 块
        const newIds = new Set(dims.map((d) => d.id));
        const existingPlanIdxs = updated.blocks
          .map((b, i) => (b.type === "SheetPlan" ? i : -1))
          .filter((i) => i >= 0);
        let mergeIdx = -1;
        let isReplace = false;
        for (const idx of existingPlanIdxs) {
          const block = updated.blocks[idx] as { type: "SheetPlan"; data: SheetPlanData };
          const existIds = new Set(block.data.dimensions.map((d) => d.id));
          const overlap = [...newIds].some((id) => existIds.has(id));
          if (overlap) {
            mergeIdx = idx;
            isReplace = [...newIds].every((id) => existIds.has(id))
              && [...existIds].every((id) => newIds.has(id));
            break;
          }
        }
        updated.blocks = [...updated.blocks];
        if (mergeIdx < 0) {
          updated.blocks.push({ type: "SheetPlan", data: { dimensions: dims } });
        } else if (isReplace) {
          updated.blocks[mergeIdx] = { type: "SheetPlan", data: { dimensions: dims } };
        } else {
          const block = updated.blocks[mergeIdx] as { type: "SheetPlan"; data: SheetPlanData };
          const existIds = new Set(block.data.dimensions.map((d) => d.id));
          const merged = [
            ...block.data.dimensions,
            ...dims.filter((d) => !existIds.has(d.id)),
          ];
          updated.blocks[mergeIdx] = { type: "SheetPlan", data: { dimensions: merged } };
        }
        break;
      }

      if (
        custom.type === "TaskStarted" ||
        custom.type === "TaskCompleted" ||
        custom.type === "TaskFailed"
      ) {
        const nodeId = (payload.node_id as string) ?? "";
        if (!nodeId) break;
        const nextStatus: SheetPlanDimension["status"] =
          custom.type === "TaskStarted" ? "running"
          : custom.type === "TaskCompleted" ? "done"
          : "failed";
        const error = custom.type === "TaskFailed" ? ((payload.error as string) ?? "") : undefined;
        updated.blocks = updated.blocks.map((b) => {
          if (b.type !== "SheetPlan") return b;
          return {
            type: "SheetPlan",
            data: {
              dimensions: b.data.dimensions.map((d) =>
                d.id === nodeId
                  ? { ...d, status: nextStatus, ...(error != null ? { error } : {}) }
                  : d,
              ),
            },
          };
        });
        break;
      }
      // ── End Sheet Agent v3 events ──

      // Worker events
      const workerId = payload.worker_id as string | undefined;
      if (workerId) {
        if (custom.type === "WorkerDelta" || custom.type === "MessageDelta") {
          const w = updated.workers[workerId];
          if (w) {
            updated.workers[workerId] = {
              ...w,
              items: appendWorkerDelta(w.items, (payload.message_id as string) ?? "", (payload.content as string) ?? ""),
            };
          }
        } else {
          const workerType = normalizeWorkerBlockType(custom.type);
          if (workerType) {
            updated.workers = applyWorkerContentBlock(updated.workers, workerType, payload);
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
  const seq = event.seq > 0n ? Number(event.seq) : undefined;
  return {
    timestamp: Date.now(),
    type: event.event.case ?? "unknown",
    data: cleaned,
    role: "assistant",
    seq,
    messageId: event.messageId || undefined,
  };
}

function pushRawEvent(events: RawEvent[], event: RawEvent): RawEvent[] {
  if (events.length >= MAX_RAW_EVENTS) {
    const trimmed = events.slice(Math.floor(MAX_RAW_EVENTS * 0.2));
    return [...trimmed, event];
  }
  return [...events, event];
}

export function rebuildTasksFromHistory(messages: Message[]): AgentTask[] {
  let tasks: AgentTask[] = [];
  for (const msg of messages) {
    for (const block of msg.blocks) {
      if (block.type !== "ToolCallStart" || !PLANNING_TOOL_NAMES.has(block.data.toolName) || !block.data.toolResult) continue;
      const result = block.data.toolResult;
      if (Array.isArray(result.tasks)) {
        tasks = result.tasks as AgentTask[];
      }
      if (result.action === "create" && result.task && typeof (result.task as Record<string, unknown>).id === "number") {
        const task = result.task as AgentTask;
        if (!tasks.some((t) => t.id === task.id)) {
          tasks = [...tasks, task];
        }
      }
      if (result.action === "update" && typeof result.task_id === "number" && result.status) {
        tasks = tasks.map((t) => t.id === result.task_id ? { ...t, status: result.status as AgentTask["status"] } : t);
      }
      if (result.action === "reset") {
        tasks = [];
      }
    }
  }
  return tasks;
}

// ── Store ──

interface PendingTextSegment {
  convId: string;
  type: "Message" | "Reasoning";
  content: string;
}

interface ConversationStore {
  conversationId: string | null;
  agentType: string;
  systemPromptId: string | null;
  extraContext: { [key: string]: string };
  messages: Message[];
  rawEvents: RawEvent[];
  tasks: AgentTask[];
  isStreaming: boolean;
  isLoadingHistory: boolean;
  error: string | null;
  streamingConvIds: Set<string>;

  // Typing animation state
  pendingTextQueue: PendingTextSegment[];
  isTyping: boolean;

  setConversationId: (id: string) => void;
  setAgentType: (type: string) => void;
  setSystemPromptId: (id: string | null) => void;
  setExtraContext: (ctx: { [key: string]: string }) => void;
  setStreaming: (v: boolean) => void;
  setLoadingHistory: (v: boolean) => void;
  setError: (err: string | null) => void;
  addUserMessage: (content: string, files?: ChatAttachment[]) => void;
  startAssistantMessage: (requestStartedAt?: number) => void;
  resolveHumanReview: (action: HitlAction, feedback?: string) => void;
  dismissPendingHumanReviews: () => void;
  removeLastRound: () => void;
  removeLastAssistantMessage: () => void;
  setMessages: (messages: Message[]) => void;
  reset: () => void;

  addStreamingConv: (convId: string) => void;
  removeStreamingConv: (convId: string) => void;
  processEventForConv: (convId: string, event: AgentStreamEvent) => void;
  
  // Internal typing loop
  flushPendingText: () => void;
}

export const useConversationStore = create<ConversationStore>((set, get) => {
  let rafId: number | null = null;

  const runTypingLoop = () => {
    const { pendingTextQueue, flushPendingText } = get();
    if (pendingTextQueue.length === 0) {
      set({ isTyping: false });
      rafId = null;
      return;
    }

    flushPendingText();
    rafId = requestAnimationFrame(runTypingLoop);
  };

  return {
    conversationId: null,
    agentType: "super",
    systemPromptId: null,
    extraContext: {},
    messages: [],
    rawEvents: [],
    tasks: [],
    isStreaming: false,
    isLoadingHistory: false,
    error: null,
    streamingConvIds: new Set(),
    pendingTextQueue: [],
    isTyping: false,

    setConversationId: (id) => set({ conversationId: id }),
    setAgentType: (type) => set({ agentType: type }),
    setSystemPromptId: (id) => set({ systemPromptId: id }),
    setExtraContext: (ctx) => set({ extraContext: ctx }),
    setStreaming: (v) => set({ isStreaming: v }),
    setLoadingHistory: (v) => set({ isLoadingHistory: v }),
    setError: (err) => set({ error: err }),

    addUserMessage: (content, files = []) =>
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: nextMessageId(),
            role: "user",
            blocks: [
              ...(content ? [{ type: "Message", content } as ContentBlock] : []),
              ...files.map((file) => ({ type: "File", data: file }) as ContentBlock),
            ],
            nodes: [],
            workers: {},
            sources: [],
          },
        ],
      })),

    startAssistantMessage: (requestStartedAt) =>
      set((s) => ({
        messages: [
          ...s.messages,
          { id: nextMessageId(), role: "assistant", blocks: [], nodes: [], workers: {}, sources: [], requestStartedAt },
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

      // Track per-turn max seq for ResumeStream resume.
      // seq === 0n means unpopulated (legacy server or non-resume path); ignore.
      if (event.seq > 0n) {
        const cur = latestSeqByConv.get(convId) ?? 0n;
        if (event.seq > cur) latestSeqByConv.set(convId, event.seq);
      }
      // Turn boundary: clear seq so the next turn starts fresh from 0.
      const caseName = event.event.case;
      if (caseName === "agentEnd" || caseName === "agentError" || caseName === "agentCancelled") {
        latestSeqByConv.delete(convId);
      }

      const rawEvent = buildRawEvent(event);

      // Handle text deltas via queue
      if (event.event.case === "messageDelta") {
        const value = event.event.value;
        if (!value?.content) return;
        set((prev) => ({
          messages: prev.messages.length > 0
            ? (() => {
                const msgs = [...prev.messages];
                const last = msgs[msgs.length - 1];
                if (!last || last.role !== "assistant" || last.ttftMs != null || last.requestStartedAt == null) {
                  return prev.messages;
                }
                msgs[msgs.length - 1] = setTtftIfNeeded(last, rawEvent.timestamp);
                return msgs;
              })()
            : prev.messages,
          pendingTextQueue: [...prev.pendingTextQueue, { convId, type: "Message", content: value.content }],
          rawEvents: pushRawEvent(prev.rawEvents, rawEvent),
        }));
        if (!get().isTyping) {
          set({ isTyping: true });
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(runTypingLoop);
        }
        return;
      }
      if (event.event.case === "reasoningDelta") {
        const value = event.event.value;
        if (!value?.content) return;
        set((prev) => ({
          pendingTextQueue: [...prev.pendingTextQueue, { convId, type: "Reasoning", content: value.content }],
          rawEvents: pushRawEvent(prev.rawEvents, rawEvent),
        }));
        if (!get().isTyping) {
          set({ isTyping: true });
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(runTypingLoop);
        }
        return;
      }

      // Extract tasks from TaskUpdate custom events
      let newTasks: AgentTask[] | undefined;
      if (event.event.case === "custom" && event.event.value.type === "TaskUpdate") {
        const payload = unwrapEmitEvent(asRecord(tryDecodeJson(event.event.value.payload)));
        const action = payload.action as string;
        if (action === "create") {
          const existing = get().tasks;
          const task = payload.task as AgentTask | undefined;
          if (task && !existing.some((t) => t.id === task.id)) {
            // Incremental add: append single new task (order-safe for concurrent emits)
            newTasks = [...existing, task];
          } else {
            // Fallback: accept full list only if it's strictly longer (prevents out-of-order overwrites)
            const tasks = payload.tasks as AgentTask[] | undefined;
            if (tasks && tasks.length > existing.length) {
              newTasks = tasks;
            }
          }
        } else if (action === "update") {
          const taskId = payload.task_id as number;
          const status = payload.status as AgentTask["status"];
          if (taskId != null && status) {
            newTasks = get().tasks.map((t) => (t.id === taskId ? { ...t, status } : t));
          }
        } else if (action === "reset") {
          newTasks = [];
        }
      }

      set((prev) => ({
        messages: applyStreamEvent(prev.messages, event, rawEvent.timestamp),
        rawEvents: pushRawEvent(prev.rawEvents, rawEvent),
        ...(newTasks !== undefined ? { tasks: newTasks } : {}),
      }));
    },

    flushPendingText: () => {
      const { pendingTextQueue, conversationId, messages } = get();
      if (pendingTextQueue.length === 0) return;

      const newQueue = [...pendingTextQueue];
      const msgs = [...messages];
      
      const CHARS_PER_FRAME = Math.max(2, Math.floor(newQueue.reduce((acc, s) => acc + s.content.length, 0) / 10));
      let charsRemaining = CHARS_PER_FRAME;

      while (charsRemaining > 0 && newQueue.length > 0) {
        const segment = newQueue[0];
        
        if (segment.convId !== conversationId) {
          newQueue.shift();
          continue;
        }

        const toTake = Math.min(segment.content.length, charsRemaining);
        const chunk = segment.content.slice(0, toTake);
        const remainingInSegment = segment.content.slice(toTake);

        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          const updated = { ...last, blocks: [...last.blocks], workers: { ...last.workers }, sources: [...last.sources] };
          appendOrPushBlock(updated.blocks, segment.type, chunk);
          msgs[msgs.length - 1] = updated;
        }

        charsRemaining -= toTake;
        if (remainingInSegment) {
          newQueue[0] = { ...segment, content: remainingInSegment };
        } else {
          newQueue.shift();
        }
      }

      set({ messages: msgs, pendingTextQueue: newQueue });
    },

    resolveHumanReview: (action, feedback) =>
      set((s) => {
        const messages = [...s.messages];
        const last = messages[messages.length - 1];
        if (!last) return s;
        const blocks = [...last.blocks];
        for (let i = blocks.length - 1; i >= 0; i--) {
          const block = blocks[i];
          if (block.type === "human_review" && block.data.state === "pending") {
            blocks[i] = {
              type: "human_review",
              data: { ...block.data, state: "decided", resumeAction: action, resumeFeedback: feedback },
            };
            break;
          }
        }
        messages[messages.length - 1] = { ...last, blocks };
        return { messages };
      }),

    // §8.9 IGNORED: user sent a normal ChatStream while a HumanReview was
    // pending — backend will mark the old turn `ignored`. Optimistically grey
    // out any pending cards locally so the UI flips immediately.
    dismissPendingHumanReviews: () =>
      set((s) => {
        let touched = false;
        const messages = s.messages.map((m) => {
          let blockChanged = false;
          const blocks = m.blocks.map((b) => {
            if (b.type !== "human_review" || b.data.state !== "pending") return b;
            blockChanged = true;
            return {
              type: "human_review",
              data: { ...b.data, state: "ignored" },
            } as ContentBlock;
          });
          if (!blockChanged) return m;
          touched = true;
          return { ...m, blocks };
        });
        return touched ? { messages } : s;
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

    reset: () => {
      const cur = get().conversationId;
      if (cur) latestSeqByConv.delete(cur);
      set({ conversationId: null, systemPromptId: null, messages: [], rawEvents: [], tasks: [], isStreaming: false, isLoadingHistory: false, error: null, pendingTextQueue: [], isTyping: false });
    },
  };
});
