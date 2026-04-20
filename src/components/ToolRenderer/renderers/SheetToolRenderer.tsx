import { Fragment, useState } from "react";
import type { ReactNode } from "react";
import type { ToolRenderProps } from "../registry";
import { ExpandableInput } from "../ExpandableInput";

/**
 * Sheet Agent v3 (R21) tools — visual style 与 FileToolRenderer / DefaultJsonRenderer 对齐：
 *  - rounded-xl border bg-surface-alt + 5x5 圆角图标方块 + 单行 label/path
 *  - 不再使用各 phase 的有色背景，与 SuperAgent 其余 tool 卡片保持视觉一致
 */

interface ToolConfig {
  label: string;
  color: "amber" | "violet" | "blue" | "green" | "orange" | "teal" | "pink" | "slate";
  iconPath: string;
}

const ICON_PLAN =
  "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z M15 12a3 3 0 11-6 0 3 3 0 016 0z";
const ICON_PROFILE = "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5";
const ICON_LIST = "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5";
const ICON_READ = "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25";
const ICON_SQL = "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125";
const ICON_PYTHON = "M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z";
const ICON_SEARCH_TABLE = "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z";
const ICON_CHART = "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z";
const ICON_REPORT = "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z";
const ICON_INSIGHT = "M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.354a15.998 15.998 0 01-3 0M9.75 4.5l-1.5 1.5M14.25 4.5l1.5 1.5M3 12h1.5M19.5 12H21M5.636 5.636l1.06 1.06M16.243 6.697l1.061-1.061M12 3v1.5";
const ICON_SPAWN = "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z";

const TOOL_CONFIG: Record<string, ToolConfig> = {
  // Planning
  plan_analysis:    { label: "Plan Analysis",     color: "violet", iconPath: ICON_PLAN },
  // Profiling
  profile_data:     { label: "Profile Data",      color: "slate",  iconPath: ICON_PROFILE },
  list_assets:      { label: "List Assets",       color: "slate",  iconPath: ICON_LIST },
  read_artifact:    { label: "Read Artifact",     color: "slate",  iconPath: ICON_READ },
  // Executing
  query_data:       { label: "Query Data (SQL)",  color: "amber",  iconPath: ICON_SQL },
  run_python:       { label: "Run Python",        color: "amber",  iconPath: ICON_PYTHON },
  search_table:     { label: "Search → Table",    color: "orange", iconPath: ICON_SEARCH_TABLE },
  // Delivering
  make_chart:       { label: "Make Chart",        color: "green",  iconPath: ICON_CHART },
  write_report:     { label: "Write Report",      color: "green",  iconPath: ICON_REPORT },
  compose_report:   { label: "Compose Report",    color: "green",  iconPath: ICON_REPORT },
  // Insight
  record_insight:   { label: "Record Insight",    color: "pink",   iconPath: ICON_INSIGHT },
  // Spawn
  spawn_worker:     { label: "Spawn Worker",      color: "blue",   iconPath: ICON_SPAWN },
  spawn_data_worker:{ label: "Spawn Data Worker", color: "blue",   iconPath: ICON_SPAWN },
};

const COLOR_MAP: Record<NonNullable<ToolConfig["color"]>, string> = {
  amber:  "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  blue:   "bg-blue-50 text-blue-600",
  green:  "bg-green-50 text-green-600",
  orange: "bg-orange-50 text-orange-600",
  teal:   "bg-teal-50 text-teal-600",
  pink:   "bg-pink-50 text-pink-600",
  slate:  "bg-slate-100 text-slate-600",
};

