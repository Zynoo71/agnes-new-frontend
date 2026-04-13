import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocalSlidePreviewStore } from "@/stores/localSlidePreviewStore";

interface LocalSlideEntry {
  slideId: string;
  index: number;
  title: string;
  role: string;
}

interface LocalDeckOutline {
  title: string;
  goal: string;
  slides: LocalSlideEntry[];
}

function normalizeOutline(outline: Record<string, unknown> | null): LocalDeckOutline {
  const slides = Array.isArray(outline?.slides)
    ? outline.slides
        .map((slide, idx) => {
          const record = typeof slide === "object" && slide !== null ? (slide as Record<string, unknown>) : {};
          const index = typeof record.index === "number" ? record.index : idx + 1;
          const slideId =
            typeof record.slide_id === "string" && record.slide_id
              ? record.slide_id
              : `slide-${String(index).padStart(3, "0")}`;

          return {
            slideId,
            index,
            title: typeof record.title === "string" && record.title ? record.title : `Slide ${index}`,
            role: typeof record.role === "string" && record.role ? record.role : "content",
          };
        })
        .sort((a, b) => a.index - b.index)
    : [];

  return {
    title: typeof outline?.deck_title === "string" && outline.deck_title ? outline.deck_title : "Untitled Deck",
    goal: typeof outline?.deck_goal === "string" ? outline.deck_goal : "",
    slides,
  };
}

