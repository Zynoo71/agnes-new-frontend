import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

interface Props {
  src?: string;
  srcDoc?: string;
  /** Passed through to both the inline and fullscreen iframes. */
  sandbox?: string;
  title?: string;
  /** Styling for the inline iframe only; the fullscreen iframe fills the viewport. */
  className?: string;
  style?: CSSProperties;
}

export function HtmlPreviewFrame({
  src,
  srcDoc,
  sandbox = "",
  title = "HTML preview",
  className,
  style,
}: Props) {
  const [fullscreen, setFullscreen] = useState(false);
  const frameProps = src ? { src } : { srcDoc: srcDoc ?? "" };

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  return (
    <>
      <div className="relative">
        <iframe
          {...frameProps}
          sandbox={sandbox}
          title={title}
          className={className}
          style={style}
        />
        <button
          onClick={() => setFullscreen(true)}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-md bg-black/55 text-white hover:bg-black/75 flex items-center justify-center transition-colors backdrop-blur-sm"
          title="Fullscreen preview"
          aria-label="Fullscreen preview"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 8.25V3.75h4.5M15.75 3.75h4.5v4.5M20.25 15.75v4.5h-4.5M8.25 20.25h-4.5v-4.5" />
          </svg>
        </button>
      </div>
      {fullscreen &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex flex-col bg-black/80 backdrop-blur-sm">
            <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border shrink-0">
              <span className="text-sm font-medium text-text-primary truncate">{title}</span>
              <button
                onClick={() => setFullscreen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
                aria-label="Close preview"
                title="Close (Esc)"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              {...frameProps}
              sandbox={sandbox}
              title={title}
              className="flex-1 w-full bg-white border-0"
            />
          </div>,
          document.body,
        )}
    </>
  );
}
