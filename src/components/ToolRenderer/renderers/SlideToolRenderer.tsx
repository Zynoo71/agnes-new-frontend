import { useState, useEffect, useRef } from "react";
import type { ToolRenderProps } from "../registry";

const AUTO_COLLAPSE_MS = 2000;

const TOOL_CONFIG: Record<string, { label: string; color: string }> = {
  generate_outline: { label: "Generate Outline", color: "teal" },
  generate_design_system: { label: "Generate Design System", color: "violet" },
  generate_local_design: { label: "Page Design", color: "sky" },
  render_html: { label: "Render HTML", color: "emerald" },
  delegate_to_slide_agent: { label: "Delegate to Slide Agent", color: "purple" },
};

export function SlideToolRenderer({ toolName, toolInput, toolResult, autoCollapse }: ToolRenderProps) {
  const config = TOOL_CONFIG[toolName] ?? { label: toolName, color: "gray" };
  const [open, setOpen] = useState(!autoCollapse);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoCollapse) return;
    timerRef.current = setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS);
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoCollapse]);

  const isDone = !!toolResult;
  const resultText = isDone
    ? typeof toolResult.output === "string"
      ? toolResult.output
      : JSON.stringify(toolResult, null, 2) ?? ""
    : null;

  const colorMap: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    teal: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200/60", dot: "bg-teal-500" },
    violet: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200/60", dot: "bg-violet-500" },
    sky: { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200/60", dot: "bg-sky-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200/60", dot: "bg-emerald-500" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200/60", dot: "bg-purple-500" },
    gray: { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200/60", dot: "bg-gray-500" },
  };

  const c = colorMap[config.color] ?? colorMap.gray;

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? c.dot : "bg-amber-400 animate-pulse"}`} />
        <span className={`text-xs font-medium ${c.text}`}>{config.label}</span>
        {toolInput.slide_id != null && (
          <span className="text-[10px] font-mono text-text-tertiary">{String(toolInput.slide_id)}</span>
        )}
        <svg
          className={`w-3 h-3 ml-auto text-text-tertiary transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
      {open && resultText && (
        <div className="px-3 pb-2.5">
          <pre className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words font-mono bg-surface/50 rounded-lg p-2 max-h-40 overflow-y-auto">
            {resultText}
          </pre>
        </div>
      )}
    </div>
  );
}
