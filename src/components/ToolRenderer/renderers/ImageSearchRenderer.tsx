import { useState, useCallback } from "react";
import type { ToolRenderProps } from "../registry";

function ImageItem({ url, title, onLoaded }: { url: string; title: string; onLoaded: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden bg-background hover:opacity-80 transition-opacity">
      <img src={url} alt={title} loading="lazy"
        onLoad={onLoaded}
        onError={() => setFailed(true)}
        className="w-full h-20 object-cover" />
    </a>
  );
}

const VISIBLE_COUNT = 3;

export function ImageSearchRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? (toolResult?.query as string) ?? "";
  const [expanded, setExpanded] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const handleLoaded = useCallback(() => setLoadedCount(c => c + 1), []);
  const results = toolResult && Array.isArray(toolResult.results) ? toolResult.results as Record<string, unknown>[] : [];
  const hasMore = results.length > VISIBLE_COUNT;
  const visible = expanded ? results : results.slice(0, VISIBLE_COUNT);

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-pink-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Image Search</span>
        {query && (
          <span className="text-[11px] text-text-secondary truncate min-w-0 flex-1">&ldquo;{query}&rdquo;</span>
        )}
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Searching...</span>
        )}
        {toolResult && loadedCount > 0 && (
          <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
            {loadedCount} images
          </span>
        )}
      </div>
      {visible.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {visible.map((r, i) => (
            <ImageItem key={i} url={r.url as string} title={r.title as string} onLoaded={handleLoaded} />
          ))}
        </div>
      )}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {expanded ? "Collapse" : `Show ${results.length - VISIBLE_COUNT} more`}
        </button>
      )}
    </div>
  );
}

