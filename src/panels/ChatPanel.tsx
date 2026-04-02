import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useChat } from "@/hooks/useChat";
import { MessageBubble } from "@/components/MessageBubble";
import { EventStream } from "@/components/EventStream";

const AGENT_TYPES = ["super", "search", "research", "pixa"] as const;

export function ChatPanel() {
  const { conversationId, agentType, messages, rawEvents, isStreaming, error, setAgentType } =
    useConversationStore();
  const { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream } = useChat();
  const [showEvents, setShowEvents] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Detect pending HITL review — ChatStream auto-converts typed messages to modify resume
  const hasPendingReview = messages.some(
    (m) => m.blocks.some((b) => b.type === "human_review" && !b.data.resolved)
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !conversationId) return;
    if (hasPendingReview) {
      hitlResume("modify", trimmed);
    } else {
      sendMessage(trimmed);
    }
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col">
        {/* Top controls */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-light bg-surface-alt">
          <button
            onClick={createConversation}
            className="rounded-lg bg-accent text-white px-3.5 py-1.5 text-xs font-medium
                       hover:bg-accent-hover active:scale-[0.97] transition-all shadow-sm"
          >
            New Conversation
          </button>

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

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-8">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-32 text-center">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">Agent Debug Console</h2>
                <p className="text-sm text-text-tertiary">Create a conversation to start debugging</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                isLast={i === messages.length - 1}
                onHitlResume={hitlResume}
                onEditResend={editResend}
                onRegenerate={regenerate}
                isStreaming={isStreaming}
              />
            ))}
            {isStreaming && messages.length > 0 && !messages[messages.length - 1].blocks.length && (
              <div className="flex justify-start mb-4">
                <div className="dot-loader flex gap-1 px-4 py-3">
                  <span /><span /><span />
                </div>
              </div>
            )}
            {error && (
              <div className="flex justify-start mb-4">
                <div className="rounded-xl bg-error-light border border-error/20 px-4 py-2.5 text-xs text-error max-w-[85%]">
                  <p className="font-medium mb-0.5">Request Error</p>
                  <p className="text-text-secondary">{error}</p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-5 pb-5 pt-2 bg-gradient-to-t from-background via-background to-transparent">
          <div className="max-w-2xl mx-auto">
            <div className="relative rounded-2xl border border-border bg-surface shadow-sm
                            focus-within:shadow-md focus-within:border-border transition-shadow">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={!conversationId ? "Create a conversation first" : hasPendingReview ? "Type feedback to modify, or use the buttons above..." : "Message..."}
                disabled={!conversationId}
                rows={1}
                className="w-full resize-none bg-transparent px-4 py-3 pr-14 text-sm
                           focus:outline-none disabled:opacity-40 placeholder:text-text-tertiary"
              />
              {isStreaming ? (
                <button
                  onClick={cancelStream}
                  className="absolute right-2 bottom-2 rounded-xl bg-error text-white p-2
                             hover:bg-error/80 active:scale-95 transition-all"
                  title="Stop generating"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!conversationId || !input.trim()}
                  className="absolute right-2 bottom-2 rounded-xl bg-text-primary text-white p-2
                             hover:bg-text-secondary disabled:opacity-20 disabled:hover:bg-text-primary
                             active:scale-95 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Debug panel */}
      {showEvents && (
        <div className="w-[400px] shrink-0">
          <EventStream events={rawEvents} />
        </div>
      )}
    </div>
  );
}
