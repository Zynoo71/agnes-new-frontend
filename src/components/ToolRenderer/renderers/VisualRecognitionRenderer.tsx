import { useState } from "react";
import { useImagePreviewStore } from "@/stores/imagePreviewStore";
import type { ToolRenderProps } from "../registry";

const SOURCE_LABELS: Record<string, string> = {
  explicit: "Specified image",
  latest_attachment: "Latest upload",
  latest_generated_image: "Latest generated image",
  visual_context_cache: "Cached prior upload",
  none: "No image",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isPreviewableImageRef(ref: string): boolean {
  if (ref.startsWith("http://") || ref.startsWith("https://")) return true;
  return ref.startsWith("data:image/") && ref.includes(",");
}

function fallbackImageLabel(ref: string, index: number): string {
  if (ref === "data:image/...") return `Inline image ${index + 1}`;
  return `Image ${index + 1}`;
}

export function VisualRecognitionRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const openPreview = useImagePreviewStore((s) => s.open);
  const [failedRefs, setFailedRefs] = useState<Set<string>>(() => new Set());

  const question = asString(toolResult?.question) || asString(toolInput.question);
  const answer = asString(toolResult?.answer) || asString(toolResult?.content);
  const isError = Boolean(toolResult?.error);
  const errorMessage = asString(toolResult?.message);
  const resolvedFrom = asString(toolResult?.resolved_from);
  const imageRefs = (() => {
    const fromResult = asStringList(toolResult?.image_refs);
    if (fromResult.length > 0) return fromResult;
    return asStringList(toolInput.image_urls);
  })();

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-5 h-5 rounded-md bg-cyan-50 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.433 0 .644C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Visual Recognition</span>
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Inspecting...</span>
        )}
        {toolResult && !isError && (
          <span className="text-[10px] text-success ml-auto shrink-0">Done</span>
        )}
        {toolResult && isError && (
          <span className="text-[10px] text-error ml-auto shrink-0">Error</span>
        )}
      </div>

      {question && (
        <div className="rounded-lg border border-border-light bg-background px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary mb-1">Question</div>
          <p className="text-[12px] leading-relaxed text-text-primary whitespace-pre-wrap">{question}</p>
        </div>
      )}

      {(resolvedFrom || imageRefs.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {resolvedFrom && (
            <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
              {SOURCE_LABELS[resolvedFrom] ?? resolvedFrom}
            </span>
          )}
          {imageRefs.length > 0 && (
            <span className="inline-flex items-center rounded-full border border-border-light bg-background px-2 py-0.5 text-[10px] font-medium text-text-tertiary">
              {imageRefs.length} {imageRefs.length === 1 ? "image" : "images"}
            </span>
          )}
        </div>
      )}

      {!toolResult && (
        <p className="mt-2.5 text-[11px] text-text-tertiary">Inspecting the selected image context.</p>
      )}

      {toolResult && !isError && answer && (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/60 px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700/80 mb-1">Answer</div>
          <p className="text-[12px] leading-relaxed text-text-primary whitespace-pre-wrap">{answer}</p>
        </div>
      )}

      {toolResult && isError && (
        <p className="mt-3 text-[11px] leading-relaxed text-error">{errorMessage || "Image inspection failed."}</p>
      )}

      {imageRefs.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {imageRefs.map((ref, index) => {
            const previewable = isPreviewableImageRef(ref) && !failedRefs.has(ref);
            if (previewable) {
              return (
                <button
                  key={`${ref}-${index}`}
                  onClick={() => openPreview(ref, question || fallbackImageLabel(ref, index))}
                  className="group relative overflow-hidden rounded-lg border border-border-light bg-background text-left transition-opacity hover:opacity-85 cursor-zoom-in"
                >
                  <img
                    src={ref}
                    alt={question || fallbackImageLabel(ref, index)}
                    className="h-24 w-full object-cover"
                    onError={() => {
                      setFailedRefs((prev) => {
                        const next = new Set(prev);
                        next.add(ref);
                        return next;
                      });
                    }}
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 text-[10px] font-medium text-white">
                    {fallbackImageLabel(ref, index)}
                  </div>
                </button>
              );
            }

            return (
              <div
                key={`${ref}-${index}`}
                className="flex h-24 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background px-2 text-center"
              >
                <svg className="mb-1.5 h-4 w-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                </svg>
                <span className="text-[10px] font-medium text-text-secondary">{fallbackImageLabel(ref, index)}</span>
                {ref === "data:image/..." && (
                  <span className="mt-1 text-[10px] text-text-tertiary">Inline image</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
