import { registerToolRenderer, type ToolRenderProps } from "../registry";

function FileToolRenderer({ toolName, toolInput, toolResult }: ToolRenderProps) {
  const path = (toolInput.path as string) ?? (toolResult?.path as string) ?? "";
  const isError = toolResult && !!toolResult["error"];

  const label = toolName === "read_file" ? "Read File"
    : toolName === "write_file" ? "Write File"
    : "Edit File";

  const iconPath = toolName === "read_file"
    ? "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    : "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125";

  // Build compact summary from artifact metadata
  let summary = "";
  if (toolResult && !isError) {
    const totalLines = toolResult.total_lines as number | undefined;
    const size = toolResult.size as number | undefined;
    const parts: string[] = [];
    if (totalLines != null) parts.push(`${totalLines} lines`);
    if (size != null) parts.push(`${size} chars`);
    if (toolResult.unchanged) parts.push("unchanged");
    summary = parts.join(" · ");
  }

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt px-3.5 py-2.5 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-amber-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary">{label}</span>
        {!toolResult && <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Running...</span>}
        {toolResult && !isError && <span className="text-[10px] text-success ml-auto">Done</span>}
        {toolResult && isError && <span className="text-[10px] text-error ml-auto">Error</span>}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <code className="text-[11px] font-mono text-text-secondary truncate">{path}</code>
        {summary && <span className="text-[10px] text-text-tertiary shrink-0">{summary}</span>}
      </div>
      {isError && typeof toolResult?.["message"] === "string" && (
        <p className="mt-1 text-[11px] text-error">{toolResult["message"] as string}</p>
      )}
    </div>
  );
}

registerToolRenderer("read_file", FileToolRenderer);
registerToolRenderer("write_file", FileToolRenderer);
registerToolRenderer("edit_file", FileToolRenderer);
registerToolRenderer("list_files", FileToolRenderer);
registerToolRenderer("glob", FileToolRenderer);
registerToolRenderer("grep", FileToolRenderer);
