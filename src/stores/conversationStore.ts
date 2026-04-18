import { create } from "zustand";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";
import { pickWorkerCharacter, type WorkerCharacter } from "@/workerCharacters";

// ── Helpers ──

let messageIdCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`;
}

function tryDecodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

function asRecord(val: unknown): Record<string, unknown> {
  return typeof val === "object" && val !== null ? (val as Record<string, unknown>) : {};
}

// ── Types ──

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

export interface WorkerToolCall {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
}

export interface WorkerState {
  workerId: string;
  description: string;
  status: "running" | "done" | "error";
  character: WorkerCharacter;
  characterIndex: number;
  text: string;
  toolCalls: WorkerToolCall[];
  summary?: string;
  error?: string;
  phase?: string;
  groupId?: string;
}

export interface AgentTask {
  id: number;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "done";
  result: string | null;
  depends_on: number[];
}

export const PLANNING_TOOL_NAMES = new Set([
  "create_task", "update_task", "list_tasks", "get_task",
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

export type ContentBlock =
  | { type: "Message"; content: string }
  | { type: "Reasoning"; content: string }
  | { type: "ToolCallStart"; data: ToolCallData }
  | { type: "human_review"; data: HumanReviewData }
  | { type: "TaskList" }
  | { type: "ContextCompacting"; done: boolean }
  | { type: "SlideOutline"; data: SlideOutlineData }
  | { type: "SlideDesignSystem"; data: SlideDesignSystemData }
  | { type: "MemoryUpdate"; data: MemoryUpdateData }
  | { type: "PhaseTransition"; data: { phase: string; completedCount: number; failedCount: number; totalCount: number; message: string } }
  | { type: "AnalysisPhaseDigest"; data: { digestText: string; producerCompleted: number; producerFailed: number } }
  | { type: "DeliverablePhaseStarted"; data: { deliverableCount: number; deliverableTypes: string[] } }
  | { type: "FinalPhaseStarted"; data: { phase: string; message: string } }
  | { type: "SheetProgress"; data: { step: string; icon: string; label: string; detail: string } }
  | { type: "SheetToolProgress"; data: { toolName: string; step: string; stepLabel: string; stepIndex: number; totalSteps: number } }
  | { type: "SheetDeliverableReady"; data: { kind: string; icon: string; label: string; path: string; extra?: string } }
  | { type: "SheetTaskStatus"; data: { taskId: string; title: string; engine: string; status: "running" | "done" | "failed"; errorMessage?: string } }
  | { type: "SwarmGroupStarted"; data: { groupId: string; phase: string; workerCount: number; label: string } };

export interface Message {
  id: string;
  role: "user" | "assistant";
  blocks: ContentBlock[];
  nodes: NodeData[];
  workers: Record<string, WorkerState>;
  sources: SourceCitation[];
  error?: { errorType: string; message: string; recoverable: boolean };
}

export interface RawEvent {
  timestamp: number;
  type: string;
  data: unknown;
  role?: "user" | "assistant";
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

export function applyStreamEvent(messages: Message[], event: AgentStreamEvent): Message[] {
  const msgs = [...messages];

  // HumanInput: insert user message before the trailing assistant message (ResumeStream replay)
  if (event.event.case === "custom") {
    const custom = event.event.value;
    if (custom.type === "HumanInput") {
      const payload = asRecord(tryDecodeJson(custom.payload));
      const blocks = (payload.blocks as { type: string; data: unknown }[]) ?? [];
      const userText = blocks
        .filter((b) => b.type === "Message")
        .map((b) => ((b.data as Record<string, unknown>)?.content as string) ?? "")
        .join("\n");
      if (userText) {
        const userMsg: Message = {
          id: nextMessageId(), role: "user",
          blocks: [{ type: "Message", content: userText }], nodes: [], workers: {}, sources: [],
        };
        const lastIdx = msgs.length - 1;
        if (msgs[lastIdx]?.role === "assistant") {
          msgs.splice(lastIdx, 0, userMsg);
        } else {
          msgs.push(userMsg);
        }
      }
      return msgs;
    }
  }

  const last = msgs[msgs.length - 1];
  if (!last || last.role !== "assistant") return msgs;

  const updated = { ...last, blocks: [...last.blocks], workers: { ...last.workers }, sources: [...last.sources] };

  switch (event.event.case) {
    case "messageDelta": {
      const delta = event.event.value;
      if (delta.content) appendOrPushBlock(updated.blocks, "Message", delta.content);
      break;
    }
    case "reasoningDelta": {
      const delta = event.event.value;
      if (delta.content) appendOrPushBlock(updated.blocks, "Reasoning", delta.content);
      break;
    }
    case "toolCallStart": {
      const tc = event.event.value;
      const input = asRecord(tryDecodeJson(tc.toolInput));
      updated.blocks.push({
        type: "ToolCallStart",
        data: { toolCallId: tc.toolCallId, toolName: tc.toolName, toolInput: input },
      });
      break;
    }
    case "toolCallResult": {
      const tr = event.event.value;
      const result = asRecord(tryDecodeJson(tr.toolResult));
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
      const payload = (tryDecodeJson(custom.payload) ?? {}) as Record<string, unknown>;

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
        updated.blocks.push({
          type: "human_review",
          data: { payload, resolved: false },
        });
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

      // Phase transition event from sheet_agent
      if (custom.type === "SheetProducerPhaseComplete") {
        updated.blocks.push({
          type: "PhaseTransition",
          data: {
            phase: "producer_complete",
            completedCount: (payload.completed_count as number) ?? 0,
            failedCount: (payload.failed_count as number) ?? 0,
            totalCount: (payload.total_count as number) ?? 0,
            message: "分析阶段已完成，正在生成最终交付物…",
          },
        });
        break;
      }

      // Analysis phase digest — transition summary between producer and deliverable phases
      if (custom.type === "SheetAnalysisPhaseDigest") {
        updated.blocks.push({
          type: "AnalysisPhaseDigest",
          data: {
            digestText: (payload.digest_text as string) ?? "",
            producerCompleted: (payload.producer_completed as number) ?? 0,
            producerFailed: (payload.producer_failed as number) ?? 0,
          },
        });
        break;
      }

      // Deliverable phase started — parallel deliverable generation begins
      if (custom.type === "SheetDeliverablePhaseStarted") {
        updated.blocks.push({
          type: "DeliverablePhaseStarted",
          data: {
            deliverableCount: (payload.deliverable_count as number) ?? 0,
            deliverableTypes: (payload.deliverable_types as string[]) ?? [],
          },
        });
        break;
      }

      // Final phase started — terminal summary generation begins (Phase C)
      if (custom.type === "SheetFinalPhaseStarted") {
        updated.blocks.push({
          type: "PhaseTransition",
          data: {
            phase: "final",
            completedCount: 0,
            failedCount: 0,
            totalCount: 0,
            message: "✍️ 正在生成最终总结…",
          },
        });
        break;
      }

      // ── Sheet progress events (pipeline stage notifications) ──
      if (custom.type === "SheetFilesIngested") {
        // v2.0: 多轮追加式 ingest
        const roundSeq = (payload.round_seq as number) ?? 0;
        const newCount = (payload.new_file_count as number) ?? 0;
        const replacedCount = (payload.replaced_file_count as number) ?? 0;
        const totalActive = (payload.total_active_files as number) ?? 0;
        const digest = (payload.request_digest as string) ?? "";
        const labelParts: string[] = [];
        if (newCount > 0) labelParts.push(`新增 ${newCount}`);
        if (replacedCount > 0) labelParts.push(`覆盖 ${replacedCount}`);
        const label = roundSeq
          ? `第 ${roundSeq} 轮 · ${labelParts.join(" / ") || "无变更"}（共 ${totalActive} 份在用）`
          : `已接收 ${newCount + replacedCount} 个文件`;
        updated.blocks.push({
          type: "SheetProgress",
          data: {
            step: "files_ingested",
            icon: "📁",
            label,
            detail: digest ? `本轮：${digest}` : "",
          },
        });
        break;
      }

      if (custom.type === "SheetRequestIntentInferred") {
        const goal = (payload.primary_goal as string) ?? "";
        const goalLabels: Record<string, string> = {
          report: "数据分析报告", dashboard: "数据座舱", analyze: "通用分析",
          chart_only: "图表生成", pivot: "透视汇总", export: "格式导出",
          search_table: "搜索成表", enrich: "数据扩充", generate_table: "创意建表",
        };
        const isMultiGoal = payload.is_multi_goal as boolean;
        updated.blocks.push({
          type: "SheetProgress",
          data: {
            step: "intent_inferred",
            icon: "🎯",
            label: `意图识别：${goalLabels[goal] ?? goal}`,
            detail: isMultiGoal ? "多目标请求" : "",
          },
        });
        break;
      }

      if (custom.type === "SheetExcelStructureInspected") {
        const sheetCount = (payload.sheet_count as number) ?? 0;
        updated.blocks.push({
          type: "SheetProgress",
          data: {
            step: "excel_inspected",
            icon: "🔍",
            label: `Excel 结构探查完成`,
            detail: sheetCount > 0 ? `发现 ${sheetCount} 个工作表` : "",
          },
        });
        break;
      }

      if (custom.type === "SheetDatasetProfileGenerated") {
        const rows = (payload.row_count as number) ?? 0;
        const cols = (payload.column_count as number) ?? 0;
        updated.blocks.push({
          type: "SheetProgress",
          data: {
            step: "profile_generated",
            icon: "📊",
            label: `数据画像完成`,
            detail: rows > 0 ? `${rows.toLocaleString()} 行 × ${cols} 列` : "",
          },
        });
        break;
      }

      if (custom.type === "SheetAnalysisPlanCreated") {
        const taskCount = (payload.task_count as number) ?? 0;
        updated.blocks.push({
          type: "SheetProgress",
          data: {
            step: "plan_created",
            icon: "📋",
            label: `分析计划已生成`,
            detail: taskCount > 0 ? `共 ${taskCount} 个分析任务` : "",
          },
        });
        break;
      }

      // ── Sheet deliverable ready events ──
      if (custom.type === "SheetHtmlReportReady") {
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "report",
            icon: "📄",
            label: "HTML 报告已生成",
            path: (payload.report_path as string) ?? "",
          },
        });
        break;
      }

      if (custom.type === "SheetDashboardReady") {
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "dashboard",
            icon: "📈",
            label: "数据座舱已生成",
            path: (payload.output_path as string) ?? "",
          },
        });
        break;
      }

      if (custom.type === "SheetFinalSummaryReady") {
        const primaryOutput = (payload.primary_output as string) ?? "";
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "summary",
            icon: "✨",
            label: "分析完成",
            path: (payload.summary_path as string) ?? "",
            extra: primaryOutput ? `主产物：${primaryOutput.split("/").pop()}` : "",
          },
        });
        break;
      }

      if (custom.type === "SheetExcelExported") {
        const sheetCount = (payload.sheet_count as number) ?? 0;
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "excel",
            icon: "📊",
            label: "Excel 已导出",
            path: (payload.export_path as string) ?? "",
            extra: sheetCount > 0 ? `${sheetCount} 个工作表` : "",
          },
        });
        break;
      }

      // ── Sandbox task lifecycle events ──
      if (custom.type === "SheetSandboxTaskStarted") {
        updated.blocks.push({
          type: "SheetTaskStatus",
          data: {
            taskId: (payload.task_id as string) ?? "",
            title: (payload.title as string) ?? "",
            engine: (payload.engine as string) ?? "",
            status: "running",
          },
        });
        break;
      }

      if (custom.type === "SheetSandboxTaskCompleted") {
        const status = (payload.status as string) ?? "";
        const isFailed = status === "failed";
        updated.blocks.push({
          type: "SheetTaskStatus",
          data: {
            taskId: (payload.task_id as string) ?? "",
            title: "",
            engine: (payload.engine as string) ?? "",
            status: isFailed ? "failed" : "done",
            errorMessage: isFailed ? ((payload.error_message as string) ?? "") : undefined,
          },
        });
        break;
      }

      if (custom.type === "SheetChartGenerated") {
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "chart",
            icon: "📉",
            label: "图表已生成",
            path: (payload.chart_output_path as string) ?? "",
          },
        });
        break;
      }

      // Tool progress events (creative_table, search_table step updates)
      if (custom.type === "SheetToolProgress") {
        updated.blocks.push({
          type: "SheetToolProgress",
          data: {
            toolName: (payload.tool_name as string) ?? "",
            step: (payload.step as string) ?? "",
            stepLabel: (payload.step_label as string) ?? "",
            stepIndex: (payload.step_index as number) ?? 0,
            totalSteps: (payload.total_steps as number) ?? 0,
          },
        });
        break;
      }

      if (custom.type === "SheetCreativeTableReady") {
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "creative_table",
            icon: "📝",
            label: `创意表格「${(payload.table_name as string) ?? ""}」已生成`,
            path: (payload.output_path as string) ?? "",
            extra: `${(payload.row_count as number) ?? 0} 行`,
          },
        });
        break;
      }

      if (custom.type === "SheetSearchTableReady") {
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "search_table",
            icon: "🔍",
            label: "搜索成表完成",
            path: (payload.output_path as string) ?? "",
            extra: `${(payload.row_count as number) ?? 0} 行 × ${(payload.column_count as number) ?? 0} 列`,
          },
        });
        break;
      }

      if (custom.type === "SheetDataEnriched") {
        updated.blocks.push({
          type: "SheetDeliverableReady",
          data: {
            kind: "enriched",
            icon: "🔗",
            label: "数据扩充完成",
            path: (payload.output_path as string) ?? "",
            extra: `${(payload.row_count as number) ?? 0} 行`,
          },
        });
        break;
      }

      // Swarm group started — marks the beginning of a new worker group
      if (custom.type === "SwarmGroupStarted") {
        updated.blocks.push({
          type: "SwarmGroupStarted",
          data: {
            groupId: (payload.group_id as string) ?? "",
            phase: (payload.phase as string) ?? "producer",
            workerCount: (payload.worker_count as number) ?? 0,
            label: (payload.label as string) ?? "",
          },
        });
        break;
      }

      // Worker events
      const workerId = payload.worker_id as string | undefined;
      if (workerId) {
        updated.workers = { ...updated.workers };
        switch (custom.type) {
          case "WorkerStart": {
            const usedIndices = new Set(Object.values(updated.workers).map((w) => w.characterIndex));
            const { index, character } = pickWorkerCharacter(usedIndices, workerId);
            updated.workers[workerId] = {
              workerId,
              description: (payload.description as string) ?? "",
              status: "running",
              character,
              characterIndex: index,
              text: "",
              toolCalls: [],
              phase: (payload.phase as string) ?? "producer",
              groupId: (payload.group_id as string) ?? "",
            };
            break;
          }
          case "WorkerDelta":
          case "MessageDelta": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = { ...w, text: w.text + ((payload.content as string) ?? "") };
            }
            break;
          }
          case "WorkerToolCall":
          case "ToolCallStart": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = {
                ...w,
                toolCalls: [...w.toolCalls, { toolName: (payload.tool_name as string) ?? "", toolInput: (payload.tool_input as Record<string, unknown>) ?? {} }],
              };
            }
            break;
          }
          case "WorkerToolResult":
          case "ToolCallResult": {
            const w = updated.workers[workerId];
            if (w) {
              const toolCalls = [...w.toolCalls];
              for (let i = toolCalls.length - 1; i >= 0; i--) {
                if (toolCalls[i].toolName === (payload.tool_name as string) && !toolCalls[i].toolResult) {
                  toolCalls[i] = { ...toolCalls[i], toolResult: payload.tool_result as Record<string, unknown> };
                  break;
                }
              }
              updated.workers[workerId] = { ...w, toolCalls };
            }
            break;
          }
          case "WorkerComplete":
          case "WorkerEnd": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = { ...w, status: "done", summary: (payload.summary as string) ?? "" };
            }
            break;
          }
          case "WorkerError": {
            const w = updated.workers[workerId];
            if (w) {
              updated.workers[workerId] = { ...w, status: "error", error: (payload.error as string) ?? "Unknown error" };
            }
            break;
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
  return { timestamp: Date.now(), type: event.event.case ?? "unknown", data: cleaned, role: "assistant" };
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
  setStreaming: (v: boolean) => void;
  setLoadingHistory: (v: boolean) => void;
  setError: (err: string | null) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  resolveHumanReview: () => void;
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
    setStreaming: (v) => set({ isStreaming: v }),
    setLoadingHistory: (v) => set({ isLoadingHistory: v }),
    setError: (err) => set({ error: err }),

    addUserMessage: (content) =>
      set((s) => ({
        messages: [
          ...s.messages,
          { id: nextMessageId(), role: "user", blocks: [{ type: "Message", content }], nodes: [], workers: {}, sources: [] },
        ],
      })),

    startAssistantMessage: () =>
      set((s) => ({
        messages: [
          ...s.messages,
          { id: nextMessageId(), role: "assistant", blocks: [], nodes: [], workers: {}, sources: [] },
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
      
      const rawEvent = buildRawEvent(event);

      // Handle text deltas via queue
      if (event.event.case === "messageDelta") {
        const value = event.event.value;
        if (!value?.content) return;
        set((prev) => ({
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
        const payload = asRecord(tryDecodeJson(event.event.value.payload));
        const action = payload.action as string;
        if (action === "create") {
          const tasks = payload.tasks as AgentTask[] | undefined;
          if (tasks) newTasks = tasks;
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
        messages: applyStreamEvent(prev.messages, event),
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

    setMessages: (messages) => set({ messages, rawEvents: [] }),

    reset: () =>
      set({ conversationId: null, systemPromptId: null, messages: [], rawEvents: [], tasks: [], isStreaming: false, isLoadingHistory: false, error: null, pendingTextQueue: [], isTyping: false }),
  };
});
