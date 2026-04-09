import { useState } from "react";
import type { SourceCitation } from "@/stores/conversationStore";

/** Extract short domain from URL. */
function domain(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return raw;
  }
}

/** Google favicon service URL. */
function faviconUrl(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return "";
  }
}

/** Deduplicate sources by domain — keep first occurrence. */
function uniqueByDomain(sources: SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const d = domain(s.url);
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}

export function CitationSources({ sources }: { sources: SourceCitation[] }) {
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;

  const uniqueSources = uniqueByDomain(sources);

  return (
    <div className="mt-3">
      {/* Collapsed: stacked favicons pill */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full
                   bg-surface-hover hover:bg-border-light border border-border-light
                   transition-all text-[12px] text-text-secondary hover:text-text-primary"
      >
        <span className="flex items-center -space-x-1.5">
          {uniqueSources.slice(0, 5).map((s, i) => (
            <img
              key={s.ref}
              src={faviconUrl(s.url)}
              alt=""
              className="w-4 h-4 rounded-full ring-1 ring-surface-hover"
              style={{ zIndex: 5 - i }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ))}
        </span>
        <span>Sources</span>
      </button>

      {/* Expanded: full source list */}
      {expanded && (
        <div className="mt-2 flex flex-wrap gap-2">
          {sources.map((s) => (
            <a
              key={s.ref}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border-light
                         bg-surface hover:bg-surface-hover hover:border-border
                         transition-all text-[12px] max-w-[260px] group"
              title={s.url}
            >
              <img
                src={faviconUrl(s.url)}
                alt=""
                className="w-4 h-4 rounded-sm shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span className="truncate text-text-secondary group-hover:text-text-primary">
                {s.title || domain(s.url)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
