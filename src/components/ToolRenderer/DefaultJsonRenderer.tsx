import type { ToolRenderProps } from "./registry";

export function DefaultJsonRenderer({ toolName, toolInput, toolResult }: ToolRenderProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-center gap-2 mb-2 font-medium text-text-primary">
        <span>🔧</span>
        <span>{toolName}</span>
        {!toolResult && (
          <span className="text-xs text-text-tertiary animate-pulse">running...</span>
        )}
      </div>
      <details className="group">
        <summary className="cursor-pointer text-xs text-text-tertiary hover:text-text-secondary">
          Input
        </summary>
        <pre className="mt-1 text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(toolInput, null, 2)}
        </pre>
      </details>
      {toolResult && (
        <details className="mt-2 group" open>
          <summary className="cursor-pointer text-xs text-text-tertiary hover:text-text-secondary">
            Result
          </summary>
          <pre className="mt-1 text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(toolResult, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
