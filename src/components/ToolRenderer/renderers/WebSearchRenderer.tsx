import { useState, useEffect, useRef } from "react";
import { registerToolRenderer, type ToolRenderProps } from "../registry";

const AUTO_COLLAPSE_MS = 3000;

function WebSearchRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? (toolInput.search_query as string) ?? "";
  const [expanded, setExpanded] = useState(!toolResult);
  const hasAutoCollapsed = useRef(false);

  // When result arrives: show expanded briefly, then auto-collapse
  useEffect(() => {
    if (!toolResult || hasAutoCollapsed.current) return;
    setExpanded(true);
    const timer = setTimeout(() => {
      hasAutoCollapsed.current = true;
      setExpanded(false);
    }, AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [toolResult]);

  const resultCount = Array.isArray(toolResult?.results) ? toolResult.results.length : 0;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <button
        onClick={() => toolResult && setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Web Search</span>
        {query && (
          <span className="text-[11px] text-text-secondary truncate min-w-0">{query}</span>
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
      </button>
      {expanded && toolResult && Array.isArray(toolResult.results) && (
        <div className="mt-2 space-y-1.5">
          {toolResult.results.map((r: Record<string, unknown>, i: number) => (
            <div key={i} className="p-2 bg-background rounded-lg">
              <p className="text-xs font-medium text-text-primary">{r.title as string}</p>
              {r.snippet && (
                <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">{String(r.snippet)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

registerToolRenderer("web_search", WebSearchRenderer);
