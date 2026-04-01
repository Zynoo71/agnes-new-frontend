import type { ToolRenderProps } from "./registry";

export function DefaultJsonRenderer({ toolName, toolInput, toolResult }: ToolRenderProps) {
  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-accent/10 flex items-center justify-center">
          <svg className="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384-3.09A1 1 0 015 11.227V5.773a1 1 0 011.036-.853l5.384.308a1 1 0 01.964.853v8.036a1 1 0 01-1.036.853z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight">{toolName}</span>
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Running...</span>
        )}
        {toolResult && (
          <span className="text-[10px] text-success ml-auto">Done</span>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none">
          Input
        </summary>
        <pre className="mt-1.5 text-[11px] bg-background rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap
                        font-mono text-text-secondary leading-relaxed border border-border-light">
          {JSON.stringify(toolInput, null, 2)}
        </pre>
      </details>
      {toolResult && (
        <details className="mt-2" open>
          <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none">
            Result
          </summary>
          <pre className="mt-1.5 text-[11px] bg-background rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap
                          font-mono text-text-secondary leading-relaxed border border-border-light">
            {JSON.stringify(toolResult, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
