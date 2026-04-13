import type { ToolRenderProps } from "../registry";
import { ExpandableInput } from "../ExpandableInput";

export function ExecuteRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const command = (toolInput.command as string) ?? (toolResult?.command as string) ?? "";
  const description = (toolInput.description as string) ?? (toolResult?.description as string) ?? "";
  
  // toolResult.error indicates the tool call ITSELF failed (e.g. command not found)
  // toolResult.stderr might contain tool output which isn't a failure of the tool call
  const isToolCallFailed = toolResult && !!toolResult["error"];
  const stdout = typeof toolResult?.stdout === "string" ? toolResult.stdout.trim() : "";
  const stderr = typeof toolResult?.stderr === "string" ? toolResult.stderr.trim() : "";

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
        {toolResult && !isToolCallFailed && <span className="text-[10px] text-success ml-auto">Done</span>}
        {toolResult && isToolCallFailed && <span className="text-[10px] text-error ml-auto">Error</span>}
      </div>
      {description && <p className="text-[11px] text-text-secondary mb-1">{description}</p>}
      <ExpandableInput value={command} />

      {/* Stdout */}
      {stdout && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1 px-0.5">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Output</span>
            <button
              onClick={() => navigator.clipboard.writeText(stdout)}
              className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copy
            </button>
          </div>
          <pre className="text-[11px] bg-console-bg text-console-text rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto border border-white/5">
            {stdout}
          </pre>
        </div>
      )}

      {/* Stderr */}
      {stderr && (
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1 px-0.5">
            <span className="text-[10px] font-medium text-error uppercase tracking-wider">Error Output (stderr)</span>
            <button
              onClick={() => navigator.clipboard.writeText(stderr)}
              className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
              </svg>
              Copy
            </button>
          </div>
          <pre className="text-[11px] bg-console-bg text-red-400 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto border border-red-900/20">
            {stderr}
          </pre>
        </div>
      )}

      {/* System Error Message (if any) */}
      {isToolCallFailed && typeof toolResult?.["message"] === "string" && (
        <p className="mt-2 text-[11px] text-error px-0.5">{toolResult["message"] as string}</p>
      )}
    </div>
  );
}

