import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import type { ToolRenderProps } from "../registry";
import { useReportPreviewStore } from "@/stores/reportPreviewStore";

const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly];

const WAITING_PHRASES = [
  "Pondering deep thoughts",
  "Cogitating",
  "Marshalling arguments",
  "Cross-referencing sources",
  "Polishing prose",
  "Fact-checking",
  "Connecting the dots",
  "Drafting passages",
  "Consulting the muses",
  "Sipping digital coffee",
  "Weaving a narrative",
  "Synthesizing findings",
  "Untangling the threads",
  "Sharpening the quill",
  "Dotting i's, crossing t's",
  "Rummaging through notes",
  "Percolating ideas",
  "Mulling it over",
  "Sketching the outline",
  "Proofreading in my head",
  "Channeling inspiration",
  "Arranging the evidence",
  "Rereading the brief",
];

const KAOMOJI = [
  "(•̀ᴗ•́)و",
  "¯\\_(ツ)_/¯",
  "(づ｡◕‿‿◕｡)づ",
  "ʕ •ᴥ•ʔ",
  "(｡◕‿◕｡)",
  "ᓚᘏᗢ",
  "(๑•̀ㅂ•́)و✧",
  "(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧",
  "╰( ͡° ͜ʖ ͡° )つ──☆*:",
  "( •_•)>⌐■-■",
];

const PHRASE_INTERVAL_MS = 5000;

function pickRandom<T>(arr: T[], excludeIdx?: number): number {
  if (arr.length <= 1) return 0;
  let i = Math.floor(Math.random() * arr.length);
  if (excludeIdx !== undefined && i === excludeIdx) {
    i = (i + 1) % arr.length;
  }
  return i;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return `${m}m${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function WaitingIndicator({ contentLen }: { contentLen: number }) {
  const [phraseIdx, setPhraseIdx] = useState(() => pickRandom(WAITING_PHRASES));
  const [kaomojiIdx, setKaomojiIdx] = useState(() => pickRandom(KAOMOJI));
  const startRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    startRef.current = Date.now();
    const phraseTimer = setInterval(() => {
      setPhraseIdx((prev) => pickRandom(WAITING_PHRASES, prev));
      setKaomojiIdx((prev) => pickRandom(KAOMOJI, prev));
    }, PHRASE_INTERVAL_MS);
    const tickTimer = setInterval(() => {
      if (startRef.current !== null) {
        setElapsedMs(Date.now() - startRef.current);
      }
    }, 1000);
    return () => {
      clearInterval(phraseTimer);
      clearInterval(tickTimer);
    };
  }, []);

  return (
    <div className="flex items-center gap-2.5 text-[12px] text-text-secondary">
      <span className="font-mono text-base leading-none shrink-0 select-none">
        {KAOMOJI[kaomojiIdx]}
      </span>
      <span className="animate-gentle-pulse">{WAITING_PHRASES[phraseIdx]}…</span>
      <span className="ml-auto text-[10px] text-text-tertiary tabular-nums shrink-0">
        {formatDuration(elapsedMs)}
        {contentLen > 0 && <span className="ml-2">· {contentLen.toLocaleString()} chars</span>}
      </span>
    </div>
  );
}

export function ReportCardRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const title = (toolResult?.title as string | undefined) ?? (toolInput.title as string | undefined) ?? "";
  const streamingContent = (toolInput.content as string | undefined) ?? "";
  const finalContent = (toolResult?.content as string | undefined) ?? streamingContent;
  const reportId = toolResult?.report_id as string | number | undefined;
  const durationMs = typeof toolResult?.duration_ms === "number" ? toolResult.duration_ms : undefined;
  const errorMsg = typeof toolResult?.error === "string" ? toolResult.error : undefined;

  const isDone = !!toolResult && !errorMsg;
  const streamingCount = streamingContent.length;
  const finalCount = useMemo(() => finalContent.length, [finalContent]);

  const [expanded, setExpanded] = useState(false);
  const openPreview = useReportPreviewStore((s) => s.open);

  const handleOpenPreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    openPreview({
      title: title || "Untitled report",
      content: finalContent,
      reportId: reportId != null ? String(reportId) : undefined,
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
        {isDone && (
          <span className="text-[10px] text-success ml-auto">Done</span>
        )}
        {errorMsg && (
          <span className="text-[10px] text-error ml-auto">Error</span>
        )}
      </div>

      {!isDone && !errorMsg && <WaitingIndicator contentLen={streamingCount} />}

      {errorMsg && (
        <p className="text-[12px] text-error whitespace-pre-wrap">{errorMsg}</p>
      )}

      {isDone && (
        <>
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
              {finalCount > 0 && <span>{finalCount.toLocaleString()} chars</span>}
              {durationMs != null && durationMs > 0 && (
                <span className="ml-2">· {formatDuration(durationMs)}</span>
              )}
              {reportId != null && (
                <span className="ml-2 font-mono">#{String(reportId)}</span>
              )}
            </span>
            {finalContent && (
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

          {expanded && finalContent && (
            <div className="mt-3 pt-3 border-t border-border-light">
              <div className="prose-agent text-[13px] leading-[1.7] text-text-primary max-h-[60vh] overflow-y-auto">
                <Markdown remarkPlugins={REMARK_PLUGINS}>{finalContent}</Markdown>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
