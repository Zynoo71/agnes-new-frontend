import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useConversationListStore } from "@/stores/conversationListStore";
import { useChat } from "@/hooks/useChat";
import { useHealthCheck, type HealthInfo } from "@/hooks/useHealthCheck";
import { MessageBubble } from "@/components/MessageBubble";
import { EventStream } from "@/components/EventStream";
import { SystemPromptSelector } from "@/components/SystemPromptSelector";
import { ChatSkillsPicker } from "@/components/ChatSkillsPicker";
import { hydrateConversationSkillsFromServer } from "@/lib/conversationSkillSync";

const AGENT_TYPES = ["super", "search", "research", "slide", "sheet", "pixa"] as const;

const SCROLL_HINTS_ROW1 = [
  "Search the latest AI news",
  "Summarize a research paper",
  "Draft a professional email",
  "Compare product features",
  "Plan a weekend trip to Kyoto",
  "Explain quantum computing simply",
  "Debug my React component",
  "Write a product launch plan",
];
const SCROLL_HINTS_ROW2 = [
  "Analyze a financial report",
  "Create a competitive analysis",
  "Translate this into French",
  "Design a database schema",
  "Review my pull request",
  "Generate test cases for an API",
  "Brainstorm startup ideas",
  "Optimize this SQL query",
];

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

function MessageSkeleton() {
  return (
    <div className="animate-message-in space-y-6 py-2">
      {/* Assistant message skeleton */}
      <div className="flex gap-2.5">
        <div className="skeleton w-7 h-7 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-3.5 w-3/4" />
          <div className="skeleton h-3.5 w-1/2" />
          <div className="skeleton h-3.5 w-5/6" />
        </div>
      </div>
      {/* User message skeleton */}
      <div className="flex justify-end gap-2.5">
        <div className="space-y-2 pt-1">
          <div className="skeleton h-3.5 w-48 ml-auto" />
        </div>
        <div className="skeleton w-7 h-7 rounded-full shrink-0" />
      </div>
      {/* Another assistant skeleton */}
      <div className="flex gap-2.5">
        <div className="skeleton w-7 h-7 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-3.5 w-2/3" />
          <div className="skeleton h-3.5 w-4/5" />
          <div className="skeleton h-20 w-full rounded-xl" />
          <div className="skeleton h-3.5 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function ScrollingHints() {
  const row1 = SCROLL_HINTS_ROW1;
  const row2 = SCROLL_HINTS_ROW2;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none flex flex-col justify-center gap-4">
      <ScrollRow items={row1} direction="left" duration={35} />
      <ScrollRow items={row2} direction="right" duration={40} />
    </div>
  );
}

