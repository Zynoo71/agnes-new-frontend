import type { SheetArtifactData } from "@/stores/conversationStore";

const TYPE_META: Record<
  string,
  { label: string; emoji: string; bg: string; text: string; border: string; ring: string }
> = {
  CHART:     { label: "Chart",     emoji: "📊", bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200/70",     ring: "ring-sky-200/50" },
  TABLE:     { label: "Table",     emoji: "🗒️", bg: "bg-violet-50",  text: "text-violet-700",  border: "border-violet-200/70",  ring: "ring-violet-200/50" },
  REPORT:    { label: "Report",    emoji: "📄", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200/70", ring: "ring-emerald-200/50" },
  DASHBOARD: { label: "Dashboard", emoji: "🧭", bg: "bg-indigo-50",  text: "text-indigo-700",  border: "border-indigo-200/70",  ring: "ring-indigo-200/50" },
  EXPORT:    { label: "Export",    emoji: "📦", bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200/70",   ring: "ring-amber-200/50" },
  TEXT:      { label: "Text",      emoji: "📝", bg: "bg-slate-50",   text: "text-slate-700",   border: "border-slate-200/70",   ring: "ring-slate-200/50" },
  DATASET:   { label: "Dataset",   emoji: "🗃️", bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200/70",    ring: "ring-teal-200/50" },
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function summarizeContent(type: string, content: Record<string, unknown>): string | null {
  switch (type) {
    case "CHART": {
      const kind = typeof content.chart_kind === "string" ? content.chart_kind : "";
      return kind ? `${kind} chart` : null;
    }
    case "TABLE": {
      const cols = Array.isArray(content.columns) ? content.columns.length : null;
      const rows = typeof content.row_count === "number" ? content.row_count : null;
      if (cols != null && rows != null) return `${rows} rows × ${cols} cols`;
      if (rows != null) return `${rows} rows`;
      return null;
    }
    case "DASHBOARD": {
      const panels = Array.isArray(content.panels) ? content.panels.length : null;
      return panels != null ? `${panels} panels` : null;
    }
    case "EXPORT": {
      const size = typeof content.file_size_bytes === "number" ? content.file_size_bytes : null;
      return size != null ? formatBytes(size) : null;
    }
    case "DATASET": {
      const rows = typeof content.rows === "number" ? content.rows : null;
      const cols = typeof content.cols === "number" ? content.cols : null;
      if (rows != null && cols != null) return `${rows} rows × ${cols} cols`;
      return null;
    }
    case "REPORT": {
      const path = typeof content.workspace_path === "string" ? content.workspace_path : null;
      return path;
    }
    default:
      return null;
  }
}

function downloadHref(content: Record<string, unknown>): string | null {
  const url = (content.download_url as string) || (content.preview_url as string) || null;
  return typeof url === "string" && url.length > 0 ? url : null;
}

export function SheetArtifactCard({ data }: { data: SheetArtifactData }) {
  const meta = TYPE_META[data.artifactType] ?? TYPE_META.TEXT;
  const summary = summarizeContent(data.artifactType, data.content);
  const href = downloadHref(data.content);
  const dimmed = data.invalidated;

  return (
    <div
      className={`my-2 group rounded-xl border ${meta.border} ${meta.bg} px-3 py-2.5 transition-all hover:shadow-sm hover:ring-2 ${meta.ring} ${dimmed ? "opacity-50 grayscale" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div className="text-xl shrink-0 select-none">{meta.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${meta.text}`}>
              {meta.label}
            </span>
            {data.producerNodeId && (
              <span className="text-[10px] font-mono text-text-tertiary bg-white/60 px-1.5 py-0.5 rounded">
                {data.producerNodeId.slice(0, 12)}
              </span>
            )}
            {dimmed && (
              <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                invalidated{data.invalidatedReason ? `: ${data.invalidatedReason}` : ""}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[13px] font-medium text-text-primary truncate" title={data.name}>
            {data.name}
          </div>
          {summary && (
            <div className="mt-0.5 text-[11px] text-text-secondary truncate">{summary}</div>
          )}
          <div className="mt-1 text-[10px] font-mono text-text-tertiary truncate" title={data.artifactId}>
            {data.artifactId}
          </div>
        </div>
        {href && !dimmed && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`shrink-0 inline-flex items-center gap-1 rounded-lg border ${meta.border} bg-white/70 hover:bg-white px-2 py-1 text-[11px] font-medium ${meta.text} transition-colors`}
          >
            Open
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M21 3l-9 9M5 5h6V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-6h-2v6H5V5z" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
