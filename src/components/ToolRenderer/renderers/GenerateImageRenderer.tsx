import { useState } from "react";
import { useImagePreviewStore } from "@/stores/imagePreviewStore";
import type { ToolRenderProps } from "../registry";

export function GenerateImageRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const prompt = (toolInput.prompt as string) ?? "";
  const urls = toolResult && Array.isArray(toolResult.urls) ? (toolResult.urls as string[]) : [];
  const openPreview = useImagePreviewStore((s) => s.open);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const visible = urls.filter((u) => !failedUrls.has(u));

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-violet-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Image Generation</span>
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Generating...</span>
        )}
        {toolResult && visible.length > 0 && (
          <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
            {visible.length} {visible.length === 1 ? "image" : "images"}
          </span>
        )}
      </div>
      {prompt && (
        <p className="text-[11px] text-text-secondary mb-2 line-clamp-2">{prompt}</p>
      )}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {visible.map((url, i) => (
            <button
              key={url}
              onClick={() => openPreview(url, prompt || `Generated image ${i + 1}`)}
              className="group relative overflow-hidden rounded-lg bg-background hover:opacity-80 transition-all cursor-zoom-in"
            >
              <img
                src={url}
                alt={`Generated image ${i + 1}`}
                className="max-w-60 max-h-60 object-contain"
                onError={() => setFailedUrls((s) => new Set(s).add(url))}
              />
            </button>
          ))}
        </div>
      )}
      {toolResult && visible.length === 0 && (
        <p className="text-[11px] text-text-tertiary">No images returned.</p>
      )}
    </div>
  );
}
