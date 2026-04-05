import { useState } from "react";
import { useConversationStore, type AgentTask } from "@/stores/conversationStore";

const MAX_VISIBLE = 8;

function isBlocked(task: AgentTask, doneIds: Set<number>): boolean {
  return task.depends_on.length > 0 && !task.depends_on.every((id) => doneIds.has(id));
}

function unblockedBlockers(task: AgentTask, doneIds: Set<number>): number[] {
  return task.depends_on.filter((id) => !doneIds.has(id));
}

// ── Status icons ──

function CheckboxDone() {
  return (
    <svg className="w-4 h-4 text-accent shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CheckboxEmpty() {
  return (
    <div className="w-4 h-4 rounded-full border-2 border-border shrink-0" />
  );
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 text-accent animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4 text-text-tertiary/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

// ── Task row ──

function TaskRow({ task, doneIds }: { task: AgentTask; doneIds: Set<number> }) {
  const blocked = task.status === "pending" && isBlocked(task, doneIds);
  const blockers = blocked ? unblockedBlockers(task, doneIds) : [];

  return (
    <div
      className={`flex items-center gap-2 py-1 transition-opacity ${blocked ? "opacity-40" : ""}`}
      title={blocked ? `Blocked by ${blockers.map((id) => `#${id}`).join(", ")}` : undefined}
    >
      {task.status === "done" ? (
        <CheckboxDone />
      ) : task.status === "in_progress" ? (
        <SpinnerIcon />
      ) : blocked ? (
        <LockIcon />
      ) : (
        <CheckboxEmpty />
      )}
      <span
        className={`text-xs leading-relaxed ${
          task.status === "done"
            ? "text-text-tertiary line-through"
            : "text-text-primary"
        }`}
      >
        {task.title}
      </span>
      {blocked && (
        <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
          blocked by {blockers.map((id) => `#${id}`).join(", ")}
        </span>
      )}
    </div>
  );
}

// ── Main panel ──

export function TaskListPanel() {
  const tasks = useConversationStore((s) => s.tasks);
  const [showAll, setShowAll] = useState(false);

  if (tasks.length === 0) return null;

  const doneIds = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
  const doneCount = doneIds.size;
  const total = tasks.length;
  const allDone = doneCount === total;
  const progress = total > 0 ? (doneCount / total) * 100 : 0;

  const visibleTasks = showAll ? tasks : tasks.slice(0, MAX_VISIBLE);
  const hasMore = tasks.length > MAX_VISIBLE && !showAll;

  return (
    <div className="my-3 rounded-xl border border-border-light bg-surface-alt p-3 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 px-1">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
        </svg>
        <span className="text-xs font-semibold text-text-primary">Task List</span>
        {allDone ? (
          <span className="text-[10px] font-medium text-success bg-success-light/50 px-1.5 py-0.5 rounded-full">
            All done
          </span>
        ) : (
          <span className="text-[11px] text-text-tertiary">{doneCount}/{total} done</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mx-1 mb-2.5 h-1 rounded-full bg-border-light overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Task rows */}
      <div className="px-1 space-y-0.5">
        {visibleTasks.map((task) => (
          <TaskRow key={task.id} task={task} doneIds={doneIds} />
        ))}
      </div>

      {/* Show more */}
      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 px-1 text-[11px] text-accent hover:text-accent-hover transition-colors"
        >
          Show all {total} tasks
        </button>
      )}
    </div>
  );
}
