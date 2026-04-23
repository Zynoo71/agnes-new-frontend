import { useState, useEffect, useRef } from "react";
import type { ToolRenderProps } from "../registry";
import { ExpandableInput } from "../ExpandableInput";
import { HtmlPreviewFrame } from "@/components/HtmlPreviewFrame";

const AUTO_COLLAPSE_MS = 2000;

const TOOL_CONFIG: Record<string, { label: string; color: string; iconPath: string }> = {
  read_file: {
    label: "Read File",
    color: "amber",
    iconPath: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  },
  write_file: {
    label: "Write File",
    color: "green",
    iconPath: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  },
  edit_file: {
    label: "Edit File",
    color: "blue",
    iconPath: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125",
  },
  list_files: {
    label: "List Files",
    color: "violet",
    iconPath: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z",
  },
  grep: {
    label: "Search",
    color: "orange",
    iconPath: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  },
  glob: {
    label: "Find Files",
    color: "teal",
    iconPath: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  },
};

const COLOR_MAP: Record<string, string> = {
  amber: "bg-amber-50 text-amber-600",
  green: "bg-green-50 text-green-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  orange: "bg-orange-50 text-orange-600",
  teal: "bg-teal-50 text-teal-600",
};

function FileSummary({ toolName, toolResult }: Pick<ToolRenderProps, "toolName" | "toolResult">) {
  const r = toolResult ?? {};

  switch (toolName) {
    case "read_file": {
      if (r.unchanged) return <span className="text-text-tertiary">unchanged</span>;
      const parts: string[] = [];
      if (r.total_lines != null) parts.push(`${r.total_lines} lines`);
      if (r.start_line != null || r.end_line != null) {
        parts.push(`L${r.start_line ?? 1}–${r.end_line ?? "end"}`);
      }
      return parts.length ? <span className="text-text-tertiary">{parts.join(" · ")}</span> : null;
    }
    case "write_file": {
      const action = r.is_new ? "Created" : "Updated";
      const lines = r.lines_written != null ? `${r.lines_written} lines` : r.size != null ? `${r.size} chars` : "";
      return <span className="text-text-tertiary">{action}{lines ? ` · ${lines}` : ""}</span>;
    }
    case "edit_file": {
      const parts: string[] = [];
      if (r.lines_added != null || r.lines_removed != null) {
        parts.push(`+${r.lines_added ?? 0}/−${r.lines_removed ?? 0} lines`);
      }
      if (r.occurrences != null) parts.push(`${r.occurrences} replacement${r.occurrences === 1 ? "" : "s"}`);
      return parts.length ? <span className="text-text-tertiary">{parts.join(" · ")}</span> : null;
    }
    case "list_files": {
      const total = r.total_items as number | undefined;
      return total != null ? <span className="text-text-tertiary">{total} items</span> : null;
    }
    case "grep": {
      const matches = r.returned_matches as number | undefined;
      return matches != null ? <span className="text-text-tertiary">{matches} matches</span> : null;
    }
    case "glob": {
      const total = r.total_items as number | undefined;
      return total != null ? <span className="text-text-tertiary">{total} files</span> : null;
    }
    default:
      return null;
  }
}

