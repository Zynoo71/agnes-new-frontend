import { useState, useEffect, useRef, useCallback } from "react";
import Markdown from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import type { Message, ContentBlock, HumanReviewData } from "@/stores/conversationStore";
import { ToolCallBlock } from "./ToolRenderer/ToolCallBlock";
import { CodeBlock } from "./CodeBlock";
import { NodeSteps } from "./NodeSteps";

interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  onHitlResume?: (action: "approve" | "modify", feedback?: string) => void;
  onEditResend?: (newQuery: string) => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
}

// ── Avatars ──
function AssistantAvatar() {
  return (
    <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
      <span className="text-white text-[11px] font-bold">A</span>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="w-7 h-7 rounded-full bg-border flex items-center justify-center shrink-0">
      <span className="text-text-secondary text-[11px] font-bold">U</span>
    </div>
  );
}

export function MessageBubble({ message, isLast, onHitlResume, onEditResend, onRegenerate, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);

  const canEdit = isUser && isLast && onEditResend && !isStreaming;
  const canRegenerate = !isUser && isLast && onRegenerate && !isStreaming;

  const handleCopy = useCallback(() => {
    const text = message.blocks
      .filter((b): b is { type: "text"; content: string } => b.type === "text")
      .map((b) => b.content)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [message.blocks]);

  const handleStartEdit = () => {
    const text = message.blocks
      .filter((b): b is { type: "text"; content: string } => b.type === "text")
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
      <div className="animate-message-in group flex justify-end gap-2.5 mb-5">
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
    <div className="animate-message-in group flex gap-2.5 mb-5">
      <AssistantAvatar />
      <div className="max-w-[85%] py-1 flex-1 min-w-0">
        {message.nodes.length > 0 && <NodeSteps nodes={message.nodes} />}

        {message.reasoningContent && (
          <ReasoningBlock content={message.reasoningContent} isStreaming={isStreaming && isLast} />
        )}

        {message.blocks.map((block, i) => (
          <BlockRenderer
            key={i}
            block={block}
            onHitlResume={onHitlResume}
            isStreaming={isStreaming}
          />
        ))}

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
}

function BlockRenderer({
  block,
  onHitlResume,
  isStreaming,
}: {
  block: ContentBlock;
  onHitlResume?: (action: "approve" | "modify", feedback?: string) => void;
  isStreaming?: boolean;
}) {
  switch (block.type) {
    case "text":
      return (
        <div className="prose-agent text-[14px] leading-[1.7] text-text-primary">
          <Markdown
            remarkPlugins={[remarkCjkFriendly]}
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
            }}
          >{block.content}</Markdown>
        </div>
      );
    case "tool_call":
      return (
        <div className="my-3">
          <ToolCallBlock {...block.data} />
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
  }
}

// ── Reasoning block with smooth transition ──
function ReasoningBlock({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [open, setOpen] = useState(!!isStreaming);
  const [userToggled, setUserToggled] = useState(false);

  useEffect(() => {
    if (userToggled) return;
    setOpen(!!isStreaming);
  }, [isStreaming, userToggled]);

  const handleToggle = () => {
    setUserToggled(true);
    setOpen(!open);
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
        style={{ maxHeight: open ? "500px" : "0px", opacity: open ? 1 : 0 }}
      >
        <div className="mt-1.5 pl-4 border-l-2 border-border-light text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
}

// ── Review type display config ──
const REVIEW_TYPE_CONFIG: Record<string, { title: string; description: string }> = {
  plan: { title: "Plan Review", description: "Review the proposed research plan before execution" },
  clarification: { title: "Clarification Needed", description: "The agent needs more information to proceed" },
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
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

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
            {/* Feedback input for modify */}
            {showFeedback && (
              <div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Enter your feedback or modifications..."
                  rows={3}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30
                             placeholder:text-text-tertiary"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { if (feedback.trim()) onResume("modify", feedback.trim()); }}
                    disabled={disabled || !feedback.trim()}
                    className="rounded-lg bg-accent text-white px-3.5 py-1.5 text-xs font-medium
                               hover:bg-accent-hover active:scale-[0.97] disabled:opacity-40 transition-all"
                  >
                    Send Feedback
                  </button>
                  <button
                    onClick={() => { setShowFeedback(false); setFeedback(""); }}
                    className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-text-tertiary
                               hover:text-text-secondary hover:bg-surface-hover transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {!showFeedback && (
              <div className="flex gap-2">
                <button
                  onClick={() => onResume("approve")}
                  disabled={disabled}
                  className="rounded-lg bg-success text-white px-4 py-1.5 text-xs font-medium
                             hover:bg-success/90 active:scale-[0.97] disabled:opacity-40 transition-all"
                >
                  Approve
                </button>
                <button
                  onClick={() => setShowFeedback(true)}
                  disabled={disabled}
                  className="rounded-lg bg-surface border border-border text-text-primary px-4 py-1.5 text-xs font-medium
                             hover:bg-surface-hover active:scale-[0.97] disabled:opacity-40 transition-all"
                >
                  Modify
                </button>
              </div>
            )}

            <p className="text-[11px] text-text-tertiary">
              You can also type directly in the chat input to provide feedback
            </p>
          </div>
        )
      )}
    </div>
  );
}

// ── Review data renderer ──
function ReviewDataDisplay({ reviewType, data }: { reviewType?: string; data: Record<string, unknown> }) {
  if (reviewType === "plan" && data.plan) {
    const plan = data.plan as string[];
    return (
      <div className="space-y-1.5">
        {(Array.isArray(plan) ? plan : [plan]).map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <span className="text-text-tertiary text-xs mt-0.5 shrink-0 w-5 text-right">{i + 1}.</span>
            <span className="text-text-primary">{String(item)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (reviewType === "clarification" && data.question) {
    const originalQuery = data.original_query as string | undefined;
    return (
      <div className="rounded-lg bg-surface border border-border-light p-3">
        <p className="text-sm text-text-primary">{String(data.question)}</p>
        {originalQuery && (
          <p className="text-xs text-text-tertiary mt-2">
            Original query: <span className="text-text-secondary">{originalQuery}</span>
          </p>
        )}
      </div>
    );
  }

  // Fallback: JSON
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
  onTimeoutRef.current = onTimeout;

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
