import { Fragment, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { ToolRenderProps } from "../registry";

const AUTO_COLLAPSE_MS = 2000;

type Phase = "planning" | "profiling" | "executing" | "delivering" | "insight" | "spawn";

interface ToolConfig {
  label: string;
  phase: Phase;
}

const TOOL_CONFIG: Record<string, ToolConfig> = {
  // Planning phase
  plan_analysis:    { label: "Plan Analysis",     phase: "planning" },
  dispatch_workers: { label: "Dispatch Workers",  phase: "planning" },
  // Profiling
  profile_data:     { label: "Profile Data",      phase: "profiling" },
  list_assets:      { label: "List Assets",       phase: "profiling" },
  read_artifact:    { label: "Read Artifact",     phase: "profiling" },
  // Executing
  query_data:       { label: "Query Data (SQL)",  phase: "executing" },
  run_python:       { label: "Run Python",        phase: "executing" },
  search_table:     { label: "Search → Table",    phase: "executing" },
  creative_table:   { label: "Creative Table",    phase: "executing" },
  // Delivering
  make_chart:       { label: "Make Chart",        phase: "delivering" },
  build_dashboard:  { label: "Build Dashboard",   phase: "delivering" },
  write_report:     { label: "Write Report",      phase: "delivering" },
  compose_report:   { label: "Compose Report",    phase: "delivering" },
  export_data:      { label: "Export Data",       phase: "delivering" },
  // Insight
  record_insight:   { label: "Record Insight",    phase: "insight" },
  // Spawn (sheet flavor)
  spawn_data_worker:{ label: "Spawn Data Worker", phase: "spawn" },
};

const PHASE_STYLE: Record<Phase, { bg: string; text: string; border: string; dot: string; icon: string }> = {
  planning:   { bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200/60",  dot: "bg-indigo-500",  icon: "🧭" },
  profiling:  { bg: "bg-slate-50",   text: "text-slate-700",   border: "border-slate-200/60",   dot: "bg-slate-500",   icon: "🔍" },
  executing:  { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200/60",   dot: "bg-amber-500",   icon: "⚙️" },
  delivering: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200/60", dot: "bg-emerald-500", icon: "📦" },
  insight:    { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200/60", dot: "bg-fuchsia-500", icon: "💡" },
  spawn:      { bg: "bg-purple-50",  text: "text-purple-700",  border: "border-purple-200/60",  dot: "bg-purple-500",  icon: "🤖" },
};

function inputHint(toolName: string, input: Record<string, unknown>): string | null {
  const truncate = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + "…" : s);
  switch (toolName) {
    case "plan_analysis":
      return typeof input.user_query === "string" ? truncate(input.user_query, 100) : null;
    case "dispatch_workers": {
      const ws = Array.isArray(input.workers) ? input.workers : [];
      return ws.length > 0 ? `${ws.length} workers` : null;
    }
    case "query_data":
      return typeof input.sql === "string" ? truncate(input.sql, 100) : null;
    case "run_python":
      return typeof input.code === "string" ? truncate(input.code.split("\n")[0], 80) : null;
    case "make_chart":
    case "build_dashboard":
    case "write_report":
    case "compose_report":
    case "export_data":
      return typeof input.save_to === "string" ? input.save_to : null;
    case "record_insight":
      return typeof input.headline === "string" ? truncate(input.headline, 80) : null;
    case "search_table":
    case "creative_table":
      return typeof input.save_to === "string" ? input.save_to : null;
    case "profile_data":
    case "read_artifact":
      return typeof input.path === "string" ? input.path : null;
    case "spawn_data_worker":
      return typeof input.role === "string" ? `role=${input.role}` : null;
    default:
      return null;
  }
}

function resultHint(toolName: string, result: Record<string, unknown>): string | null {
  if (toolName === "dispatch_workers") {
    const out = typeof result.output === "string" ? result.output : "";
    const ok = (out.match(/✅/g) || []).length;
    const fail = (out.match(/❌/g) || []).length;
    if (ok || fail) return `${ok} ok / ${fail} failed`;
  }
  if (toolName === "plan_analysis") {
    const out = typeof result.output === "string" ? result.output : "";
    const m = out.match(/(\d+)\s*个?维度/);
    if (m) return `${m[1]} dimensions`;
  }
  return null;
}

function formatValue(v: unknown, max = 200): string {
  if (v == null) return "";
  if (typeof v === "string") return v.length > max ? v.slice(0, max) + `… (${v.length} chars)` : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v, null, 2);
    return s.length > max * 4 ? s.slice(0, max * 4) + `… (${s.length} chars)` : s;
  } catch {
    return String(v);
  }
}

function renderKVList(obj: Record<string, unknown>): ReactNode {
  const entries = Object.entries(obj).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]">
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <dt className="font-medium text-text-tertiary truncate">{k}</dt>
          <dd className="font-mono text-text-secondary whitespace-pre-wrap break-words min-w-0">
            {formatValue(v)}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function SheetToolRenderer({ toolName, toolInput, toolResult, autoCollapse }: ToolRenderProps) {
  const config = TOOL_CONFIG[toolName] ?? { label: toolName, phase: "executing" as Phase };
  const c = PHASE_STYLE[config.phase];
  const [open, setOpen] = useState(!autoCollapse);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoCollapse) return;
    timerRef.current = setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [autoCollapse]);

  const isDone = !!toolResult;
  const hint = inputHint(toolName, toolInput);
  const doneHint = isDone && toolResult ? resultHint(toolName, toolResult) : null;
  const isError = !!(toolResult && toolResult["error"]);

  // Pull text-friendly result if available; otherwise show structured fields
  const resultOutput = isDone && toolResult && typeof toolResult.output === "string"
    ? (toolResult.output as string)
    : null;
  const resultRest: Record<string, unknown> | null = isDone && toolResult
    ? Object.fromEntries(
        Object.entries(toolResult).filter(([k]) => k !== "output" && k !== "tool_name"),
      )
    : null;
  const hasResultRest = !!resultRest && Object.keys(resultRest).length > 0;
  const hasInput = toolInput && Object.keys(toolInput).length > 0;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs shrink-0">{c.icon}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          isError ? "bg-red-500"
          : isDone ? c.dot
          : "bg-amber-400 animate-pulse"
        }`} />
        <span className={`text-xs font-medium ${c.text}`}>{config.label}</span>
        {hint && (
          <span className="text-[11px] font-mono text-text-tertiary truncate min-w-0">{hint}</span>
        )}
        {doneHint && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/60 ${c.text} shrink-0`}>
            {doneHint}
          </span>
        )}
        {isError && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
            error
          </span>
        )}
        <svg
          className={`w-3 h-3 ml-auto text-text-tertiary transition-transform shrink-0 ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {open && (hasInput || resultOutput || hasResultRest) && (
        <div className="px-3 pb-2.5 space-y-2 border-t border-white/40 pt-2">
          {hasInput && (
            <details>
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary transition-colors select-none">
                Input
              </summary>
              <div className="mt-1.5 bg-white/50 rounded-lg p-2 border border-white/60">
                {renderKVList(toolInput)}
              </div>
            </details>
          )}
          {resultOutput && (
            <details open>
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary transition-colors select-none">
                Output
              </summary>
              <pre className="mt-1.5 text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono bg-white/50 rounded-lg p-2 border border-white/60 max-h-64 overflow-y-auto">
                {resultOutput}
              </pre>
            </details>
          )}
          {hasResultRest && resultRest && (
            <details open={!resultOutput}>
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary transition-colors select-none">
                {resultOutput ? "Details" : "Result"}
              </summary>
              <div className="mt-1.5 bg-white/50 rounded-lg p-2 border border-white/60">
                {renderKVList(resultRest)}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
