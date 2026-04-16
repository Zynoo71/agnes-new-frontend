import { useState } from "react";
import type { ToolRenderProps } from "../registry";

export function GenerateVideoRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const prompt = (toolInput.prompt as string) ?? "";
  const urls = toolResult && Array.isArray(toolResult.urls) ? (toolResult.urls as string[]) : [];
  const [failedUrls, setFailedUrls] = useState<Set<string>>(() => new Set());
  const visible = urls.filter((u) => !failedUrls.has(u));

  return (
    <div className="rounded-xl border border-border-light bg-surface-alt p-3.5 text-sm shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-text-primary tracking-tight shrink-0">Video Generation</span>
        {!toolResult && (
          <span className="text-[10px] text-text-tertiary animate-gentle-pulse ml-auto shrink-0">Generating...</span>
        )}
        {toolResult && visible.length > 0 && (
          <span className="text-[10px] text-text-tertiary ml-auto shrink-0">
            {visible.length} {visible.length === 1 ? "video" : "videos"}
          </span>
        )}
      </div>
      {prompt && (
        <p className="text-[11px] text-text-secondary mb-2 line-clamp-2">{prompt}</p>
      )}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {visible.map((url, i) => (
            <div
              key={url}
              className="relative overflow-hidden rounded-lg bg-black"
            >
              <video
                src={url}
                controls
                preload="metadata"
                playsInline
                className="max-w-80 max-h-60 rounded-lg"
                onError={() => setFailedUrls((s) => new Set(s).add(url))}
              >
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Download video {i + 1}
                </a>
              </video>
            </div>
          ))}
        </div>
      )}
      {toolResult && visible.length === 0 && (
        <p className="text-[11px] text-text-tertiary">No videos returned.</p>
      )}
    </div>
  );
}