function ScrollRow({ items, direction, duration }: { items: string[]; direction: "left" | "right"; duration: number }) {
  // Triple for seamless loop
  const repeated = [...items, ...items, ...items];
  return (
    <div className="scroll-row-mask">
      <div
        className={direction === "left" ? "scroll-row-left" : "scroll-row-right"}
        style={{ animationDuration: `${duration}s` }}
      >
        {repeated.map((hint, i) => (
          <span key={i} className="scroll-hint-pill">{hint}</span>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { conversationId, agentType, messages, isStreaming, isLoadingHistory, error, setAgentType, systemPromptId, setSystemPromptId } =
    useConversationStore();
  const rawEventsCount = useConversationStore(s => s.rawEvents.length);
  const rawEvents = useConversationStore(s => s.rawEvents);
  
  const { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream } = useChat();
  const [showEvents, setShowEvents] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const isNearBottomRef = useRef(true);
  const pendingScrollRef = useRef(false);
  const lastAutoScrollRef = useRef(0);

  const health = useHealthCheck();

  const hasPendingReview = messages.some(
    (m) => m.blocks.some((b) => b.type === "human_review" && !b.data.resolved)
  );

  const isEmpty = messages.length === 0;
  const hasUserMessages = messages.some((m) => m.role === "user");

  // Reset scroll state when conversation changes — force next scroll to bottom.
  useEffect(() => {
    isNearBottomRef.current = true;
    pendingScrollRef.current = true;
    setShowScrollBtn(false);
  }, [conversationId]);

  // 恢复本会话已持久化的 hub skill 选用（刷新 / 切换会话 / 新建会话后与 DB 对齐）
  useEffect(() => {
    if (!conversationId) return;
    void hydrateConversationSkillsFromServer(conversationId);
  }, [conversationId]);

  // Auto-scroll via ResizeObserver: fires whenever the content div changes
  // height (new messages rendered, streaming text appended, images loaded, etc).
  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const observer = new ResizeObserver(() => {
      if (pendingScrollRef.current || isNearBottomRef.current) {
        pendingScrollRef.current = false;
        container.scrollTop = container.scrollHeight;
        // Mark as programmatic scroll so handleScroll won't
        // invalidate isNearBottomRef before the next resize fires.
        lastAutoScrollRef.current = Date.now();
        isNearBottomRef.current = true;
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Ignore scroll events triggered by programmatic scrolling —
    // the async onScroll fires after content has grown further,
    // giving a stale distanceFromBottom that falsely clears isNearBottom.
    if (Date.now() - lastAutoScrollRef.current < 200) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 100;
    setShowScrollBtn(distanceFromBottom > 200);
  }, []);

  const scrollToBottom = () => {
    isNearBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const isComposingRef = useRef(false);

  const handleSend = async (text?: string) => {
    const trimmed = (text ?? input).trim();
    if (!trimmed || isStreaming) return;
    setInput("");
    isNearBottomRef.current = true;
    if (!conversationId) {
      await createConversation();
    }
    if (hasPendingReview) {
      hitlResume("modify", trimmed);
    } else {
      sendMessage(trimmed);
    }
    // ResizeObserver handles the scroll when content appears.
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Check both standard isComposing and our ref for broader compatibility
    const isComposing = e.nativeEvent.isComposing || isComposingRef.current;
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasInput = input.trim().length > 0;

  const inputArea = (
    <div className={`relative rounded-[20px] border border-border bg-surface shadow-sm
                    focus-within:shadow-md focus-within:border-border transition-shadow
                    ${isEmpty ? "max-w-xl w-full" : ""}`}>
      {/* Agent mode selector + Prompt selector */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-0">
        <div className="flex items-center gap-1">
          {AGENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setAgentType(t);
                if (conversationId) useConversationListStore.getState().update(conversationId, { agentType: t });
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all capitalize ${
                agentType === t
                  ? "bg-accent/10 text-accent"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t}
            </button>
          ))}
          <ChatSkillsPicker conversationId={conversationId} />
        </div>
        <SystemPromptSelector
          selectedId={systemPromptId}
          onChange={(id) => {
            setSystemPromptId(id);
            if (conversationId) {
              useConversationListStore.getState().update(conversationId, { systemPromptId: id });
            }
          }}
          disabled={hasUserMessages}
        />
      </div>
      <div className="flex items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposingRef.current = true; }}
          onCompositionEnd={() => { isComposingRef.current = false; }}
          placeholder={hasPendingReview ? "Type feedback to modify..." : "Ask Agnes anything..."}
          rows={1}
          className="flex-1 resize-none bg-transparent py-2.5 pl-4 pr-14 text-sm
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
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top controls */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-light bg-surface-alt">
          <HealthBadge info={health} />

          {conversationId && (
            <code className="text-[11px] text-text-tertiary bg-surface-hover px-2 py-0.5 rounded-md">
              #{conversationId.toString()}
            </code>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowEvents(!showEvents)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                showEvents
                  ? "bg-accent/10 text-accent"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              Events{rawEventsCount > 0 ? ` (${rawEventsCount})` : ""}
            </button>
          </div>
        </div>

        {/* Messages or Welcome */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto min-h-0 relative"
        >
          {isEmpty && !isLoadingHistory && <ScrollingHints />}
          <div ref={contentRef} className="max-w-2xl mx-auto px-5 py-8">
            {isLoadingHistory ? (
              <MessageSkeleton />
            ) : isEmpty ? (
              null
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
                      animate={!msg.id.startsWith("hist-")}
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

        <div className="shrink-0 px-5 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
          <div className="max-w-2xl mx-auto">
            {inputArea}
          </div>
        </div>
      </div>

      <div
        className="shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out"
        style={{ width: showEvents ? 400 : 0 }}
      >
        <div className="w-[400px] h-full">
          {showEvents && <EventStream events={rawEvents} />}
        </div>
      </div>
    </div>
  );
}
