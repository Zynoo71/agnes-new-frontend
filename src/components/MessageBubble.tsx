import { useState, useEffect, useRef, useCallback, memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import type {
  Message,
  ContentBlock,
  HumanReviewData,
  ToolCallData,
  MemoryUpdateData,
  SlideOutlineData,
  SlideDesignSystemData,
} from "@/stores/conversationStore";
import { PLANNING_TOOL_NAMES, SWARM_TOOL_NAMES, useConversationStore } from "@/stores/conversationStore";
import { CitationSources } from "@/components/CitationSources";
import { ToolCallBlock } from "./ToolRenderer/ToolCallBlock";
import { AgentSwarmPanel } from "./AgentSwarmPanel";
import { TaskListPanel } from "./TaskListPanel";
import { CodeBlock } from "./CodeBlock";
import { NodeSteps } from "./NodeSteps";
import { useImagePreviewStore } from "@/stores/imagePreviewStore";
import { useLocalSlidePreviewStore } from "@/stores/localSlidePreviewStore";

// ── Stable references for Markdown (avoid remounting custom elements on re-render) ──
const REMARK_PLUGINS = [remarkGfm, remarkCjkFriendly];

function formatNaturalDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h${minutes > 0 ? `${minutes}min` : ""}${seconds > 0 ? `${seconds}s` : ""}`;
  }
  if (minutes > 0) {
    return `${minutes}min${seconds > 0 ? `${seconds}s` : ""}`;
  }
  return `${seconds}s`;
}

function formatTtft(durationMs: number): string {
  return `${(Math.max(0, durationMs) / 1000).toFixed(2)}s`;
}

function localDeckOutlineUrl(conversationId: string): string {
  return `/__local_slide_workspace/${encodeURIComponent(conversationId)}/deck/deck_outline.json`;
}

function useLocalDeckAvailable(conversationId: string | null, enabled: boolean) {
  const [availability, setAvailability] = useState<{ conversationId: string | null; available: boolean }>({
    conversationId: null,
    available: false,
  });

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const controller = new AbortController();

    void fetch(localDeckOutlineUrl(conversationId), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        setAvailability({ conversationId, available: response.ok });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setAvailability({ conversationId, available: false });
      });

    return () => controller.abort();
  }, [conversationId, enabled]);

  return Boolean(enabled && conversationId && availability.conversationId === conversationId && availability.available);
}

function MarkdownImage({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const openPreview = useImagePreviewStore((s) => s.open);
  return (
    <img
      src={src}
      alt={alt}
      onLoad={(e) => {
        const target = e.target as HTMLElement;
        target.classList.remove("opacity-0", "h-0");
        target.classList.add("opacity-100");
      }}
      onError={(e) => {
        (e.target as HTMLElement).style.display = "none";
      }}
      onClick={() => src && openPreview(src, alt)}
      className="rounded-lg max-w-full transition-opacity duration-300 opacity-0 h-0 cursor-zoom-in hover:opacity-90 active:scale-[0.99]"
      {...props}
    />
  );
}

const MARKDOWN_COMPONENTS = {
  pre({ children }: { children?: React.ReactNode }) {
    return <>{children}</>;
  },
  code({ className, children }: { className?: string; children?: React.ReactNode }) {
    const match = /language-(\w+)/.exec(className || "");
    const code = String(children).replace(/\n$/, "");
    if (match) {
      return <CodeBlock language={match[1]}>{code}</CodeBlock>;
    }
    return <code className={className}>{children}</code>;
  },
  img(props: React.ImgHTMLAttributes<HTMLImageElement>) {
    return <MarkdownImage {...props} />;
  },
  a({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
};

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  onHitlResume?: (action: "approve" | "modify", feedback?: string) => void;
  onEditResend?: (newQuery: string) => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
  animate?: boolean;
}

// ── Avatars ──
function AssistantAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center shrink-0">
      <svg className="w-3.5 h-3.5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({ message, isLast, onHitlResume, onEditResend, onRegenerate, isStreaming, animate = true }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);
  const conversationId = useConversationStore((s) => s.conversationId);
  const agentType = useConversationStore((s) => s.agentType);
  const openLocalPreview = useLocalSlidePreviewStore((s) => s.open);

  const canEdit = isUser && isLast && onEditResend && !isStreaming;
  const canRegenerate = !isUser && isLast && onRegenerate && !isStreaming;
  const slideOutlineBlock = !isUser
    ? [...message.blocks]
        .reverse()
        .find((block): block is { type: "SlideOutline"; data: SlideOutlineData } => block.type === "SlideOutline")
    : undefined;
  const shouldCheckLocalPreview = !isUser && !!isLast && !!conversationId;
  const hasLocalDeck = useLocalDeckAvailable(conversationId, shouldCheckLocalPreview);
  const shouldShowLocalPreview = shouldCheckLocalPreview && (agentType === "slide" || hasLocalDeck);
  const canOpenLocalPreview = shouldShowLocalPreview && !isStreaming && !!conversationId;

  const handleCopy = useCallback(() => {
    const text = message.blocks
      .filter((b): b is { type: "Message"; content: string } => b.type === "Message")
      .map((b) => b.content)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [message.blocks]);

  const handleStartEdit = () => {
    const text = message.blocks
      .filter((b): b is { type: "Message"; content: string } => b.type === "Message")
      .map((b) => b.content)
      .join("\n");
    setEditText(text);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && onEditResend) {
      onEditResend(trimmed);
      setEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditText("");
  };

  if (isUser) {
    return (
      <div className={`${animate ? "animate-message-in" : ""} group flex justify-end gap-2.5 mb-5`}>
        <div className="max-w-[70%]">
          <div className="bg-user-bubble text-text-primary rounded-2xl px-4 py-2.5">
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full min-w-[300px] rounded-lg border border-border bg-surface px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30"
                  rows={3}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editText.trim()}
                    className="rounded-lg bg-accent text-white px-3 py-1.5 text-xs font-medium
                               hover:bg-accent-hover active:scale-[0.97] disabled:opacity-40 transition-all"
                  >
                    Save & Resend
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-tertiary
                               hover:text-text-secondary hover:bg-surface-hover transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              message.blocks.map((block, i) => (
                <BlockRenderer key={i} block={block} />
              ))
            )}
          </div>
          {!editing && (
            <div className="flex justify-end mt-1 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
                title={copied ? "Copied!" : "Copy"}
              >
                {copied ? (
                  <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                )}
              </button>
              {canEdit && (
                <button
                  onClick={handleStartEdit}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
                  title="Edit"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        <UserAvatar />
      </div>
    );
  }

  return (
    <div className={`${animate ? "animate-message-in" : ""} group flex gap-2.5 mb-5`}>
      <AssistantAvatar />
      <div className="max-w-[85%] py-1 flex-1 min-w-0">
        {message.ttftMs != null && (
          <div className="mb-2 text-[11px] text-text-tertiary">
            TTFT {formatTtft(message.ttftMs)}
          </div>
        )}
        {message.nodes.length > 0 && <NodeSteps nodes={message.nodes} />}

        {(() => {
          const swarmToolCalls: ToolCallData[] = message.blocks
            .filter((b): b is { type: "ToolCallStart"; data: ToolCallData } =>
              b.type === "ToolCallStart" && SWARM_TOOL_NAMES.has(b.data.toolName))
            .map((b) => b.data);

          const nonSpawnBlocks = message.blocks.filter(
            (b) =>
              !(b.type === "ToolCallStart" && SWARM_TOOL_NAMES.has(b.data.toolName)) &&
              !(b.type === "ToolCallStart" && PLANNING_TOOL_NAMES.has(b.data.toolName)) &&
              b.type !== "TaskList",
          );

          // Precompute: has any tool_call appeared before index i?
          const toolSeenBefore: boolean[] = [];
          let seen = false;
          for (const block of message.blocks) {
            toolSeenBefore.push(seen);
            const isSwarm = block.type === "ToolCallStart" && SWARM_TOOL_NAMES.has(block.data.toolName);
            if (block.type === "ToolCallStart" || isSwarm) seen = true;
          }

          // Index of the first swarm tool block (render AgentSwarmPanel only once)
          const firstSwarmIdx = message.blocks.findIndex(
            (b) => b.type === "ToolCallStart" && SWARM_TOOL_NAMES.has(b.data.toolName),
          );

          const rendered = message.blocks.map((block, i) => {
            const isSwarm = block.type === "ToolCallStart" && SWARM_TOOL_NAMES.has(block.data.toolName);

            if (isSwarm) {
              if (i !== firstSwarmIdx) return null;
              return (
                <AgentSwarmPanel
                  key={`swarm-${i}`}
                  liveWorkers={message.workers}
                  spawnToolCalls={swarmToolCalls}
                />
              );
            }

            // Planning tools & cite_sources → filter out
            if (block.type === "ToolCallStart" && (PLANNING_TOOL_NAMES.has(block.data.toolName) || block.data.toolName === "cite_sources")) {
              return null;
            }

            // TaskList anchor → render TaskListPanel
            if (block.type === "TaskList") {
              return <TaskListPanel key={`tasklist-${i}`} />;
            }

            const idxInNonSpawn = nonSpawnBlocks.indexOf(block);
            const prevNonSpawn = idxInNonSpawn > 0 ? nonSpawnBlocks[idxInNonSpawn - 1] : undefined;
            const needsDivider =
              toolSeenBefore[i] &&
              block.type === "Message" &&
              prevNonSpawn != null &&
              prevNonSpawn.type !== "Message";
            const shouldAutoCollapse =
              (block.type === "Reasoning" || block.type === "ToolCallStart") &&
              nonSpawnBlocks.slice(idxInNonSpawn + 1).some((b) => b.type === "Message" || b.type === "ToolCallStart");
            return (
              <div key={i}>
                {needsDivider && (
                  <hr className="my-4 border-t border-border-light" />
                )}
                <BlockRenderer
                  block={block}
                  onHitlResume={onHitlResume}
                  isStreaming={isStreaming && isLast && !shouldAutoCollapse}
                  autoCollapse={shouldAutoCollapse}
                />
              </div>
            );
          });

          return (
            <>
              {rendered}
              {message.sources.length > 0 && <CitationSources sources={message.sources} />}
            </>
          );
        })()}

        {message.error && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-error-light rounded-xl text-xs">
            <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-error/10 flex items-center justify-center">
              <span className="text-error text-[10px]">!</span>
            </span>
            <div>
              <p className="font-medium text-error">{message.error.errorType}</p>
              <p className="text-text-secondary mt-0.5">{message.error.message}</p>
              {message.error.recoverable && (
                <span className="text-text-tertiary mt-1 inline-block">Recoverable</span>
              )}
            </div>
          </div>
        )}

        {shouldShowLocalPreview && (
          <button
            onClick={() => {
              if (!conversationId) return;
              openLocalPreview(conversationId, slideOutlineBlock?.data.outline ?? null);
            }}
            disabled={!canOpenLocalPreview}
            className="mt-4 flex w-full items-center justify-between rounded-2xl border border-teal-200/80 bg-gradient-to-r from-teal-50 to-cyan-50 px-4 py-3 text-left transition-colors hover:border-teal-300 hover:from-teal-100 hover:to-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">本地预览</p>
                <p className="truncate text-xs text-text-secondary">
                  {canOpenLocalPreview
                    ? "流式输出结束后可直接查看本地生成的整套 slides"
                    : isStreaming
                      ? "正在等待本地 slides 生成完成"
                      : hasLocalDeck
                        ? "本地 slides 已就绪，点击打开预览"
                        : "当前会话还没有落出本地 slides，点开后可继续检查生成结果"}
                </p>
              </div>
            </div>
            <svg className="h-4 w-4 shrink-0 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {message.agentDurationMs != null && (
          <div className="mt-4">
            <div className="border-t border-border-light" />
            <div className="pt-2 text-[11px] text-text-tertiary">
              <span>已处理 {formatNaturalDuration(message.agentDurationMs)}</span>
            </div>
          </div>
        )}

        {!isStreaming && (
          <div className="mt-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
              title={copied ? "Copied!" : "Copy"}
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              )}
            </button>
            {canRegenerate && (
              <button
                onClick={onRegenerate}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
                title="Regenerate"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const BlockRenderer = memo(function BlockRenderer({
  block,
  onHitlResume,
  isStreaming,
  autoCollapse,
}: {
  block: ContentBlock;
  onHitlResume?: (action: "approve" | "modify", feedback?: string) => void;
  isStreaming?: boolean;
  autoCollapse?: boolean;
}) {
  switch (block.type) {
    case "Message":
      return (
        <div className="prose-agent text-[14px] leading-[1.7] text-text-primary">
          <Markdown
            remarkPlugins={REMARK_PLUGINS}
            components={MARKDOWN_COMPONENTS}
          >{block.content}</Markdown>
        </div>
      );
    case "Reasoning":
      return <ReasoningBlock content={block.content} isStreaming={isStreaming} autoCollapse={autoCollapse} />;
    case "ToolCallStart":
      return (
        <div className="my-3">
          <ToolCallBlock {...block.data} autoCollapse={autoCollapse} />
        </div>
      );
    case "human_review":
      return (
        <HumanReviewBlock
          data={block.data}
          onResume={onHitlResume}
          disabled={isStreaming}
        />
      );
    case "TaskList":
      return <TaskListPanel />;
    case "ContextCompacting":
      return <ContextCompactingBlock done={block.done || !isStreaming} />;
    case "MemoryUpdate":
      return <MemoryUpdateBlock data={block.data} />;
    case "SlideOutline":
      return <SlideOutlineBlock data={block.data} />;
    case "SlideDesignSystem":
      return <SlideDesignSystemBlock data={block.data} />;
  }
});

// ── Reasoning block with smooth transition ──
const AUTO_COLLAPSE_DELAY = 2000;

function ReasoningBlock({ content, isStreaming, autoCollapse }: { content: string; isStreaming?: boolean; autoCollapse?: boolean }) {
  const [userToggled, setUserToggled] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [delayCollapsed, setDelayCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // Auto-open is derived: open while streaming, unless delay-collapsed
  const autoOpen = !delayCollapsed && !!isStreaming;
  const open = userToggled ? manualOpen : autoOpen;

  useEffect(() => {
    if (userToggled || !autoCollapse) return;
    const timer = setTimeout(() => setDelayCollapsed(true), AUTO_COLLAPSE_DELAY);
    return () => clearTimeout(timer);
  }, [autoCollapse, userToggled]);

  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height);
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const handleToggle = () => {
    setUserToggled(true);
    setManualOpen(!open);
  };

  return (
    <div className="mb-2">
      <button
        onClick={handleToggle}
        className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        {isStreaming ? "Thinking..." : "Thought"}
      </button>
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: open ? `${height + 16}px` : "0px", opacity: open ? 1 : 0 }}
      >
        <div ref={contentRef} className="mt-1.5 pl-4 border-l-2 border-border-light prose-reasoning text-xs text-text-secondary leading-relaxed break-words overflow-hidden">
          <Markdown remarkPlugins={[remarkGfm, remarkCjkFriendly]}>{content.replace(/\\n/g, "\n")}</Markdown>
        </div>
      </div>
    </div>
  );
}

// ── Context compacting indicator ──

function ContextCompactingBlock({ done }: { done: boolean }) {
  return (
    <div className="my-3 flex items-center gap-2 text-[11px] text-text-tertiary">
      <div className="h-px flex-1 bg-border-light" />
      <div className="flex items-center gap-1.5 px-2">
        <svg className={`w-3 h-3 text-amber-400 ${done ? "" : "animate-spin"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
        </svg>
        <span>{done ? "Context compacted" : "Compacting context..."}</span>
      </div>
      <div className="h-px flex-1 bg-border-light" />
    </div>
  );
}

