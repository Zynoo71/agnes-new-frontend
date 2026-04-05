import type { ToolRenderProps } from "../registry";

/** Extract domain from a URL for compact display. */
function shortLabel(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname === "/" ? "" : u.pathname;
    return u.hostname + (path.length > 30 ? path.slice(0, 30) + "…" : path);
  } catch {
    return raw.length > 50 ? raw.slice(0, 50) + "…" : raw;
  }
}

export function WebReadRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const url = (toolInput.url as string) ?? "";
  const isError = toolResult && !!toolResult["error"];
  const contentLength =
    typeof toolResult?.content === "string" ? toolResult.content.length : null;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5a17.92 17.92 0 01-8.716-2.247m0 0A9 9 0 013 12c0-1.047.179-2.053.507-2.988" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Read Page</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-text-secondary truncate min-w-0 flex-1 hover:text-blue-500 transition-colors"
            title={url}
          >
            {shortLabel(url)}
          </a>
        )}
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Reading...</span>
        )}
        {toolResult && !isError && (
          <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
            {contentLength != null ? `${contentLength.toLocaleString()} chars` : "Done"}
          </span>
        )}
        {toolResult && isError && (
          <span className="text-[10px] text-error ml-auto shrink-0">Error</span>
        )}
      </div>
    </div>
  );
}
