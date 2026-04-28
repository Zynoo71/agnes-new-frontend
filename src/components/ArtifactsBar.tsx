import { useMemo, useState } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import type { GenerationArtifactData } from "@/stores/conversationStore";
import { useReportPreviewStore } from "@/stores/reportPreviewStore";
import { useImagePreviewStore } from "@/stores/imagePreviewStore";

const KIND_LABEL: Record<GenerationArtifactData["kind"], string> = {
  report: "Report",
  image: "Image",
  video: "Video",
};

function formatMillis(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function formatSeconds(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}s` : `${s}s`;
}

function pickArtifactThumbnail(a: GenerationArtifactData): string | null {
  if (a.kind === "image") {
    const r = a.results[0];
    return r ? r.thumbnailUrl || r.url : null;
  }
  if (a.kind === "video") {
    const r = a.results[0];
    return r ? r.coverUrl || r.firstFrameUrl || r.webpUrl || null : null;
  }
  return null;
}

function artifactSubtitle(a: GenerationArtifactData): string {
  if (a.kind === "report") {
    const parts: string[] = [];
    if (a.content.length > 0) parts.push(`${a.content.length.toLocaleString()} chars`);
    if (a.durationMs > 0) parts.push(formatMillis(a.durationMs));
    return parts.join(" · ");
  }
  if (a.kind === "image") {
    return `${a.results.length} ${a.results.length === 1 ? "image" : "images"}`;
  }
  const r = a.results[0];
  const parts: string[] = [`${a.results.length} ${a.results.length === 1 ? "video" : "videos"}`];
  if (r?.duration != null && r.duration > 0) parts.push(formatSeconds(r.duration));
  return parts.join(" · ");
}

export function ArtifactsBar() {
  const messages = useConversationStore((s) => s.messages);
  const openReport = useReportPreviewStore((s) => s.open);
  const openImage = useImagePreviewStore((s) => s.open);
  const [expanded, setExpanded] = useState(false);

  const artifacts = useMemo<GenerationArtifactData[]>(() => {
    const out: GenerationArtifactData[] = [];
    for (const m of messages) {
      for (const b of m.blocks) {
        if (b.type === "GenerationArtifact") out.push(b.data);
      }
    }
    // Newest first (messages iterate oldest → newest, blocks within a message
    // also oldest → newest; reverse once to flip both axes).
    return out.reverse();
  }, [messages]);

  if (artifacts.length === 0) return null;

  const handleOpen = (a: GenerationArtifactData) => {
    if (a.kind === "report") {
      openReport({
        title: a.title || "Untitled report",
        content: a.content,
        reportId: a.eventId || undefined,
        durationMs: a.durationMs,
      });
      return;
    }
    if (a.kind === "image") {
      const r = a.results[0];
      if (!r) return;
      openImage(r.url, a.prompt || a.title || "Generated image");
      return;
    }
    if (a.kind === "video") {
      const r = a.results[0];
      if (!r) return;
      // No video preview store; open in a new tab as a fallback.
      window.open(r.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="mb-2 rounded-xl border border-border-light bg-surface-alt/80 backdrop-blur-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="w-4 h-4 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
          <svg className="w-2.5 h-2.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <span className="text-[12px] font-medium text-text-primary">
          {artifacts.length} {artifacts.length === 1 ? "artifact" : "artifacts"}
        </span>
        <span className="text-[11px] text-text-tertiary">click to {expanded ? "collapse" : "preview"}</span>
        <svg
          className={`ml-auto w-3 h-3 text-text-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-border-light p-2 max-h-72 overflow-y-auto">
          <div className="grid grid-cols-4 gap-2">
            {artifacts.map((a, i) => (
              <ArtifactTile key={a.eventId || `artifact-${i}`} data={a} onOpen={() => handleOpen(a)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ArtifactTile({
  data,
  onOpen,
}: {
  data: GenerationArtifactData;
  onOpen: () => void;
}) {
  const thumb = pickArtifactThumbnail(data);
  const subtitle = artifactSubtitle(data);
  return (
    <button
      onClick={onOpen}
      className="group flex flex-col gap-1 p-1.5 rounded-md border border-border-light bg-background hover:border-accent/40 hover:shadow-sm transition-all text-left"
    >
      <div className="aspect-video rounded overflow-hidden bg-surface-muted flex items-center justify-center shrink-0">
        {data.kind === "report" ? (
          <ReportThumb content={data.content} />
        ) : thumb ? (
          <img
            src={thumb}
            alt={data.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="text-[9px] text-text-tertiary">no preview</div>
        )}
      </div>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[8px] uppercase tracking-wider font-semibold text-text-tertiary shrink-0">
          {KIND_LABEL[data.kind]}
        </span>
        <span className="text-[11px] font-medium text-text-primary truncate min-w-0 flex-1 group-hover:text-accent transition-colors">
          {data.title || "Untitled"}
        </span>
      </div>
      {subtitle && (
        <span className="text-[9px] text-text-tertiary tabular-nums truncate">{subtitle}</span>
      )}
    </button>
  );
}

function ReportThumb({ content }: { content: string }) {
  const preview = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return (
    <div className="w-full h-full p-1.5 text-[8px] leading-tight text-text-secondary overflow-hidden">
      {preview || "Empty report"}
    </div>
  );
}