// ── Memory update indicator ──

const MEMORY_FIELD_LABEL: Record<string, string> = {
  soul: "Soul",
  identity: "Identity",
};

function MemoryUpdateBlock({ data }: { data: MemoryUpdateData }) {
  const [open, setOpen] = useState(false);
  const label = MEMORY_FIELD_LABEL[data.field] ?? data.field;

  return (
    <div className="my-3">
      <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
        <div className="h-px flex-1 bg-border-light" />
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2 hover:text-text-secondary transition-colors"
        >
          <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
          <span>{label} memory updated</span>
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        <div className="h-px flex-1 bg-border-light" />
      </div>
      {open && (
        <div className="mt-2 pl-4 border-l-2 border-violet-300 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
          {data.content}
        </div>
      )}
    </div>
  );
}

// ── Review type display config ──
const REVIEW_TYPE_CONFIG: Record<string, { title: string; description: string }> = {
  research_plan: { title: "Research Plan", description: "Review the proposed tasks before execution" },
  prompt_enhancement: { title: "Prompt Enhancement", description: "Review the enhanced prompt before generation" },
  material_supplement: { title: "Material Confirmation", description: "Confirm materials to use for generation" },
  batch_generation_plan: { title: "Generation Plan", description: "Review the batch generation plan" },
};

