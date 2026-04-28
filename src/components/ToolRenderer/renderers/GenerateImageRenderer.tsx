import type { ToolRenderProps } from "../registry";

// Skeleton-only renderer for `generate_image` ToolCallStart. The final card now
// arrives as a separate `GenerationArtifact{kind=image}` event; this component
// only fills the gap during the AIGC task wait and is hidden in MessageBubble
// once the GenerationArtifact lands (see render-time guard).
export function GenerateImageRenderer({ toolInput }: ToolRenderProps) {
  const prompt = (toolInput.prompt as string) ?? "";
  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-violet-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Image Generation</span>
        <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Generating...</span>
      </div>
      {prompt && (
        <p className="text-[11px] text-text-secondary line-clamp-2">{prompt}</p>
      )}
    </div>
  );
}
