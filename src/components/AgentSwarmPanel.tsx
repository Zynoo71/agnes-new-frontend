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
  status: "completed" | "failed";
  toolsUsed: string[];
  durationSeconds: number;
  error?: string;
  character: WorkerCharacter;
}

interface AgentSwarmPanelProps {
  liveWorkers: Record<string, WorkerState>;
  spawnToolCalls: ToolCallData[];
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
  return toolCalls
    .filter((tc) => tc.toolResult)
    .map((tc) => {
      const r = tc.toolResult!;
      const { index, character } = pickWorkerCharacter(usedIndices);
      usedIndices.add(index);
      return {
        workerId: (r.worker_id as string) ?? tc.toolCallId,
        description: (r.description as string) ?? "",
        status: (r.status as "completed" | "failed") ?? "completed",
        toolsUsed: (r.tools_used as string[]) ?? [],
        durationSeconds: (r.duration_seconds as number) ?? 0,
        error: r.error as string | undefined,
        character,
      };
    });
}

/** Chevron icon that rotates when expanded. */
function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-text-tertiary transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
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

// ── Main Panel ──

export function AgentSwarmPanel({ liveWorkers, spawnToolCalls }: AgentSwarmPanelProps) {
  const hasLiveWorkers = Object.keys(liveWorkers).length > 0;

  const historyKey = spawnToolCalls.map((tc) => tc.toolCallId).join(",");
  const historyWorkers = useMemo(
    () => (hasLiveWorkers ? [] : buildHistoryWorkers(spawnToolCalls)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [historyKey, hasLiveWorkers],
  );

  const taskCount = hasLiveWorkers ? Object.keys(liveWorkers).length : historyWorkers.length;
  if (taskCount === 0) return null;

  return (
    <div className="my-3 rounded-xl border border-border-light bg-surface-alt p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2.5 px-1">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <span className="text-xs font-semibold text-text-primary">Agent Swarm</span>
        <span className="text-[11px] text-text-tertiary">{taskCount} Tasks</span>
      </div>

      {/* Worker cards */}
      <div className="space-y-2">
        {hasLiveWorkers
          ? Object.values(liveWorkers).map((w, i) => (
              <LiveWorkerCard key={w.workerId} worker={w} index={i + 1} />
            ))
          : historyWorkers.map((w, i) => (
              <HistoryWorkerCard key={w.workerId} worker={w} index={i + 1} />
            ))}
      </div>
    </div>
  );
}

// ── Live Worker Card ──

function LiveWorkerCard({ worker, index }: { worker: WorkerState; index: number }) {
  const [userToggled, setUserToggled] = useState(false);
  const autoExpanded = !userToggled && worker.status === "running";
  const [manualExpanded, setManualExpanded] = useState(false);
  const expanded = userToggled ? manualExpanded : autoExpanded;
  const avatarUri = useMemo(() => getWorkerAvatar(worker.character.name), [worker.character.name]);

  const handleToggle = () => {
    setUserToggled(true);
    setManualExpanded(!expanded);
  };

  const isRunning = worker.status === "running";
  const isDone = worker.status === "done";
  const isError = worker.status === "error";

  const completedToolCount = worker.toolCalls.filter((tc) => tc.toolResult).length;
  const runningToolCount = worker.toolCalls.filter((tc) => !tc.toolResult).length;

  return (
    <div
      className="rounded-lg border border-border-light bg-surface shadow-sm overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: isError ? "var(--color-error)" : worker.character.color }}
    >
      {/* Header row */}
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-surface-hover/50 transition-colors"
      >
        <Chevron expanded={expanded} />
        <img src={avatarUri} alt={worker.character.name} className="w-6 h-6 rounded-full shrink-0" />
        <span className="text-xs font-semibold text-text-primary">{worker.character.name}</span>

        {isRunning && (
          <span className="text-[10px] text-accent animate-gentle-pulse">Working...</span>
        )}
        {isDone && (
          <span className="text-[10px] text-success flex items-center gap-0.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            Done
          </span>
        )}
        {isError && (
          <span className="text-[10px] text-error">Error</span>
        )}

        <span className="ml-auto text-[11px] font-mono text-text-tertiary">
          {String(index).padStart(2, "0")}
        </span>
      </button>

      {/* Description + progress dots (always visible) */}
      <div className="px-3 pb-2 pl-[38px]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-secondary truncate flex-1">
            {worker.description}
          </span>
          <ProgressDots
            total={worker.toolCalls.length}
            completed={completedToolCount}
            running={runningToolCount}
            status={worker.status}
            color={worker.character.color}
          />
        </div>
      </div>

      {/* Expandable details */}
      <Collapsible open={expanded}>
        <div className="border-t border-border-light px-3 py-2.5 pl-[38px] space-y-2">
          {/* Tool calls — compact style, no extra border/shadow */}
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

          {/* Worker streaming text */}
          {worker.text && (
            <div className="pl-3 border-l-2 border-border-light max-h-32 overflow-y-auto">
              <div className="prose-reasoning text-[11px] leading-relaxed text-text-secondary">
                <Markdown remarkPlugins={[remarkCjkFriendly]}>{worker.text}</Markdown>
              </div>
            </div>
          )}

          {/* Summary */}
          {worker.summary && (
            <div className="rounded-lg bg-success-light/50 px-2.5 py-2">
              <div className="prose-reasoning text-[11px] leading-relaxed text-text-primary">
                <Markdown remarkPlugins={[remarkCjkFriendly]}>{worker.summary}</Markdown>
              </div>
            </div>
          )}

          {/* Error */}
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

  const isFailed = worker.status === "failed";

  return (
    <div
      className="rounded-lg border border-border-light bg-surface shadow-sm overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: isFailed ? "var(--color-error)" : worker.character.color }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-surface-hover/50 transition-colors"
      >
        <Chevron expanded={expanded} />
        <img src={avatarUri} alt={worker.character.name} className="w-6 h-6 rounded-full shrink-0" />
        <span className="text-xs font-semibold text-text-primary">{worker.character.name}</span>

        {!isFailed ? (
          <span className="text-[10px] text-success flex items-center gap-0.5">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            {formatDuration(worker.durationSeconds)}
          </span>
        ) : (
          <span className="text-[10px] text-error">Failed</span>
        )}

        <span className="ml-auto text-[11px] font-mono text-text-tertiary">
          {String(index).padStart(2, "0")}
        </span>
      </button>

      {/* Description (always visible) */}
      <div className="px-3 pb-2 pl-[38px]">
        <p className="text-[11px] text-text-secondary truncate">{worker.description}</p>
      </div>

      {/* Expandable: tools used + error */}
      <Collapsible open={expanded}>
        <div className="border-t border-border-light px-3 py-2 pl-[38px]">
          {worker.toolsUsed.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {worker.toolsUsed.map((t, i) => (
                <span key={i} className="text-[10px] font-mono bg-surface-hover rounded px-1.5 py-0.5 text-text-secondary">
                  {t}
                </span>
              ))}
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
