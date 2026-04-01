import Markdown from "react-markdown";
import { registerToolRenderer, type ToolRenderProps } from "../registry";

function WebSearchRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? (toolInput.search_query as string) ?? "";

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight">Web Search</span>
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Searching...</span>
        )}
      </div>
      {query && (
        <p className="text-xs text-text-secondary mb-2.5 italic">&ldquo;{query}&rdquo;</p>
      )}
      {toolResult && <SearchResults result={toolResult} />}
    </div>
  );
}

function SearchResults({ result }: { result: Record<string, unknown> }) {
  // Structured format: { results: [{url, title, snippet, score}] }
  if (Array.isArray(result.results)) {
    return (
      <div className="space-y-2">
        {result.results.map((r: Record<string, unknown>, i: number) => (
          <a
            key={i}
            href={r.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2.5 bg-background hover:bg-surface-hover rounded-lg transition-colors group"
          >
            <p className="text-xs font-medium text-accent group-hover:underline">{r.title as string}</p>
            {r.url && (
              <p className="text-[10px] text-text-tertiary mt-0.5 truncate">{r.url as string}</p>
            )}
            {r.snippet && (
              <p className="text-xs text-text-secondary mt-1 line-clamp-2">{r.snippet as string}</p>
            )}
          </a>
        ))}
      </div>
    );
  }

  // String format (legacy): markdown text from content_and_artifact
  if (typeof result === "string" || (Object.keys(result).length === 0)) {
    const text = typeof result === "string" ? result : JSON.stringify(result);
    return (
      <div className="prose-agent text-xs text-text-secondary">
        <Markdown>{text}</Markdown>
      </div>
    );
  }

  // Unknown format: JSON fallback
  return (
    <pre className="text-[11px] bg-background rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap
                    font-mono text-text-secondary leading-relaxed border border-border-light">
      {JSON.stringify(result, null, 2)}
    </pre>
  );
}

registerToolRenderer("web_search", WebSearchRenderer);
