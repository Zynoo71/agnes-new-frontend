import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useChat } from "@/hooks/useChat";
import { useHealthCheck, type HealthInfo } from "@/hooks/useHealthCheck";
import { MessageBubble } from "@/components/MessageBubble";
import { EventStream } from "@/components/EventStream";

const AGENT_TYPES = ["super", "search", "research", "pixa"] as const;

const HEALTH_CONFIG = {
  ok: { dot: "bg-green-500", color: "#22c55e", label: "Connected" },
  error: { dot: "bg-red-500", color: "#ef4444", label: "Disconnected" },
  checking: { dot: "bg-yellow-500", color: "#eab308", label: "Connecting" },
} as const;

function HealthBadge({ info }: { info: HealthInfo }) {
  const c = HEALTH_CONFIG[info.status];
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
        info.status === "ok"
          ? "bg-green-50 text-green-700"
          : info.status === "error"
            ? "bg-red-50 text-red-700"
            : "bg-yellow-50 text-yellow-700"
      }`}
      title={info.latencyMs != null ? `Latency: ${info.latencyMs}ms` : c.label}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 health-dot ${c.dot}`}
        style={{ "--breathing-color": c.color } as React.CSSProperties}
      />
      <span>{c.label}</span>
      {info.latencyMs != null && (
        <span className="font-mono opacity-60">{info.latencyMs}ms</span>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "Search the latest AI news",
  "Summarize a research paper",
  "Help me draft an email",
];

export function ChatPanel() {
  const { conversationId, agentType, messages, rawEvents, isStreaming, error, setAgentType } =
    useConversationStore();
  const { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream } = useChat();
  const [showEvents, setShowEvents] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isNearBottomRef = useRef(true);

  const health = useHealthCheck();

  const hasPendingReview = messages.some(
    (m) => m.blocks.some((b) => b.type === "human_review" && !b.data.resolved)
  );

  const isEmpty = messages.length === 0;

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    if (isStreaming) {
      // During streaming: instant scroll to avoid animation stacking
      el.scrollTop = el.scrollHeight;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 100;
    setShowScrollBtn(distanceFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSend = async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    if (!conversationId) {
      await createConversation();
    }
    if (hasPendingReview) {
      hitlResume("modify", trimmed);
    } else {
      sendMessage(trimmed);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasInput = input.trim().length > 0;

  const inputArea = (
    <div className={`relative rounded-[20px] border border-border bg-surface shadow-sm
                    focus-within:shadow-md focus-within:border-border transition-shadow
                    ${isEmpty ? "max-w-xl w-full" : ""}`}>
      <div className="flex items-end">
        <button
          className="p-3 pb-3.5 text-text-tertiary opacity-40 cursor-not-allowed"
          title="Attachments (coming soon)"
          disabled
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
          </svg>
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={hasPendingReview ? "Type feedback to modify..." : "Ask Agnes anything..."}
          rows={1}
          className="flex-1 resize-none bg-transparent py-3.5 pr-14 text-sm
                     focus:outline-none disabled:opacity-40 placeholder:text-text-tertiary"
        />
      </div>
      {isStreaming ? (
        <button
          onClick={cancelStream}
          className="absolute right-2.5 bottom-2.5 rounded-xl bg-error text-white p-2
                     hover:bg-error/80 active:scale-95 transition-all"
          title="Stop generating"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>
      ) : (
        <button
          onClick={() => handleSend()}
          disabled={!hasInput}
          className={`absolute right-2.5 bottom-2.5 rounded-xl p-2 active:scale-95 transition-all
            ${hasInput
              ? "bg-accent text-white hover:bg-accent-hover"
              : "bg-text-tertiary/20 text-text-tertiary/50"
            }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col">
        {/* Top controls */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-light bg-surface-alt">
          <HealthBadge info={health} />

          {conversationId && (
            <code className="text-[11px] text-text-tertiary bg-surface-hover px-2 py-0.5 rounded-md">
              #{conversationId.toString()}
            </code>
          )}

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center bg-surface-hover rounded-lg p-0.5">
              {AGENT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setAgentType(t)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all capitalize ${
                    agentType === t
                      ? "bg-surface text-text-primary shadow-sm"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowEvents(!showEvents)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                showEvents
                  ? "bg-accent/10 text-accent"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              Events{rawEvents.length > 0 ? ` (${rawEvents.length})` : ""}
            </button>
          </div>
        </div>

        {/* Messages or Welcome */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto relative"
        >
          <div className="max-w-2xl mx-auto px-5 py-8">
            {isEmpty ? (
              <div className="flex flex-col items-center justify-center pt-24 text-center">
                <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
                  <span className="text-white text-xl font-bold">A</span>
                </div>
                <h2 className="text-xl font-semibold text-text-primary mb-1">Hi, how can I help?</h2>
                <p className="text-sm text-text-tertiary mb-6">Ask me anything or try a suggestion below</p>

                <div className="flex flex-wrap gap-2 justify-center mb-8 max-w-md">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSend(s)}
                      disabled={isStreaming}
                      className="text-xs px-4 py-2 bg-surface border border-border rounded-full text-text-secondary
                                 hover:bg-surface-hover hover:text-text-primary hover:border-border
                                 disabled:opacity-40 transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {inputArea}

                <p className="text-[10px] text-text-tertiary mt-3">
                  Agnes may make mistakes. Please verify important information.
                </p>
              </div>
            ) : (
              <>
                {(() => {
                  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
                  const lastAssistantIdx = messages.findLastIndex((m) => m.role === "assistant");
                  return messages.map((msg, i) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isLast={msg.role === "user" ? i === lastUserIdx : i === lastAssistantIdx}
                      onHitlResume={hitlResume}
                      onEditResend={editResend}
                      onRegenerate={regenerate}
                      isStreaming={isStreaming}
                    />
                  ));
                })()}
                {isStreaming && messages.length > 0 && !messages[messages.length - 1].blocks.length && (
                  <div className="flex justify-start mb-4 ml-10">
                    <div className="dot-loader flex gap-1 px-4 py-3">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex justify-start mb-4 ml-10">
                    <div className="rounded-xl bg-error-light border border-error/20 px-4 py-2.5 text-xs text-error max-w-[85%]">
                      <p className="font-medium mb-0.5">Request Error</p>
                      <p className="text-text-secondary">{error}</p>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {showScrollBtn && !isEmpty && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-surface border border-border
                         shadow-md flex items-center justify-center text-text-secondary hover:text-text-primary
                         hover:shadow-lg transition-all animate-message-in"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
              </svg>
            </button>
          )}
        </div>

        {!isEmpty && (
          <div className="px-5 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
            <div className="max-w-2xl mx-auto">
              {inputArea}
              <p className="text-[10px] text-text-tertiary text-center mt-2">
                Agnes may make mistakes. Please verify important information.
              </p>
            </div>
          </div>
        )}
      </div>

      {showEvents && (
        <div className="w-[400px] shrink-0">
          <EventStream events={rawEvents} />
        </div>
      )}
    </div>
  );
}
