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
    const id = Number(convIdInput);
    if (!id || isStreaming) return;
    setEvents([]);
    setContent("");
    setStreaming(true);
    try {
      const stream = agentClient.resumeStream({ conversationId: BigInt(id) });
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
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-lg font-semibold">Resume Stream</h2>
          <p className="text-sm text-text-secondary">Reconnect to an in-progress agent stream. Replays buffered events (60s window) then continues real-time.</p>
          <div className="flex gap-2">
            <input value={convIdInput} onChange={(e) => setConvIdInput(e.target.value)} placeholder="Conversation ID"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            <button onClick={handleResume} disabled={isStreaming || !convIdInput}
              className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 disabled:opacity-40">
              {isStreaming ? "Streaming..." : "Resume"}
            </button>
          </div>
          {content && <div className="rounded-xl border border-border bg-surface p-4 text-sm whitespace-pre-wrap">{content}</div>}
        </div>
      </div>
      {events.length > 0 && <div className="w-96 shrink-0"><EventStream events={events} /></div>}
    </div>
  );
}
