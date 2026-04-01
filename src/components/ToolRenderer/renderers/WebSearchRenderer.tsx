import { registerToolRenderer, type ToolRenderProps } from "../registry";

function WebSearchRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? (toolInput.search_query as string) ?? "";

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-center gap-2 mb-2 font-medium text-text-primary">
        <span>🔍</span>
        <span>Web Search</span>
        {!toolResult && (
          <span className="text-xs text-text-tertiary animate-pulse">searching...</span>
        )}
      </div>
      {query && (
        <p className="text-text-secondary text-xs mb-2 italic">"{query}"</p>
      )}
      {toolResult && (
        <div className="space-y-2 mt-2">
          {Array.isArray(toolResult.results)
            ? toolResult.results.map((r: Record<string, unknown>, i: number) => (
                <div key={i} className="p-2 bg-background rounded text-xs">
                  <p className="font-medium text-accent">{r.title as string}</p>
                  <p className="text-text-tertiary mt-0.5 line-clamp-2">
                    {r.snippet as string}
                  </p>
                </div>
              ))
            : (
              <pre className="text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(toolResult, null, 2)}
              </pre>
            )}
        </div>
      )}
    </div>
  );
}

registerToolRenderer("web_search", WebSearchRenderer);