function slideFileUrl(conversationId: string, filePath: string): string {
  return `/__local_slide_workspace/${encodeURIComponent(conversationId)}/${filePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function LocalSlidePreviewDialog({
  conversationId,
  fallbackOutline,
  initialSlideId,
  close,
}: {
  conversationId: string;
  fallbackOutline: Record<string, unknown> | null;
  initialSlideId: string;
  close: () => void;
}) {
  const fallbackDeckOutline = useMemo(() => normalizeOutline(fallbackOutline), [fallbackOutline]);
  const [fetchedOutline, setFetchedOutline] = useState<LocalDeckOutline | null>(null);
  const [selectedSlideId, setSelectedSlideId] = useState("");
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [notice, setNotice] = useState("");
  const [frameSize, setFrameSize] = useState({ width: 1600, height: 900 });
  const [frameScale, setFrameScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const cleanupEmbeddedObserverRef = useRef<(() => void) | null>(null);

  const outline = fetchedOutline ?? fallbackDeckOutline;
  const outlineUrl = useMemo(() => {
    if (!conversationId) return "";
    return slideFileUrl(conversationId, "deck/deck_outline.json");
  }, [conversationId]);

  const selectedSlide = useMemo(
    () => outline.slides.find((slide) => slide.slideId === selectedSlideId) ?? outline.slides[0] ?? null,
    [outline.slides, selectedSlideId],
  );
  const selectedSlideIndex = useMemo(
    () => (selectedSlide ? outline.slides.findIndex((slide) => slide.slideId === selectedSlide.slideId) : -1),
    [outline.slides, selectedSlide],
  );

  const iframeUrl = useMemo(() => {
    if (!conversationId || !selectedSlide) return "";
    return slideFileUrl(conversationId, `deck/slides/${selectedSlide.slideId}/index.html`);
  }, [conversationId, selectedSlide]);

  const selectDefaultSlide = useCallback(
    (deckOutline: LocalDeckOutline, preferredSlideId?: string) =>
      deckOutline.slides.find((slide) => slide.slideId === preferredSlideId)?.slideId ??
      deckOutline.slides.find((slide) => slide.slideId === initialSlideId)?.slideId ??
      deckOutline.slides[0]?.slideId ??
      "",
    [initialSlideId],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    },
    [close],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  useEffect(() => {
    if (!outlineUrl) {
      return;
    }

    let cancelled = false;

    void fetch(outlineUrl, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`读取本地大纲失败 (${response.status})`);
        }
        return response.json() as Promise<Record<string, unknown>>;
      })
      .then((json) => {
        if (cancelled) return;
        const normalized = normalizeOutline(json);
        setFetchedOutline(normalized);
        setSelectedSlideId((current) => current || selectDefaultSlide(normalized, initialSlideId));
      })
      .catch((error) => {
        if (cancelled) return;
        if (fallbackOutline) {
          setNotice(`本地大纲读取失败，已使用消息内大纲。${error instanceof Error ? error.message : String(error)}`);
          setSelectedSlideId((current) => current || selectDefaultSlide(fallbackDeckOutline, initialSlideId));
          return;
        }
        setNotice(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackDeckOutline, fallbackOutline, initialSlideId, outlineUrl, selectDefaultSlide]);

  const updateFrameMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    const iframe = iframeRef.current;
    if (!viewport || !iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    const root = doc.documentElement;
    const body = doc.body;
    const naturalWidth = Math.max(root.scrollWidth, root.clientWidth, body?.scrollWidth ?? 0, body?.clientWidth ?? 0, 1);
    const naturalHeight = Math.max(root.scrollHeight, root.clientHeight, body?.scrollHeight ?? 0, body?.clientHeight ?? 0, 1);
    const scale = Math.min(viewport.clientWidth / naturalWidth, viewport.clientHeight / naturalHeight, 1);

    setFrameSize((current) =>
      current.width === naturalWidth && current.height === naturalHeight
        ? current
        : { width: naturalWidth, height: naturalHeight },
    );
    setFrameScale((current) => (Math.abs(current - scale) < 0.001 ? current : scale));
  }, []);

  const bindEmbeddedResizeObserver = useCallback(() => {
    cleanupEmbeddedObserverRef.current?.();
    cleanupEmbeddedObserverRef.current = null;

    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    updateFrameMetrics();

    const win = iframe?.contentWindow;
    if (!win) return;

    const resizeObserver = new ResizeObserver(() => {
      updateFrameMetrics();
    });

    resizeObserver.observe(doc.documentElement);
    if (doc.body) {
      resizeObserver.observe(doc.body);
    }

    const imageNodes = Array.from(doc.images);
    const handleAssetLoad = () => updateFrameMetrics();
    imageNodes.forEach((img) => img.addEventListener("load", handleAssetLoad));
    win.addEventListener("resize", handleAssetLoad);

    cleanupEmbeddedObserverRef.current = () => {
      resizeObserver.disconnect();
      imageNodes.forEach((img) => img.removeEventListener("load", handleAssetLoad));
      win.removeEventListener("resize", handleAssetLoad);
    };
  }, [updateFrameMetrics]);

  useEffect(() => {
    if (!iframeUrl) return;
    setFrameScale(1);
    cleanupEmbeddedObserverRef.current?.();
    cleanupEmbeddedObserverRef.current = null;
    return () => {
      cleanupEmbeddedObserverRef.current?.();
      cleanupEmbeddedObserverRef.current = null;
    };
  }, [iframeUrl]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(() => {
      updateFrameMetrics();
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [updateFrameMetrics]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="flex h-[min(94vh,940px)] w-[min(98vw,1600px)] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-surface-alt">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text-primary">{outline.title}</p>
                <p className="mt-1 text-[11px] font-mono text-text-tertiary">#{conversationId}</p>
              </div>
              <button
                onClick={close}
                className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface hover:text-text-primary"
                aria-label="Close local slide preview"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {outline.goal && <p className="mt-2 text-xs leading-relaxed text-text-secondary">{outline.goal}</p>}
            {notice && <p className="mt-2 text-xs leading-relaxed text-amber-700">{notice}</p>}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {loading && outline.slides.length === 0 ? (
              <p className="px-2 text-sm text-text-secondary">正在读取本地大纲...</p>
            ) : outline.slides.length > 0 ? (
              <div className="space-y-1.5">
                {outline.slides.map((slide) => {
                  const active = slide.slideId === selectedSlide?.slideId;
                  return (
                    <button
                      key={slide.slideId}
                      onClick={() => setSelectedSlideId(slide.slideId)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-accent/30 bg-accent-light"
                          : "border-transparent bg-surface hover:border-border hover:bg-surface-hover"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-[10px] font-mono text-text-tertiary">{slide.index}</span>
                        <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                          {slide.role}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-text-primary">{slide.title}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-2 text-sm text-text-secondary">这个会话目录下没有找到 slides 产物。</p>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-background">
          <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text-primary">
                {selectedSlide ? `${selectedSlide.index}. ${selectedSlide.title}` : "未选择页面"}
              </p>
              <p className="text-xs text-text-tertiary">
                {selectedSlide ? selectedSlide.slideId : "等待本地产物"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (selectedSlideIndex > 0) {
                    setSelectedSlideId(outline.slides[selectedSlideIndex - 1].slideId);
                  }
                }}
                disabled={selectedSlideIndex <= 0}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                上一页
              </button>
              <button
                onClick={() => {
                  if (selectedSlideIndex >= 0 && selectedSlideIndex < outline.slides.length - 1) {
                    setSelectedSlideId(outline.slides[selectedSlideIndex + 1].slideId);
                  }
                }}
                disabled={selectedSlideIndex < 0 || selectedSlideIndex >= outline.slides.length - 1}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
              {iframeUrl && (
                <a
                  href={iframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
                >
                  新窗口打开
                </a>
              )}
            </div>
          </div>

          <div ref={viewportRef} className="min-h-0 flex flex-1 items-center justify-center overflow-auto bg-[#eef3f8] p-4">
            {iframeUrl ? (
              <div
                className="relative shrink-0 rounded-[20px] border border-border/70 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]"
                style={{
                  width: `${frameSize.width * frameScale}px`,
                  height: `${frameSize.height * frameScale}px`,
                }}
              >
                <iframe
                  key={iframeUrl}
                  ref={iframeRef}
                  src={iframeUrl}
                  title={selectedSlide?.title ?? "Local slide preview"}
                  onLoad={bindEmbeddedResizeObserver}
                  className="absolute left-0 top-0 rounded-[20px] bg-white"
                  style={{
                    width: `${frameSize.width}px`,
                    height: `${frameSize.height}px`,
                    transform: `scale(${frameScale})`,
                    transformOrigin: "top left",
                    border: "0",
                  }}
                />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface-alt text-sm text-text-secondary">
                选择一个页面开始预览
              </div>
            )}
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

export function LocalSlidePreview() {
  const { isOpen, conversationId, fallbackOutline, initialSlideId, close } = useLocalSlidePreviewStore();

  if (!isOpen) return null;

  return (
    <LocalSlidePreviewDialog
      key={`${conversationId}:${initialSlideId}`}
      conversationId={conversationId}
      fallbackOutline={fallbackOutline}
      initialSlideId={initialSlideId}
      close={close}
    />
  );
}
