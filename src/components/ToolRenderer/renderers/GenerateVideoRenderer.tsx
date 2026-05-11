import type { ToolRenderProps } from "../registry";

// Skeleton-only renderer for `generate_video` ToolCallStart. The final card now
// arrives as a separate `GenerationArtifact{kind=video}` event; this component
// only fills the gap during the AIGC task wait and is hidden in MessageBubble
// once the GenerationArtifact lands (see render-time guard).
export function GenerateVideoRenderer({ toolInput }: ToolRenderProps) {
  const prompt = (toolInput.prompt as string) ?? "";
  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Video Generation</span>
        <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Generating...</span>
      </div>
      {prompt && (
        <p className="text-[11px] text-text-secondary line-clamp-2">{prompt}</p>
      )}
    </div>
  );
}