function HumanReviewBlock({
  data,
  onResume,
  disabled,
}: {
  data: HumanReviewData;
  onResume?: (action: "approve" | "modify", feedback?: string) => void;
  disabled?: boolean;
}) {
  const reviewType = data.payload.review_type as string | undefined;
  const reviewData = data.payload.data as Record<string, unknown> | undefined;
  const timeoutSeconds = data.payload.timeout_seconds as number | undefined;
  const defaultAction = (data.payload.default_action as string) ?? "approve";
  const config = REVIEW_TYPE_CONFIG[reviewType ?? ""] ?? {
    title: "Review Required",
    description: "The agent is waiting for your decision",
  };

  return (
    <div className="my-3 rounded-xl border border-warning/30 bg-warning-light/50 p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
            <span className="text-warning text-xs font-bold">?</span>
          </div>
          <div>
            <span className="text-sm font-semibold text-text-primary">{config.title}</span>
            <p className="text-[11px] text-text-tertiary mt-0.5">{config.description}</p>
          </div>
        </div>
        {timeoutSeconds && !data.resolved && (
          <CountdownBadge seconds={timeoutSeconds} defaultAction={defaultAction} onTimeout={() => onResume?.(defaultAction as "approve")} />
        )}
      </div>

      {/* Review content */}
      {reviewData && (
        <div className="mb-3">
          <ReviewDataDisplay reviewType={reviewType} data={reviewData} />
        </div>
      )}

      {/* Raw payload fallback */}
      {!reviewData && (
        <details>
          <summary className="cursor-pointer text-xs font-medium text-text-secondary hover:text-text-primary transition-colors">
            Raw payload
          </summary>
          <pre className="mt-2 text-xs bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap
                          border border-border-light font-mono text-text-secondary leading-relaxed">
            {JSON.stringify(data.payload, null, 2)}
          </pre>
        </details>
      )}

      {/* Actions */}
      {data.resolved ? (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-success font-medium">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Resolved
        </div>
      ) : (
        onResume && (
          <div className="mt-4 space-y-3">
            <button
              onClick={() => onResume("approve")}
              disabled={disabled}
              className="rounded-lg bg-success text-white px-4 py-1.5 text-xs font-medium
                         hover:bg-success/90 active:scale-[0.97] disabled:opacity-40 transition-all"
            >
              Approve
            </button>
            <p className="text-[11px] text-text-tertiary">
              Or type in the chat input to provide feedback
            </p>
          </div>
        )
      )}
    </div>
  );
}

