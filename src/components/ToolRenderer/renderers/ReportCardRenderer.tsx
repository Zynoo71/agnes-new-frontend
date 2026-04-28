import { useEffect, useRef, useState } from "react";
import type { ToolRenderProps } from "../registry";

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

// Skeleton-only renderer for `write_report` ToolCallStart. Spec
// §write_report: the final card now arrives as a separate
// `GenerationArtifact{kind=report}` event; this component only fills the
// gap during the silent writer-LLM phase and is replaced in-place once the
// GenerationArtifact lands (see conversationStore handler).
export function ReportCardRenderer({ toolInput }: ToolRenderProps) {
  const title = (toolInput.title as string | undefined) ?? "";
  const streamingContent = (toolInput.content as string | undefined) ?? "";
  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-amber-100 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary">Research Report</span>
        {title && (
          <span className="text-[11px] text-text-secondary truncate min-w-0 flex-1">&ldquo;{title}&rdquo;</span>
        )}
      </div>
      <WaitingIndicator contentLen={streamingContent.length} />
    </div>
  );
}
