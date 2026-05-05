import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import type { GenerationArtifactData, SlideArtifactData } from "@/stores/conversationStore";
import { useReportPreviewStore } from "@/stores/reportPreviewStore";
import { useImagePreviewStore } from "@/stores/imagePreviewStore";

const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly];

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

export function GenerationArtifactCard({ data }: { data: GenerationArtifactData }) {
  if (data.kind === "report") return <ReportCard data={data} />;
  if (data.kind === "image") return <ImageCard data={data} />;
  if (data.kind === "video") return <VideoCard data={data} />;
  if (data.kind === "slide") return <SlideCard data={data} />;
  return null;
}

// ── Report ───────────────────────────────────────────────────────────────────

function ReportCard({
  data,
}: {
  data: Extract<GenerationArtifactData, { kind: "report" }>;
}) {
  const { title, content, durationMs, eventId } = data;
  const [expanded, setExpanded] = useState(false);
  const openPreview = useReportPreviewStore((s) => s.open);

  const handleOpenPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPreview({
      title: title || "Untitled report",
      content,
      reportId: eventId || undefined,
      durationMs,
    });
  };

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary">Research Report</span>
        <span className="text-[10px] text-success ml-auto">Done</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="w-full flex items-center gap-2 text-left group cursor-pointer"
      >
        <svg
          className={`w-3 h-3 text-text-tertiary transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-[13px] font-medium text-text-primary truncate group-hover:text-accent transition-colors">
          {title || "Untitled report"}
        </span>
        <span className="ml-auto text-[10px] text-text-tertiary tabular-nums shrink-0">
          {content.length > 0 && <span>{content.length.toLocaleString()} chars</span>}
          {durationMs > 0 && <span className="ml-2">· {formatMillis(durationMs)}</span>}
        </span>
        {content && (
          <button
            onClick={handleOpenPreview}
            className="p-1 rounded text-text-tertiary hover:text-accent hover:bg-surface-hover transition-colors shrink-0"
            aria-label="Open full-screen preview"
            title="Open full-screen preview"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        )}
      </div>

      {expanded && content && (
        <div className="mt-3 pt-3 border-t border-border-light">
          <div className="prose-agent text-[13px] leading-[1.7] text-text-primary max-h-[60vh] overflow-y-auto">
            <Markdown remarkPlugins={REMARK_PLUGINS}>{content}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Image ────────────────────────────────────────────────────────────────────

function ImageCard({
  data,
}: {
  data: Extract<GenerationArtifactData, { kind: "image" }>;
}) {
  const { title, prompt, results } = data;
  const openPreview = useImagePreviewStore((s) => s.open);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const visible = results.filter((r) => !failed.has(r.url));

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-violet-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">
          {title || "Image Generation"}
        </span>
        <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
          {visible.length} {visible.length === 1 ? "image" : "images"}
        </span>
      </div>
      {prompt && (
        <p className="text-[11px] text-text-secondary mb-2 line-clamp-2">{prompt}</p>
      )}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visible.map((r, i) => (
            <button
              key={r.url}
              onClick={() => openPreview(r.url, prompt || title || `Generated image ${i + 1}`)}
              className="group relative overflow-hidden rounded-lg bg-background hover:opacity-80 transition-all cursor-zoom-in"
            >
              <img
                src={r.thumbnailUrl || r.url}
                alt={prompt || `Generated image ${i + 1}`}
                className="max-w-60 max-h-60 object-contain"
                onError={() => setFailed((s) => new Set(s).add(r.url))}
              />
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 && (
        <p className="text-[11px] text-text-tertiary">No images returned.</p>
      )}
    </div>
  );
}

// ── Video ────────────────────────────────────────────────────────────────────

function VideoCard({
  data,
}: {
  data: Extract<GenerationArtifactData, { kind: "video" }>;
}) {
  const { title, prompt, results } = data;
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const visible = results.filter((r) => !failed.has(r.url));

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">
          {title || "Video Generation"}
        </span>
        <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
          {visible.length} {visible.length === 1 ? "video" : "videos"}
        </span>
      </div>
      {prompt && (
        <p className="text-[11px] text-text-secondary mb-2 line-clamp-2">{prompt}</p>
      )}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {visible.map((r, i) => (
            <div key={r.url} className="relative overflow-hidden rounded-lg bg-black">
              <video
                src={r.url}
                poster={r.coverUrl || r.firstFrameUrl || undefined}
                controls
                preload="metadata"
                playsInline
                className="max-w-80 max-h-60 rounded-lg"
                onError={() => setFailed((s) => new Set(s).add(r.url))}
              >
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  Download video {i + 1}
                </a>
              </video>
              {r.duration != null && r.duration > 0 && (
                <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono tabular-nums">
                  {formatSeconds(r.duration)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {visible.length === 0 && (
        <p className="text-[11px] text-text-tertiary">No videos returned.</p>
      )}
    </div>
  );
}

// ── Slide ────────────────────────────────────────────────────────────────────

function SlideCard({ data }: { data: SlideArtifactData }) {
  const { title, cover, pageCount, slideUrls, html } = data;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">
          {title || "Untitled Deck"}
        </span>
        <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
          {pageCount} {pageCount === 1 ? "slide" : "slides"}
        </span>
      </div>

      {cover && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-lg overflow-hidden bg-background hover:opacity-90 transition-opacity cursor-pointer"
        >
          <img
            src={cover}
            alt={title || "Slide preview"}
            className="w-full aspect-video object-cover"
          />
        </button>
      )}
      {!cover && slideUrls.length > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full aspect-video rounded-lg bg-blue-50 flex items-center justify-center cursor-pointer hover:bg-blue-100 transition-colors"
        >
          <span className="text-xs text-blue-600 font-medium">Click to preview</span>
        </button>
      )}

      {expanded && html && (
        <div className="mt-3 pt-3 border-t border-border-light">
          <iframe
            srcDoc={html}
            title={title || "Slide preview"}
            className="w-full rounded-lg border border-border-light"
            style={{ height: "50vh", minHeight: 300 }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

