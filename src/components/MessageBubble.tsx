import { useState, useEffect, useRef, useCallback, memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkCjkFriendly from "remark-cjk-friendly";
import type { Message, ContentBlock, HumanReviewData, ToolCallData } from "@/stores/conversationStore";
import { PLANNING_TOOL_NAMES } from "@/stores/conversationStore";
import { ToolCallBlock } from "./ToolRenderer/ToolCallBlock";
import { AgentSwarmPanel } from "./AgentSwarmPanel";
import { TaskListPanel } from "./TaskListPanel";
import { CodeBlock } from "./CodeBlock";
import { NodeSteps } from "./NodeSteps";
import { CitationSources, type CitationSource } from "./CitationSources";

// ── Citation helpers ──

const SOURCE_TOOL_NAMES = new Set(["web_search", "image_search"]);

/** Extract ref→source mapping from tool results within a message. */
function extractSources(blocks: ContentBlock[]): CitationSource[] {
  const seen = new Set<number>();
  const sources: CitationSource[] = [];
  for (const block of blocks) {
    if (block.type !== "ToolCallStart") continue;
    if (!SOURCE_TOOL_NAMES.has(block.data.toolName)) continue;
    const results = block.data.toolResult?.results;
    if (!Array.isArray(results)) continue;
    for (const r of results as Record<string, unknown>[]) {
      const ref = r.ref as number | undefined;
      if (ref == null || seen.has(ref)) continue;
      seen.add(ref);
      sources.push({
        ref,
        url: (r.url as string) ?? "",
        title: (r.title as string) ?? "",
        snippet: (r.snippet as string) ?? undefined,
        toolName: block.data.toolName,
      });
    }
  }
  return sources.sort((a, b) => a.ref - b.ref);
}

/** Build lookup maps from sources. */
function buildSourceMaps(sources: CitationSource[]) {
  const webRefs = new Set<number>();
  const imgRefs = new Map<number, CitationSource>();
  for (const s of sources) {
    if (s.toolName === "image_search") {
      imgRefs.set(s.ref, s);
    } else {
      webRefs.add(s.ref);
    }
  }
  return { webRefs, imgRefs };
}

/**
 * Preprocess markdown:
 * - image_search refs [N] → inline image ![title](url)
 * - web_search refs [N] → move to end of line as citation pill
 */
function injectCitations(
  text: string,
  webRefs: Set<number>,
  imgRefs: Map<number, CitationSource>,
): string {
  if (webRefs.size === 0 && imgRefs.size === 0) return text;

  return text.split("\n").map((line) => {
    const collectedWeb: number[] = [];

    const processed = line.replace(/\[(\d+)\](?:\s*\[(\d+)\])*/g, (match) => {
      const nums: number[] = [];
      for (const m of match.matchAll(/\[(\d+)\]/g)) {
        nums.push(Number(m[1]));
      }

      // Check if any are image refs — render inline images
      const images: string[] = [];
      const webs: number[] = [];
      for (const n of nums) {
        const img = imgRefs.get(n);
        if (img) {
          images.push(`![${img.title}](${img.url})`);
        } else if (webRefs.has(n)) {
          webs.push(n);
        }
      }

      if (images.length === 0 && webs.length === 0) return match; // unknown refs

      // Collect web refs for end-of-line
      collectedWeb.push(...webs);

      // Return inline images (or empty if only web refs)
      return images.length > 0 ? "\n" + images.join("\n") + "\n" : "";
    });

    if (collectedWeb.length === 0) return processed;

    // Deduplicate web refs and build pill link
    const allRefs = [...new Set(collectedWeb)];
    const label = allRefs.length === 1 ? `${allRefs[0]}` : `${allRefs[0]}+${allRefs.length - 1}`;
    const link = `[${label}](#cite-${allRefs.join(",")})`;

    return processed.replace(/\s{2,}/g, " ").trimEnd() + " " + link;
  }).join("\n");
}

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

  const canEdit = isUser && isLast && onEditResend && !isStreaming;
  const canRegenerate = !isUser && isLast && onRegenerate && !isStreaming;

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
          {canEdit && !editing && (
            <div className="flex justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleStartEdit}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
                title="Edit"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                </svg>
              </button>
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
        {message.nodes.length > 0 && <NodeSteps nodes={message.nodes} />}

        {(() => {
          const sources = extractSources(message.blocks);
          const { webRefs, imgRefs } = buildSourceMaps(sources);

          const spawnToolCalls: ToolCallData[] = message.blocks
            .filter((b): b is { type: "ToolCallStart"; data: ToolCallData } =>
              b.type === "ToolCallStart" && b.data.toolName === "spawn_worker")
            .map((b) => b.data);

          const nonSpawnBlocks = message.blocks.filter(
            (b) =>
              !(b.type === "ToolCallStart" && b.data.toolName === "spawn_worker") &&
              !(b.type === "ToolCallStart" && PLANNING_TOOL_NAMES.has(b.data.toolName)) &&
              b.type !== "TaskList",
          );

          // Precompute: has any tool_call appeared before index i?
          const toolSeenBefore: boolean[] = [];
          let seen = false;
          for (const block of message.blocks) {
            toolSeenBefore.push(seen);
            const isSpawn = block.type === "ToolCallStart" && block.data.toolName === "spawn_worker";
            if (block.type === "ToolCallStart" || isSpawn) seen = true;
          }

          // Index of the first spawn_worker block (render AgentSwarmPanel only once)
          const firstSpawnIdx = message.blocks.findIndex(
            (b) => b.type === "ToolCallStart" && b.data.toolName === "spawn_worker",
          );

          const rendered = message.blocks.map((block, i) => {
            const isSpawn = block.type === "ToolCallStart" && block.data.toolName === "spawn_worker";

            if (isSpawn) {
              if (i !== firstSpawnIdx) return null;
              return (
                <AgentSwarmPanel
                  key={`swarm-${i}`}
                  liveWorkers={message.workers}
                  spawnToolCalls={spawnToolCalls}
                />
              );
            }

            // Planning tools → filter out (data stays in blocks, just not rendered)
            if (block.type === "ToolCallStart" && PLANNING_TOOL_NAMES.has(block.data.toolName)) {
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
                  citationWebRefs={webRefs}
                  citationImgRefs={imgRefs}
                  citationSources={sources}
                />
              </div>
            );
          });

          // Only show web_search sources that were actually cited in the message text
          const citedRefs = new Set<number>();
          for (const block of message.blocks) {
            if (block.type !== "Message") continue;
            for (const m of block.content.matchAll(/\[(\d+)\]/g)) {
              const n = Number(m[1]);
              if (webRefs.has(n)) citedRefs.add(n);
            }
          }
          const citedSources = sources.filter((s) => s.toolName === "web_search" && citedRefs.has(s.ref));

          return (
            <>
              {rendered}
              {citedSources.length > 0 && <CitationSources sources={citedSources} />}
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

/** Extract short main domain from URL. e.g. m.haikou.bendibao.com → bendibao.com */
function shortDomain(url: string): string {
  try {
    const parts = new URL(url).hostname.split(".");
    // Take last 2 parts (handles most domains)
    return parts.length > 2 ? parts.slice(-2).join(".") : parts.join(".");
  } catch {
    return url;
  }
}

/** Google favicon service URL. */
function faviconUrl(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
  } catch {
    return "";
  }
}

/** Inline citation badge — pill with domain name, hover shows detail popover. */
function CitationBadge({ refs, sources }: { refs: number[]; sources: CitationSource[] }) {
  const matched = refs
    .map((r) => sources.find((s) => s.ref === r))
    .filter(Boolean) as CitationSource[];
  if (matched.length === 0) return null;

  const first = matched[0];
  const extra = matched.length - 1;
  const domainName = shortDomain(first.url);

  return (
    <span className="cite-wrapper">
      <span className="cite-badge">
        {domainName}{extra > 0 && <span className="cite-extra">+{extra}</span>}
      </span>
      <span className="cite-popover">
        <span className="cite-popover-inner">
          {matched.map((s) => (
            <a
              key={s.ref}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="cite-popover-item"
            >
              <span className="cite-popover-header">
                <img
                  src={faviconUrl(s.url)}
                  alt=""
                  className="w-4 h-4 rounded-sm shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <span className="cite-popover-domain">{shortDomain(s.url)}</span>
              </span>
              {s.title && (
                <span className="cite-popover-title">{s.title}</span>
              )}
              {s.snippet && (
                <span className="cite-popover-snippet">{s.snippet}</span>
              )}
            </a>
          ))}
        </span>
      </span>
    </span>
  );
}

function BlockRenderer({
  block,
  onHitlResume,
  isStreaming,
  autoCollapse,
  citationWebRefs,
  citationImgRefs,
  citationSources,
}: {
  block: ContentBlock;
  onHitlResume?: (action: "approve" | "modify", feedback?: string) => void;
  isStreaming?: boolean;
  autoCollapse?: boolean;
  citationWebRefs?: Set<number>;
  citationImgRefs?: Map<number, CitationSource>;
  citationSources?: CitationSource[];
}) {
  switch (block.type) {
    case "Message": {
      const webRefs = citationWebRefs ?? new Set<number>();
      const imgRefs = citationImgRefs ?? new Map<number, CitationSource>();
      const sources = citationSources ?? [];
      const processed = injectCitations(block.content, webRefs, imgRefs);
      return (
        <div className="prose-agent text-[14px] leading-[1.7] text-text-primary">
          <Markdown
            remarkPlugins={[remarkGfm, remarkCjkFriendly]}
            components={{
              pre({ children }) {
                return <>{children}</>;
              },
              code({ className, children }) {
                const match = /language-(\w+)/.exec(className || "");
                const code = String(children).replace(/\n$/, "");
                if (match) {
                  return <CodeBlock language={match[1]}>{code}</CodeBlock>;
                }
                return <code className={className}>{children}</code>;
              },
              img({ src, alt, ...props }) {
                return (
                  <img
                    src={src}
                    alt={alt}
                    onLoad={(e) => { (e.target as HTMLElement).classList.remove("opacity-0", "h-0"); (e.target as HTMLElement).classList.add("opacity-100"); }}
                    onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                    className="rounded-lg max-w-full transition-opacity duration-300 opacity-0 h-0"
                    {...props}
                  />
                );
              },
              a({ href, children, ...props }) {
                if (href?.startsWith("#cite-")) {
                  const nums = href.slice(6).split(",").map(Number).filter((n) => !isNaN(n));
                  if (nums.length > 0) {
                    return <CitationBadge refs={nums} sources={sources} />;
                  }
                }
                return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
              },
            }}
          >{processed}</Markdown>
        </div>
      );
    }
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
  }
}

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

// ── Review type display config ──
const REVIEW_TYPE_CONFIG: Record<string, { title: string; description: string }> = {
  research_plan: { title: "Research Plan", description: "Review the proposed tasks before execution" },
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

const REVIEW_RENDERERS: Record<string, ReviewRenderer> = {
  research_plan: ResearchPlanRenderer,
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
