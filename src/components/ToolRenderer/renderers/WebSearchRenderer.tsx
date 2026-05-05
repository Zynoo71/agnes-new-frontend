import { useState, useEffect } from "react";
import type { ToolRenderProps } from "../registry";
import { ExpandableInput } from "../ExpandableInput";

const AUTO_COLLAPSE_MS = 3000;

export function WebSearchRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query =
    (toolInput.query as string) ??
    (toolInput.search_query as string) ??
    (toolResult?.query as string) ??
    "";
  // If toolResult exists on first render, it's from history — start collapsed
  const isHistory = !!toolResult;
  const [userToggled, setUserToggled] = useState(false);
  const [delayCollapsed, setDelayCollapsed] = useState(isHistory);

  // Auto-expand when result arrives, then collapse after delay
  const autoExpanded = toolResult ? !delayCollapsed : true;
  const [manualExpanded, setManualExpanded] = useState(false);
  const expanded = userToggled ? manualExpanded : autoExpanded;

  useEffect(() => {
    if (!toolResult || userToggled || isHistory) return;
    const timer = setTimeout(() => setDelayCollapsed(true), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [isHistory, toolResult, userToggled]);

  const toggleExpanded = () => {
    if (!toolResult) return;
    setUserToggled(true);
    setManualExpanded(!expanded);
  };

  const handleHeaderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!toolResult) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleExpanded();
  };

  const resultCount = Array.isArray(toolResult?.results) ? toolResult.results.length : 0;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div
        role={toolResult ? "button" : undefined}
        tabIndex={toolResult ? 0 : undefined}
        onClick={toggleExpanded}
        onKeyDown={handleHeaderKeyDown}
        className="flex items-center gap-2 w-full text-left"
      >
        <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Web Search</span>
        {query && (
          <ExpandableInput value={query} variant="text" className="flex-1 min-w-0" />
        )}
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Searching...</span>
        )}
        {toolResult && (
          <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
            {resultCount} results
            <svg className={`w-3 h-3 inline ml-1 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </span>
        )}
      </div>

      {expanded && toolResult && Array.isArray(toolResult.results) && (
        <div className="mt-2 space-y-1.5">
          {toolResult.results.map((r: Record<string, unknown>, i: number) => (
            <div key={i} className="p-2 bg-background rounded-lg">
              <p className="text-xs font-medium text-text-primary">{String(r.title)}</p>
              {r.snippet != null && (
                <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{String(r.snippet)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