function inputHint(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "plan_analysis":
      return typeof input.user_query === "string" ? (input.user_query as string) : "";
    case "query_data":
      return typeof input.sql === "string" ? (input.sql as string) : "";
    case "run_python":
      return typeof input.code === "string" ? (input.code as string).split("\n")[0] : "";
    case "make_chart":
    case "write_report":
    case "compose_report":
      return typeof input.save_to === "string" ? (input.save_to as string) : "";
    case "record_insight":
      return typeof input.headline === "string" ? (input.headline as string) : "";
    case "search_table":
      return typeof input.save_to === "string" ? (input.save_to as string) : "";
    case "profile_data":
    case "read_artifact":
      return typeof input.path === "string" ? (input.path as string) : "";
    case "spawn_worker":
    case "spawn_data_worker": {
      const role = typeof input.role === "string" ? `role=${input.role}` : "";
      const dim = typeof input.dim_id === "string" ? (input.dim_id as string) : "";
      return [role, dim].filter(Boolean).join(" · ");
    }
    default:
      return "";
  }
}

function resultSummary(toolName: string, result: Record<string, unknown>): string {
  if (toolName === "plan_analysis") {
    const out = typeof result.output === "string" ? result.output : "";
    const m = out.match(/(\d+)\s*个?维度/);
    if (m) return `${m[1]} dims`;
  }
  return "";
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

export function SheetToolRenderer({ toolName, toolInput, toolResult }: ToolRenderProps) {
  const config = TOOL_CONFIG[toolName] ?? { label: toolName, color: "slate" as const, iconPath: ICON_LIST };
  const colorClass = COLOR_MAP[config.color];
  const isError = !!(toolResult && toolResult["error"]);
  const errorMessage = isError && typeof toolResult?.["message"] === "string" ? (toolResult["message"] as string) : null;
  const hint = inputHint(toolName, toolInput);
  const summary = toolResult ? resultSummary(toolName, toolResult) : "";

  const resultOutput = toolResult && typeof toolResult.output === "string"
    ? (toolResult.output as string)
    : null;
  const resultRest: Record<string, unknown> | null = toolResult
    ? Object.fromEntries(
        Object.entries(toolResult).filter(([k]) => k !== "output" && k !== "tool_name"),
      )
    : null;
  const hasResultRest = !!resultRest && Object.keys(resultRest).length > 0;
  const hasInput = toolInput && Object.keys(toolInput).length > 0;
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt px-3.5 py-2.5 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${colorClass.split(" ")[0]}`}>
          <svg className={`w-3 h-3 ${colorClass.split(" ")[1]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={config.iconPath} />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary shrink-0">{config.label}</span>
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Running...</span>
        )}
        {toolResult && !isError && (
          <span className="text-[10px] text-success ml-auto shrink-0">
            {summary || "Done"}
          </span>
        )}
        {toolResult && isError && (
          <span className="text-[10px] text-error ml-auto shrink-0">Error</span>
        )}
      </div>
      {hint && (
        <div className="mt-1 text-[10px]">
          <ExpandableInput value={hint} variant="text" className="min-w-0" />
        </div>
      )}
      {errorMessage && (
        <p className="mt-1 text-[11px] text-error">{errorMessage}</p>
      )}
      {(hasInput || resultOutput || hasResultRest) && (
        <div className="mt-1.5">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-[10px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
          >
            {showDetails ? "Hide details" : "Show details"}
          </button>
          {showDetails && (
            <div className="mt-1.5 space-y-1.5">
              {hasInput && (
                <div>
                  <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1">Input</div>
                  <div className="bg-background rounded-lg p-2 border border-border-light">
                    {renderKVList(toolInput)}
                  </div>
                </div>
              )}
              {resultOutput && (
                <div>
                  <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1">Output</div>
                  <pre className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono bg-background rounded-lg p-2 border border-border-light max-h-64 overflow-y-auto">
                    {resultOutput}
                  </pre>
                </div>
              )}
              {hasResultRest && resultRest && (
                <div>
                  <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1">
                    {resultOutput ? "Details" : "Result"}
                  </div>
                  <div className="bg-background rounded-lg p-2 border border-border-light">
                    {renderKVList(resultRest)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
