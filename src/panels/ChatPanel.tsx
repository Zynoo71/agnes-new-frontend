import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useChat } from "@/hooks/useChat";
import { MessageBubble } from "@/components/MessageBubble";
import { EventStream } from "@/components/EventStream";

const AGENT_TYPES = ["super", "search", "research", "pixa"] as const;

export function ChatPanel() {
  const { conversationId, agentType, messages, rawEvents, isStreaming, setAgentType } =
    useConversationStore();
  const { createConversation, sendMessage, hitlResume } = useChat();
  const [showEvents, setShowEvents] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !conversationId) return;
    sendMessage(trimmed);
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
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <button
            onClick={createConversation}
            className="rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            + New
          </button>

          {conversationId && (
            <span className="text-xs text-text-tertiary font-mono">
              conv: {conversationId.toString()}
            </span>
          )}

          <select
            value={agentType}
            onChange={(e) => setAgentType(e.target.value)}
            className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {AGENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <button
            onClick={() => setShowEvents(!showEvents)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              showEvents
                ? "border-accent text-accent bg-accent-light"
                : "border-border text-text-secondary hover:bg-surface-hover"
            }`}
          >
            Events {rawEvents.length > 0 && `(${rawEvents.length})`}
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center text-text-tertiary mt-32">
                <p className="text-lg">Agent Debug Console</p>
                <p className="text-sm mt-1">Create a conversation and start chatting</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                onHitlResume={hitlResume}
                isStreaming={isStreaming}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-border bg-surface p-4">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              disabled={isStreaming || !conversationId}
              rows={1}
              className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                         disabled:opacity-50 placeholder:text-text-tertiary"
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !conversationId || !input.trim()}
              className="shrink-0 rounded-xl bg-accent text-white px-4 py-3 text-sm font-medium
                         hover:bg-accent/90 disabled:opacity-40 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Debug panel */}
      {showEvents && (
        <div className="w-96 shrink-0">
          <EventStream events={rawEvents} />
        </div>
      )}
    </div>
  );
}