function EditDiff({ toolResult, autoCollapse }: { toolResult: Record<string, unknown>; autoCollapse?: boolean }) {
  const oldSnippet = toolResult.old_snippet as string | undefined;
  const newSnippet = toolResult.new_snippet as string | undefined;
  const [open, setOpen] = useState(true);
  const hasAutoCollapsed = useRef(false);

  useEffect(() => {
    if (!autoCollapse || hasAutoCollapsed.current) return;
    hasAutoCollapsed.current = true;
    const timer = setTimeout(() => setOpen(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [autoCollapse]);

  if (!oldSnippet && !newSnippet) return null;

  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)}
        className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none flex items-center gap-1">
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        Diff
      </button>
      {open && (
        <div className="mt-1.5 text-[11px] font-mono rounded-lg overflow-hidden border border-border-light">
          {oldSnippet && (
            <pre className="bg-red-50 text-red-700 px-2.5 py-1.5 whitespace-pre-wrap leading-relaxed">
              {oldSnippet.split("\n").map((line, i) => <div key={i}>- {line}</div>)}
            </pre>
          )}
          {newSnippet && (
            <pre className="bg-green-50 text-green-700 px-2.5 py-1.5 whitespace-pre-wrap leading-relaxed">
              {newSnippet.split("\n").map((line, i) => <div key={i}>+ {line}</div>)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function CodeContent({ content, label }: { content: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1 px-0.5">
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
        >
          {copied ? (
            <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
            </svg>
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="text-[11px] bg-console-bg text-console-text rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto border border-white/5">
        {content}
      </pre>
    </div>
  );
}

function PreviewableContent({ content, label }: { content: string; label: string }) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 mb-1 px-0.5">
        <div className="flex items-center gap-0.5 bg-surface-hover rounded-md p-0.5">
          <button
            onClick={() => setTab("preview")}
            className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${
              tab === "preview" ? "text-text-primary bg-surface" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setTab("code")}
            className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${
              tab === "code" ? "text-text-primary bg-surface" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Code
          </button>
        </div>
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
      </div>
      {tab === "preview" ? (
        <HtmlPreviewFrame
          srcDoc={content}
          title={label}
          className="w-full border border-border-light rounded-lg bg-white"
          style={{ height: "300px" }}
        />
      ) : (
        <pre className="text-[11px] bg-console-bg text-console-text rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono max-h-48 overflow-y-auto border border-white/5">
          {content}
        </pre>
      )}
    </div>
  );
}

function FileDetails({ toolName, toolInput, toolResult, autoCollapse }: { toolName: string; toolInput: Record<string, unknown>; toolResult: Record<string, unknown>; autoCollapse?: boolean }) {
  switch (toolName) {
    case "read_file": {
      const content = toolResult.content as string | undefined;
      if (!content) return null;
      return (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none">
            View Content
          </summary>
          <CodeContent content={content} label="File Content" />
        </details>
      );
    }
    case "write_file": {
      const content = toolInput.content as string | undefined;
      if (!content) return null;
      const filePath = (toolInput.path as string) ?? "";
      const isPreviewable = /\.(svg|html?)$/i.test(filePath);
      return (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none">
            View Content
          </summary>
          {isPreviewable ? (
            <PreviewableContent content={content} label="Written Content" />
          ) : (
            <CodeContent content={content} label="Written Content" />
          )}
        </details>
      );
    }
    case "edit_file":
      return <EditDiff toolResult={toolResult} autoCollapse={autoCollapse} />;
    case "list_files": {
      const items = toolResult.items as string[] | undefined;
      if (!items?.length) return null;
      return (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none">
            Files
          </summary>
          <pre className="mt-1.5 text-[11px] font-mono bg-background rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed border border-border-light text-text-secondary max-h-40 overflow-y-auto">
            {items.join("\n")}
          </pre>
        </details>
      );
    }
    case "glob": {
      const matches = toolResult.matches as string[] | undefined;
      if (!matches?.length) return null;
      return (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors select-none">
            Matches
          </summary>
          <pre className="mt-1.5 text-[11px] font-mono bg-background rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed border border-border-light text-text-secondary max-h-40 overflow-y-auto">
            {matches.join("\n")}
          </pre>
        </details>
      );
    }
    default:
      return null;
  }
}

export function FileToolRenderer(props: ToolRenderProps) {
  const { toolName, toolInput, toolResult } = props;
  const config = TOOL_CONFIG[toolName] ?? TOOL_CONFIG.read_file;
  const colorClass = COLOR_MAP[config.color] ?? COLOR_MAP.amber;
  const path = (toolInput.path as string) ?? (toolResult?.path as string) ?? "";
  const pattern = (toolInput.pattern as string) ?? (toolResult?.pattern as string) ?? "";
  const isError = toolResult && !!toolResult["error"];
  const displayPath = toolName === "grep" || toolName === "glob" ? pattern : path;

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt px-3.5 py-2.5 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <div className={`w-5 h-5 rounded-md flex items-center justify-center ${colorClass.split(" ")[0]}`}>
          <svg className={`w-3 h-3 ${colorClass.split(" ")[1]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={config.iconPath} />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary shrink-0">{config.label}</span>
        {!toolResult && <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto">Running...</span>}
        {toolResult && !isError && <span className="text-[10px] text-success ml-auto shrink-0">Done</span>}
        {toolResult && isError && <span className="text-[10px] text-error ml-auto shrink-0">Error</span>}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        <ExpandableInput value={displayPath} variant="text" className="flex-1 min-w-0" />
        {toolResult && !isError && <span className="shrink-0"><FileSummary toolName={toolName} toolResult={toolResult} /></span>}
      </div>
      {isError && typeof toolResult?.["message"] === "string" && (
        <p className="mt-1 text-[11px] text-error">{toolResult["message"] as string}</p>
      )}
      {toolResult && !isError && <FileDetails toolName={toolName} toolInput={toolInput} toolResult={toolResult} autoCollapse={props.autoCollapse} />}
    </div>
  );
}