// ── Review data renderer ──

// ── Review data renderers (registry pattern) ──

type ReviewRenderer = (data: Record<string, unknown>) => React.ReactNode;

interface ReviewTask {
  id: number;
  title: string;
  description: string;
  status: string;
  depends_on: number[];
}

function ResearchPlanRenderer(data: Record<string, unknown>) {
  if (!Array.isArray(data.tasks)) return null;
  const tasks = data.tasks as ReviewTask[];
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="rounded-lg bg-surface border border-border-light p-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-tertiary bg-surface-hover px-1.5 py-0.5 rounded">
              #{task.id}
            </span>
            <span className="text-sm font-medium text-text-primary">{task.title}</span>
          </div>
          {task.description && (
            <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">{task.description}</p>
          )}
          {task.depends_on.length > 0 && (
            <p className="text-[10px] text-text-tertiary mt-1.5">
              Depends on: {task.depends_on.map((d) => `#${d}`).join(", ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function PromptEnhancementRenderer(data: Record<string, unknown>) {
  const original = (data.original_prompt as string) ?? "";
  const enhanced = (data.enhanced_prompt as string) ?? "";
  const mediaType = (data.media_type as string) ?? "image";
  const style = (data.style as string) ?? "";
  const message = (data.message as string) ?? "";

  return (
    <div className="space-y-3">
      {message && (
        <p className="text-xs text-text-secondary leading-relaxed">{message}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface border border-border-light p-3">
          <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Original</div>
          <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{original}</p>
        </div>
        <div className="rounded-lg bg-accent/5 border border-accent/20 p-3">
          <div className="text-[10px] font-medium text-accent uppercase tracking-wide mb-1.5">Enhanced</div>
          <p className="text-xs text-text-primary leading-relaxed whitespace-pre-wrap">{enhanced}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {mediaType && (
          <span className="text-[10px] font-medium text-text-tertiary bg-surface-hover px-1.5 py-0.5 rounded">
            {mediaType}
          </span>
        )}
        {style && (
          <span className="text-[10px] font-medium text-text-tertiary bg-surface-hover px-1.5 py-0.5 rounded">
            {style.startsWith("custom:") ? style.slice(7) : style}
          </span>
        )}
      </div>
    </div>
  );
}

interface MaterialCandidate {
  url: string;
  source: string;
  desc?: string;
}

function MaterialSupplementRenderer(data: Record<string, unknown>) {
  const missing = (data.missing_materials as string[]) ?? [];
  const candidates = (data.candidates as MaterialCandidate[]) ?? [];
  const actions = (data.suggested_actions as string[]) ?? [];
  const message = (data.message as string) ?? "";

  return (
    <div className="space-y-3">
      {message && (
        <p className="text-xs text-text-secondary leading-relaxed">{message}</p>
      )}
      {missing.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Missing materials</div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m, i) => (
              <span key={i} className="text-[11px] text-warning bg-warning/10 px-2 py-0.5 rounded-full">{m}</span>
            ))}
          </div>
        </div>
      )}
      {candidates.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Candidates</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {candidates.map((c, i) => (
              <div key={i} className="rounded-lg border border-border-light overflow-hidden bg-surface">
                <img src={c.url} alt={c.desc ?? ""} className="w-full h-24 object-cover" loading="lazy" />
                <div className="px-2 py-1.5">
                  {c.desc && <p className="text-[11px] text-text-secondary truncate">{c.desc}</p>}
                  <span className="text-[10px] font-medium text-text-tertiary bg-surface-hover px-1 py-0.5 rounded">
                    {c.source}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {actions.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wide mb-1.5">Suggestions</div>
          <ul className="space-y-1">
            {actions.map((a, i) => (
              <li key={i} className="text-xs text-text-secondary flex items-start gap-1.5">
                <span className="text-text-tertiary mt-0.5 shrink-0">&#x2022;</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface BatchPlanItem {
  title: string;
  prompt: string;
  ratio?: string;
  style?: string;
  model_code?: string | null;
  num_images?: number;
  images?: string[];
}

function BatchGenerationPlanRenderer(data: Record<string, unknown>) {
  const items = (data.items as BatchPlanItem[]) ?? [];
  const sharedStyle = (data.shared_style as string) ?? "";
  const totalCount = (data.total_count as number) ?? items.length;
  const message = (data.message as string) ?? "";

  return (
    <div className="space-y-3">
      {message && (
        <p className="text-xs text-text-secondary leading-relaxed">{message}</p>
      )}
      <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
        <span>{totalCount} images</span>
        {sharedStyle && (
          <>
            <span className="text-border-light">|</span>
            <span>{sharedStyle}</span>
          </>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg bg-surface border border-border-light p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-mono text-text-tertiary bg-surface-hover px-1.5 py-0.5 rounded">
                #{i + 1}
              </span>
              <span className="text-sm font-medium text-text-primary">{item.title}</span>
              {item.ratio && (
                <span className="text-[10px] text-text-tertiary bg-surface-hover px-1 py-0.5 rounded ml-auto">
                  {item.ratio}
                </span>
              )}
            </div>
            <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">{item.prompt}</p>
            {item.images && item.images.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {item.images.map((url, j) => (
                  <img key={j} src={url} alt="" className="w-12 h-12 rounded object-cover border border-border-light" loading="lazy" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const REVIEW_RENDERERS: Record<string, ReviewRenderer> = {
  research_plan: ResearchPlanRenderer,
  prompt_enhancement: PromptEnhancementRenderer,
  material_supplement: MaterialSupplementRenderer,
  batch_generation_plan: BatchGenerationPlanRenderer,
};

function ReviewDataDisplay({ reviewType, data }: { reviewType?: string; data: Record<string, unknown> }) {
  const renderer = reviewType ? REVIEW_RENDERERS[reviewType] : undefined;
  const content = renderer?.(data);
  if (content) return <>{content}</>;

  return (
    <pre className="text-xs bg-surface rounded-lg p-3 overflow-x-auto whitespace-pre-wrap
                    border border-border-light font-mono text-text-secondary leading-relaxed">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

// ── Slide outline preview ──

interface SlideEntry {
  slide_id: string;
  index: number;
  title: string;
  role: string;
  desc?: string;
}

function SlideOutlineBlock({ data }: { data: SlideOutlineData }) {
  const outline = data.outline;
  const title = (outline.deck_title as string) ?? "Untitled Deck";
  const goal = (outline.deck_goal as string) ?? "";
  const slides = (outline.slides as SlideEntry[]) ?? [];

  const ROLE_COLORS: Record<string, string> = {
    cover: "bg-indigo-100 text-indigo-700",
    toc: "bg-sky-100 text-sky-700",
    content: "bg-emerald-100 text-emerald-700",
    divider: "bg-amber-100 text-amber-700",
    summary: "bg-violet-100 text-violet-700",
    end: "bg-rose-100 text-rose-700",
  };

  return (
    <div className="my-3 rounded-xl border border-teal-200/60 bg-teal-50/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-teal-500/20 flex items-center justify-center shrink-0">
            <svg className="w-3 h-3 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-text-primary">{title}</span>
            <span className="text-[11px] text-text-tertiary ml-2">{slides.length} pages</span>
          </div>
        </div>
      </div>
      {goal && (
        <p className="text-xs text-text-secondary mb-3 leading-relaxed">{goal}</p>
      )}
      <div className="space-y-1.5">
        {slides.map((slide) => (
          <div
            key={slide.slide_id}
            className="flex w-full items-center gap-2 rounded-lg bg-surface/60 px-3 py-2 text-left"
          >
            <span className="text-[10px] font-mono text-text-tertiary w-5 text-right shrink-0">
              {slide.index}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[slide.role] ?? "bg-gray-100 text-gray-600"}`}>
              {slide.role}
            </span>
            <span className="text-xs text-text-primary truncate">{slide.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Slide design system summary ──

function SlideDesignSystemBlock({ data }: { data: SlideDesignSystemData }) {
  return (
    <div className="my-3 rounded-xl border border-violet-200/60 bg-violet-50/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded-md bg-violet-500/20 flex items-center justify-center shrink-0">
          <svg className="w-3 h-3 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-text-primary">Design System</span>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">{data.summary}</p>
    </div>
  );
}

// ── Countdown badge ──
function CountdownBadge({ seconds, defaultAction, onTimeout }: {
  seconds: number;
  defaultAction: string;
  onTimeout: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onTimeoutRef.current = onTimeout; });

  useEffect(() => {
    if (remaining <= 0) { onTimeoutRef.current(); return; }
    const timer = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <span className="text-[10px] font-mono text-warning bg-warning/10 px-2 py-0.5 rounded-full shrink-0">
      {mins}:{secs.toString().padStart(2, "0")} → {defaultAction}
    </span>
  );
}
