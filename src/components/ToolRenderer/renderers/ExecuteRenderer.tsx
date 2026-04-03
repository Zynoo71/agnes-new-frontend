import type { ToolRenderProps } from "../registry";

export function ExecuteRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const command = (toolInput.command as string) ?? (toolResult?.command as string) ?? "";
  const description = (toolInput.description as string) ?? (toolResult?.description as string) ?? "";
  const isError = toolResult && !!toolResult["error"];

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center">
          <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary">Execute</span>
        {!toolResult && <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Running...</span>}
        {toolResult && !isError && <span className="text-[10px] text-success ml-auto">Success</span>}
        {toolResult && isError && <span className="text-[10px] text-error ml-auto">Error</span>}
      </div>
      {description && <p className="text-[11px] text-text-secondary mb-1">{description}</p>}
      <code className="block text-[11px] font-mono bg-console-bg text-console-text rounded-lg px-2.5 py-1.5 truncate">{command}</code>
      {toolResult && typeof toolResult.stdout === "string" && toolResult.stdout.trim() && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none">
            Output
          </summary>
          <pre className="mt-1 text-[11px] bg-console-bg text-console-text rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
            {toolResult.stdout as string}
          </pre>
        </details>
      )}
    </div>
  );
}

