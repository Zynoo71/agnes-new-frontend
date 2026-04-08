import type { ReactNode } from "react";
import type { ToolRenderProps } from "../registry";

const ACTION_LABELS: Record<string, string> = {
  create: "创建任务",
  list: "查询任务列表",
  get: "查询任务详情",
  update: "更新任务",
  delete: "删除任务",
  toggle: "启用/禁用任务",
  run_now: "立即执行",
  history: "执行历史",
  get_execution: "执行详情",
};

const ACTION_COLORS: Record<string, string> = {
  create: "text-emerald-600",
  list: "text-blue-500",
  get: "text-blue-500",
  update: "text-amber-500",
  delete: "text-red-500",
  toggle: "text-purple-500",
  run_now: "text-emerald-600",
  history: "text-blue-500",
  get_execution: "text-blue-500",
};

function CalendarIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

/** 从 input 或 result 中提取 action */
function getAction(input: Record<string, unknown>, result?: Record<string, unknown>): string {
  if (typeof input.action === "string") return input.action;
  if (input.params && typeof input.params === "object") {
    const nestedAction = (input.params as Record<string, unknown>).action;
    if (typeof nestedAction === "string") return nestedAction;
  }
  if (typeof result?.action === "string") return result.action;
  return "";
}

/** 任务名 + Job ID（name 来自 tool artifact，比单独 ID 更易读） */
function JobTitleBlock({ name, jobId, children }: { name?: string; jobId?: unknown; children?: ReactNode }) {
  const idStr = jobId != null && jobId !== "" ? String(jobId) : "—";
  return (
    <div className="space-y-1">
      {name ? (
        <div className="font-medium text-text-primary text-[12px] leading-snug break-words">{name}</div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-text-tertiary shrink-0">Job ID</span>
        <span className="font-mono text-text-secondary">{idStr}</span>
        {children}
      </div>
    </div>
  );
}

/** 不要用 result.job ?? result 合并：job 若为异常对象会盖住顶层的 job_id / enabled */
function getNestedJobRecord(result: Record<string, unknown>): Record<string, unknown> | undefined {
  const j = result.job;
  if (j != null && typeof j === "object" && !Array.isArray(j)) {
    return j as Record<string, unknown>;
  }
  return undefined;
}

function resolveJobArtifactFields(result: Record<string, unknown>) {
  const nested = getNestedJobRecord(result);
  const jobId = result.job_id ?? result.id ?? nested?.job_id ?? nested?.id;
  const name =
    (typeof result.name === "string" ? result.name : "") ||
    (typeof nested?.name === "string" ? nested.name : "");

  let enabledKnown: boolean | null = null;
  if (typeof result.enabled === "boolean") enabledKnown = result.enabled;
  else if (nested && typeof nested.enabled === "boolean") enabledKnown = nested.enabled;
  else if (nested && typeof nested.status === "number") enabledKnown = nested.status === 1;
  else if (typeof result.status === "number") enabledKnown = result.status === 1;

  return {
    jobId,
    name,
    enabledKnown,
    cronExpr: nested?.cron_expr ?? result.cron_expr,
    scheduleType: nested?.schedule_type ?? result.schedule_type,
  };
}

function ActionSection({ action }: { action: string }) {
  if (!action) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-text-tertiary font-medium">action</span>
        <span className={`font-mono font-semibold ${ACTION_COLORS[action] ?? "text-text-primary"}`}>
          {action}
        </span>
        {ACTION_LABELS[action] && (
          <span className="text-text-tertiary">— {ACTION_LABELS[action]}</span>
        )}
      </div>
    </div>
  );
}

function ResultSection({ action, result }: { action: string; result: Record<string, unknown> }) {
  // create
  if (action === "create") {
    const n = typeof result.name === "string" ? result.name : "";
    return (
      <div className="mt-2 bg-background rounded-lg p-2.5 border border-border-light text-[11px] flex items-start justify-between gap-3">
        <JobTitleBlock name={n || undefined} jobId={result.job_id} />
        <span className="shrink-0 text-emerald-600 font-medium">已创建</span>
      </div>
    );
  }

  // list
  if (action === "list") {
    const jobs = Array.isArray(result.jobs) ? result.jobs : [];
    const totalLabel = String(result.total ?? jobs.length);
    return (
      <div className="mt-2 space-y-1">
        <div className="text-[11px] text-text-tertiary">共 {totalLabel} 个任务</div>
        {jobs.slice(0, 5).map((job: unknown, idx: number) => {
          const j = job as Record<string, unknown>;
          const jid = j.job_id ?? j.id;
          const cronExpr = j.cron_expr != null && String(j.cron_expr) !== "" ? String(j.cron_expr) : "";
          return (
            <div key={String(jid ?? `job-${idx}`)} className="bg-background rounded-lg p-2 border border-border-light text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary truncate">{String(j.name ?? jid ?? "—")}</span>
                <span className={`ml-auto shrink-0 font-mono ${j.enabled ? "text-emerald-600" : "text-text-tertiary"}`}>
                  {j.enabled ? "启用" : "禁用"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-text-tertiary">
                <span className="shrink-0">Job ID</span>
                <span className="font-mono text-text-secondary">{jid != null && jid !== "" ? String(jid) : "—"}</span>
              </div>
              {cronExpr && (
                <div className="text-text-tertiary mt-0.5 font-mono">{cronExpr}</div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // update — 与 create 一致：JobTitleBlock 必显 Job ID；启用/禁用仅在有明确布尔或 proto status 时显示
  if (action === "update") {
    const { jobId, name, enabledKnown, cronExpr, scheduleType } = resolveJobArtifactFields(result);
    return (
      <div className="mt-2 bg-background rounded-lg p-2.5 border border-border-light text-[11px] flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <JobTitleBlock name={name || undefined} jobId={jobId}>
            {enabledKnown !== null && (
              <span className={`ml-auto shrink-0 font-mono ${enabledKnown ? "text-emerald-600" : "text-text-tertiary"}`}>
                {enabledKnown ? "启用" : "禁用"}
              </span>
            )}
          </JobTitleBlock>
          {cronExpr != null && String(cronExpr) !== "" && (
            <div className="text-text-tertiary font-mono pl-0">{String(cronExpr)}</div>
          )}
          {scheduleType != null && String(scheduleType) !== "" && (
            <div className="text-text-tertiary">类型: {String(scheduleType)}</div>
          )}
        </div>
        <span className="shrink-0 text-amber-600 font-medium">已更新</span>
      </div>
    );
  }

  // get
  if (action === "get") {
    const { jobId, name, enabledKnown, cronExpr, scheduleType } = resolveJobArtifactFields(result);
    return (
      <div className="mt-2 bg-background rounded-lg p-2.5 border border-border-light text-[11px] space-y-1">
        <JobTitleBlock name={name || undefined} jobId={jobId}>
          {enabledKnown !== null && (
            <span className={`ml-auto shrink-0 font-mono ${enabledKnown ? "text-emerald-600" : "text-text-tertiary"}`}>
              {enabledKnown ? "启用" : "禁用"}
            </span>
          )}
        </JobTitleBlock>
        {cronExpr != null && String(cronExpr) !== "" && (
          <div className="text-text-tertiary font-mono">{String(cronExpr)}</div>
        )}
        {scheduleType != null && String(scheduleType) !== "" && (
          <div className="text-text-tertiary">类型: {String(scheduleType)}</div>
        )}
      </div>
    );
  }

  // delete
  if (action === "delete") {
    const n = typeof result.name === "string" ? result.name : "";
    return (
      <div className="mt-2 bg-background rounded-lg p-2.5 border border-border-light text-[11px] flex items-start justify-between gap-3">
        <JobTitleBlock name={n || undefined} jobId={result.job_id} />
        <span className="shrink-0 text-red-500 font-medium">已删除</span>
      </div>
    );
  }

  // toggle
  if (action === "toggle") {
    const enabled = result.enabled ?? (result.job && (result.job as Record<string, unknown>).enabled);
    const n = typeof result.name === "string" ? result.name : "";
    return (
      <div className="mt-2 bg-background rounded-lg p-2.5 border border-border-light text-[11px] flex items-start justify-between gap-3">
        <JobTitleBlock name={n || undefined} jobId={result.job_id} />
        <span className={`shrink-0 font-medium ${enabled ? "text-emerald-600" : "text-text-tertiary"}`}>
          {enabled ? "已启用" : "已禁用"}
        </span>
      </div>
    );
  }

  // run_now
  if (action === "run_now") {
    const n = typeof result.name === "string" ? result.name : "";
    return (
      <div className="mt-2 bg-background rounded-lg p-2.5 border border-border-light text-[11px] space-y-2">
        <div className="flex items-start justify-between gap-3">
          <JobTitleBlock name={n || undefined} jobId={result.job_id} />
          <span className="shrink-0 text-emerald-600 font-medium">已触发</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-text-tertiary">
          <span>Execution ID</span>
          <span className="font-mono text-text-secondary">{String(result.execution_id ?? "—")}</span>
        </div>
      </div>
    );
  }

  // history
  if (action === "history") {
    const execs = Array.isArray(result.executions) ? result.executions : [];
    const totalLabel = String(result.total ?? execs.length);
    const statusColor: Record<string, string> = {
      success: "text-emerald-600",
      failed: "text-red-500",
      running: "text-blue-500",
      skipped: "text-text-tertiary",
      queued: "text-amber-500",
    };
    return (
      <div className="mt-2 space-y-1">
        <div className="text-[11px] text-text-tertiary">共 {totalLabel} 条记录</div>
        {execs.slice(0, 5).map((e: unknown) => {
          const exec = e as Record<string, unknown>;
          return (
            <div key={String(exec.execution_id)} className="bg-background rounded-lg p-2 border border-border-light text-[11px] flex items-center gap-2">
              <span className="font-mono text-text-secondary truncate">{String(exec.execution_id ?? "—")}</span>
              <span className={`ml-auto shrink-0 font-medium ${statusColor[String(exec.status)] ?? "text-text-primary"}`}>
                {String(exec.status ?? "—")}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // get_execution
  if (action === "get_execution") {
    const exec = (result.execution ?? result) as Record<string, unknown>;
    const startedAt = exec.started_at != null ? String(exec.started_at) : "";
    const finishedAt = exec.finished_at != null ? String(exec.finished_at) : "";
    const statusColor: Record<string, string> = {
      success: "text-emerald-600",
      failed: "text-red-500",
      running: "text-blue-500",
      skipped: "text-text-tertiary",
      queued: "text-amber-500",
    };
    return (
      <div className="mt-2 bg-background rounded-lg p-2.5 border border-border-light text-[11px] space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-text-tertiary">Execution ID</span>
          <span className="font-mono text-text-primary">{String(exec.execution_id ?? "—")}</span>
          <span className={`ml-auto font-medium ${statusColor[String(exec.status)] ?? "text-text-primary"}`}>
            {String(exec.status ?? "—")}
          </span>
        </div>
        {startedAt && <div className="text-text-tertiary">开始: {startedAt}</div>}
        {finishedAt && <div className="text-text-tertiary">结束: {finishedAt}</div>}
      </div>
    );
  }

  // fallback: raw JSON
  return (
    <pre className="mt-2 text-[11px] bg-background rounded-lg p-2.5 border border-border-light font-mono text-text-secondary whitespace-pre-wrap overflow-x-auto">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

export function ScheduleManagerRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const action = getAction(toolInput, toolResult);
  const isError = toolResult && !!toolResult.error;
  const errorMessage = isError && typeof toolResult?.message === "string" ? toolResult.message : null;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-violet-50 flex items-center justify-center shrink-0">
          <span className="text-violet-500"><CalendarIcon /></span>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight">Schedule Manager</span>
        {action && (
          <span className={`text-[11px] font-mono ${ACTION_COLORS[action] ?? "text-text-secondary"}`}>
            {action}
          </span>
        )}
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Running...</span>
        )}
        {toolResult && !isError && (
          <span className="text-[10px] text-success ml-auto">Done</span>
        )}
        {toolResult && isError && (
          <span className="text-[10px] text-error ml-auto">Error</span>
        )}
      </div>

      {/* Action */}
      <ActionSection action={action} />

      {/* Error */}
      {isError && errorMessage && (
        <p className="mt-2 text-xs text-error">{errorMessage}</p>
      )}

      {/* Result */}
      {toolResult && !isError && (
        <ResultSection action={action} result={toolResult} />
      )}
    </div>
  );
}
