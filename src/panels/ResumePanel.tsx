import { useState } from "react";
import { agentClient } from "@/grpc/client";
import type { RawEvent } from "@/stores/conversationStore";
import { EventStream } from "@/components/EventStream";

export function ResumePanel() {
  const [convIdInput, setConvIdInput] = useState("");
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [content, setContent] = useState("");

  const handleResume = async () => {
    let id: bigint;
    try { id = BigInt(convIdInput.trim()); } catch { return; }
    if (isStreaming) return;
    setEvents([]); setContent(""); setStreaming(true);
    try {
      const stream = agentClient.resumeStream({ conversationId: id });
      for await (const event of stream) {
        const ev = event.event;
        setEvents((prev) => [...prev, { timestamp: Date.now(), type: ev.case ?? "unknown", data: ev.value }]);
        if (ev.case === "messageDelta") { setContent((prev) => prev + ev.value.content); }
      }
    } catch (err) { console.error("ResumeStream error:", err); }
    finally { setStreaming(false); }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-xl mx-auto space-y-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Resume Stream</h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              Reconnect to an in-progress agent stream. Replays buffered events (60s window) then continues real-time.
            </p>
          </div>

          <div className="rounded-2xl bg-surface border border-border-light p-5 shadow-sm">
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Conversation ID</label>
            <div className="flex gap-2">
              <input value={convIdInput} onChange={(e) => setConvIdInput(e.target.value)} placeholder="Enter conversation ID"
                className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm
                           focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 transition-all" />
              <button onClick={handleResume} disabled={isStreaming || !convIdInput}
                className="rounded-xl bg-text-primary text-white px-5 py-2.5 text-sm font-medium
                           hover:bg-text-secondary active:scale-[0.97] disabled:opacity-40 transition-all shadow-sm">
                {isStreaming ? "Streaming..." : "Resume"}
              </button>
            </div>
          </div>

          {content && (
            <div className="rounded-2xl bg-surface border border-border-light p-5 text-sm whitespace-pre-wrap
                            text-text-primary leading-relaxed shadow-sm">
              {content}
            </div>
          )}
        </div>
      </div>
      {events.length > 0 && <div className="w-[400px] shrink-0"><EventStream events={events} /></div>}
    </div>
  );
}
