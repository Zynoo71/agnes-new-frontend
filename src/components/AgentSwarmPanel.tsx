import { useState, useMemo, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import type { ToolCallData, WorkerState } from "@/stores/conversationStore";
import { getWorkerAvatar, pickWorkerCharacter, type WorkerCharacter } from "@/workerCharacters";
import { ToolCallBlock } from "./ToolRenderer/ToolCallBlock";

// ── Types ──

interface HistoryWorker {
  workerId: string;
  description: string;
  status: "completed" | "failed" | "skipped";
  toolsUsed: string[];
  durationSeconds: number;
  error?: string;
  character: WorkerCharacter;
  phase?: string;
  summary?: string;
  skipReason?: string;
}

interface AgentSwarmPanelProps {
  liveWorkers: Record<string, WorkerState>;
  spawnToolCalls: ToolCallData[];
  groupLabel?: string;
  groupPhase?: string;
}

// ── Helpers ──

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m${secs}s`;
}

function buildHistoryWorkers(toolCalls: ToolCallData[]): HistoryWorker[] {
  const usedIndices = new Set<number>();
  const workers: HistoryWorker[] = [];

  for (const tc of toolCalls) {
    if (!tc.toolResult) continue;
    const r = tc.toolResult;

    // spawn_worker_group: 从 worker_results 数组提取每个 worker
    if (tc.toolName === "spawn_worker_group" && Array.isArray(r.worker_results)) {
      for (const wr of r.worker_results as Record<string, unknown>[]) {
        const wId = (wr.worker_id as string) ?? `group-${workers.length}`;
        const { index, character } = pickWorkerCharacter(usedIndices, wId);
        usedIndices.add(index);
        const rawStatus = (wr.status as string) ?? "completed";
        workers.push({
          workerId: wId,
          description: (wr.description as string) ?? "",
          status: rawStatus === "completed" ? "completed" : rawStatus === "skipped" ? "skipped" : "failed",
          toolsUsed: (wr.tools_used as string[]) ?? [],
          durationSeconds: (wr.duration_seconds as number) ?? 0,
          error: wr.error as string | undefined,
          character,
          phase: (wr.phase as string) ?? "producer",
          summary: (wr.summary as string) ?? "",
          skipReason: wr.skip_reason as string | undefined,
        });
      }
    } else {
      // spawn_worker: 单个 worker 结果
      const wId = (r.worker_id as string) ?? tc.toolCallId;
      const { index, character } = pickWorkerCharacter(usedIndices, wId);
      usedIndices.add(index);
      workers.push({
        workerId: wId,
        description: (r.description as string) ?? "",
        status: (r.status as "completed" | "failed") ?? "completed",
        toolsUsed: (r.tools_used as string[]) ?? [],
        durationSeconds: (r.duration_seconds as number) ?? 0,
        error: r.error as string | undefined,
        character,
        phase: "producer",
        summary: "",
      });
    }
  }

  return workers;
}

/** Smooth height transition wrapper. */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      className="overflow-hidden transition-all duration-200 ease-in-out"
      style={{ maxHeight: open ? `${height + 16}px` : "0px", opacity: open ? 1 : 0 }}
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

// ── Status Badge ──

function StatusBadge({ status, duration }: { status: string; duration?: number }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent bg-accent/8 px-1.5 py-0.5 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        Working
      </span>
    );
  }
  if (status === "done" || status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success bg-success/8 px-1.5 py-0.5 rounded-full">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        {duration != null ? formatDuration(duration) : "Done"}
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-tertiary bg-surface-hover px-1.5 py-0.5 rounded-full">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l4-4 4 4M7 4v16" />
        </svg>
        Skipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-error bg-error/8 px-1.5 py-0.5 rounded-full">
      Failed
    </span>
  );
}

// ── Main Panel ──

// ── 从 spawn_worker_group 结果提取 group 级别元信息 ──
interface GroupMeta {
  overallStatus: string;
  producerStatus: string;
  finalizerStatus: string;
  finalizerSkipped: boolean;
  skipReason: string;
  totalDuration: number;
  producerCount: number;
  finalizerCount: number;
}

function extractGroupMeta(toolCalls: ToolCallData[]): GroupMeta | null {
  for (const tc of toolCalls) {
    if (tc.toolName === "spawn_worker_group" && tc.toolResult) {
      const r = tc.toolResult as Record<string, unknown>;
      return {
        overallStatus: (r.status as string) ?? "",
        producerStatus: (r.producer_status as string) ?? "",
        finalizerStatus: (r.finalizer_status as string) ?? "",
        finalizerSkipped: (r.finalizer_skipped as boolean) ?? false,
        skipReason: (r.finalizer_skip_reason as string) ?? "",
        totalDuration: (r.total_duration_seconds as number) ?? 0,
        producerCount: (r.producer_count as number) ?? 0,
        finalizerCount: (r.finalizer_count as number) ?? 0,
      };
    }
  }
  return null;
}

// ── Group Status Badge ──

function GroupStatusBadge({ status }: { status: string }) {
  if (status === "all_completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success bg-success/8 px-1.5 py-0.5 rounded-full">
        ✅ 全部完成
      </span>
    );
  }
  if (status === "partial_success") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
        ⚠️ 部分完成
      </span>
    );
  }
  if (status === "all_failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-error bg-error/8 px-1.5 py-0.5 rounded-full">
        ❌ 全部失败
      </span>
    );
  }
  return null;
}

const MAX_VISIBLE_HEIGHT = 400;

export function AgentSwarmPanel({ liveWorkers, spawnToolCalls, groupLabel, groupPhase }: AgentSwarmPanelProps) {
  const hasLiveWorkers = Object.keys(liveWorkers).length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  const historyKey = spawnToolCalls.map((tc) => tc.toolCallId).join(",");
  const historyWorkers = useMemo(
    () => (hasLiveWorkers ? [] : buildHistoryWorkers(spawnToolCalls)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyKey, hasLiveWorkers],
  );

  // 从 spawn_worker_group 结果提取 group 级别元信息（仅历史模式有值）
  const groupMeta = useMemo(
    () => (hasLiveWorkers ? null : extractGroupMeta(spawnToolCalls)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyKey, hasLiveWorkers],
  );

  const liveEntries = Object.values(liveWorkers);
  const taskCount = hasLiveWorkers ? liveEntries.length : historyWorkers.length;
  const doneCount = hasLiveWorkers
    ? liveEntries.filter((w) => w.status === "done").length
    : historyWorkers.filter((w) => w.status === "completed" || w.status === "skipped").length;
  const hasRunning = hasLiveWorkers && liveEntries.some((w) => w.status === "running");

  // Auto-scroll to the active (running) worker
  useEffect(() => {
    if (!hasRunning || !activeRef.current || !scrollRef.current) return;
    const container = scrollRef.current;
    const active = activeRef.current;
    const top = active.offsetTop - container.offsetTop;
    const isVisible = top >= container.scrollTop && top < container.scrollTop + container.clientHeight - 60;
    if (!isVisible) {
      container.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    }
  });

  if (taskCount === 0) return null;

  const progress = taskCount > 0 ? (doneCount / taskCount) * 100 : 0;

  return (
    <div className="my-3 rounded-xl border border-border-light bg-surface-alt shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <svg className="w-4 h-4 text-text-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <span className="text-xs font-semibold text-text-primary">Agent Swarm</span>
        {groupLabel && (
          <span className="text-[11px] font-medium text-accent">{groupLabel}</span>
        )}
        <span className="text-[11px] text-text-tertiary">
          {doneCount}/{taskCount}
        </span>
        {/* Group status badge (history mode only) */}
        {groupMeta && <GroupStatusBadge status={groupMeta.overallStatus} />}
        {/* Mini progress bar */}
        <div className="flex-1 h-1 rounded-full bg-border-light overflow-hidden max-w-[80px]">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Total duration (history mode) */}
        {groupMeta && groupMeta.totalDuration > 0 && (
          <span className="text-[10px] text-text-tertiary">{formatDuration(groupMeta.totalDuration)}</span>
        )}
        {hasRunning && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />
        )}
      </div>

      {/* Group-level finalizer skip reason */}
      {groupMeta?.finalizerSkipped && groupMeta.skipReason && (
        <div className="mx-2.5 mb-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5">
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            ⚠️ 收口任务已跳过：{groupMeta.skipReason}
          </p>
        </div>
      )}

      {/* Scrollable worker list */}
      <div
        ref={scrollRef}
        className="overflow-y-auto px-2.5 pb-2.5 space-y-1.5"
        style={{ maxHeight: MAX_VISIBLE_HEIGHT }}
      >
        {hasLiveWorkers
          ? liveEntries.map((w, i) => {
              const isActive = w.status === "running";
              return (
                <div key={w.workerId} ref={isActive ? activeRef : undefined}>
                  <LiveWorkerCard worker={w} index={i + 1} />
                </div>
              );
            })
          : historyWorkers.map((w, i) => (
              <HistoryWorkerCard key={w.workerId} worker={w} index={i + 1} />
            ))}
      </div>
    </div>
  );
}

// ── Live Worker Card ──

function LiveWorkerCard({ worker, index }: { worker: WorkerState; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const avatarUri = useMemo(() => getWorkerAvatar(worker.character.name), [worker.character.name]);

  const isRunning = worker.status === "running";
  const completedToolCount = worker.toolCalls.filter((tc) => tc.toolResult).length;
  const runningToolCount = worker.toolCalls.filter((tc) => !tc.toolResult).length;
  const hasDetails = worker.toolCalls.length > 0 || worker.text || worker.summary || worker.error;

  return (
    <div
      className={`rounded-lg border bg-surface overflow-hidden transition-colors ${
        isRunning ? "border-accent/30" : "border-border-light"
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: worker.status === "error" ? "var(--color-error)" : worker.character.color }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10px] font-mono text-text-tertiary/60 w-4 text-right shrink-0">
          {String(index).padStart(2, "0")}
        </span>
        <img src={avatarUri} alt={worker.character.name} className="w-5 h-5 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-primary truncate">{worker.character.name}</span>
            {worker.phase === "finalizer" && (
              <span className="text-[9px] font-medium text-accent/80 bg-accent/8 px-1 py-0.5 rounded">收口</span>
            )}
            <StatusBadge status={worker.status} />
          </div>
          <p className="text-[11px] text-text-secondary truncate mt-0.5">{worker.description || "任务正在执行..."}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ProgressDots
            total={worker.toolCalls.length}
            completed={completedToolCount}
            running={runningToolCount}
            status={worker.status}
            color={worker.character.color}
          />
          {hasDetails && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-all ${
                expanded
                  ? "bg-accent/10 text-accent"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {expanded ? "Hide" : "Details"}
            </button>
          )}
        </div>
      </div>

      {/* Expandable details */}
      <Collapsible open={expanded}>
        <div className="border-t border-border-light px-3 py-2.5 ml-9 space-y-2">
          {worker.toolCalls.map((tc, i) => (
            <div key={i} className="[&>div]:shadow-none [&>div]:border-0 [&>div]:bg-background [&>div]:rounded-lg">
              <ToolCallBlock
                toolName={tc.toolName}
                toolInput={tc.toolInput}
                toolResult={tc.toolResult}
                toolCallId={`${worker.workerId}-${i}`}
              />
            </div>
          ))}

          {worker.text && (
            <div className="pl-3 border-l-2 border-border-light max-h-32 overflow-y-auto">
              <div className="prose-reasoning text-[11px] leading-relaxed text-text-secondary">
                <Markdown remarkPlugins={[remarkCjkFriendly]}>{worker.text}</Markdown>
              </div>
            </div>
          )}

          {worker.summary && (
            <div className="rounded-lg bg-success-light/50 px-2.5 py-2">
              <div className="prose-reasoning text-[11px] leading-relaxed text-text-primary">
                <Markdown remarkPlugins={[remarkCjkFriendly]}>{worker.summary}</Markdown>
              </div>
            </div>
          )}

          {worker.error && (
            <div className="rounded-lg bg-error-light px-2.5 py-2">
              <p className="text-[11px] text-error">{worker.error}</p>
            </div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

// ── History Worker Card ──

function HistoryWorkerCard({ worker, index }: { worker: HistoryWorker; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const avatarUri = useMemo(() => getWorkerAvatar(worker.character.name), [worker.character.name]);
  const hasDetails = worker.toolsUsed.length > 0 || worker.error || worker.summary || worker.skipReason;

  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        worker.status === "skipped" ? "border-border-light bg-surface opacity-70" : "border-border-light bg-surface"
      }`}
      style={{
        borderLeftWidth: 3,
        borderLeftColor:
          worker.status === "failed" ? "var(--color-error)"
          : worker.status === "skipped" ? "var(--color-border)"
          : worker.character.color,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[10px] font-mono text-text-tertiary/60 w-4 text-right shrink-0">
          {String(index).padStart(2, "0")}
        </span>
        <img src={avatarUri} alt={worker.character.name} className="w-5 h-5 rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-primary truncate">{worker.character.name}</span>
            {worker.phase === "finalizer" && (
              <span className="text-[9px] font-medium text-accent/80 bg-accent/8 px-1 py-0.5 rounded">收口</span>
            )}
            <StatusBadge status={worker.status} duration={worker.durationSeconds} />
          </div>
          <p className="text-[11px] text-text-secondary truncate mt-0.5">{worker.description}</p>
        </div>
        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={`text-[10px] font-medium px-2 py-0.5 rounded-md transition-all shrink-0 ${
              expanded
                ? "bg-accent/10 text-accent"
                : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {expanded ? "Hide" : "Details"}
          </button>
        )}
      </div>

      <Collapsible open={expanded}>
        <div className="border-t border-border-light px-3 py-2 ml-9 space-y-1.5">
          {worker.summary && (
            <div className="rounded-lg bg-success-light/50 px-2.5 py-2">
              <p className="text-[11px] leading-relaxed text-text-primary line-clamp-4">{worker.summary}</p>
            </div>
          )}
          {worker.toolsUsed.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {worker.toolsUsed.map((t, i) => (
                <span key={i} className="text-[10px] font-mono bg-surface-hover rounded px-1.5 py-0.5 text-text-secondary">
                  {t}
                </span>
              ))}
            </div>
          )}
          {worker.skipReason && (
            <div className="rounded-lg bg-surface-hover px-2.5 py-2">
              <p className="text-[11px] text-text-tertiary">{worker.skipReason}</p>
            </div>
          )}
          {worker.error && (
            <p className="text-[11px] text-error mt-1.5">{worker.error}</p>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

// ── Progress Dots ──

function ProgressDots({
  total,
  completed,
  running,
  status,
  color,
}: {
  total: number;
  completed: number;
  running: number;
  status: "running" | "done" | "error";
  color: string;
}) {
  if (total === 0 && status === "running") {
    return (
      <div className="flex gap-[2px] animate-gentle-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-1.5 h-1.5 rounded-[1px] bg-text-tertiary/30" />
        ))}
      </div>
    );
  }

  if (total === 0) return null;

  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: total }, (_, i) => {
        const isCompleted = i < completed;
        const isRunning = i >= completed && i < completed + running;
        return (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-[1px] transition-colors ${isRunning ? "animate-gentle-pulse" : ""}`}
            style={{
              backgroundColor: isCompleted
                ? color
                : isRunning
                  ? color + "80"
                  : "var(--color-border)",
            }}
          />
        );
      })}
    </div>
  );
}
