import { useState } from "react";
import { agentClient } from "@/grpc/client";
import type { RawEvent } from "@/stores/conversationStore";
import { EventStream } from "@/components/EventStream";

export function HITLPanel() {
  const [convIdInput, setConvIdInput] = useState("");
  const [action, setAction] = useState<"approve" | "modify" | "reject">("approve");
  const [modifyData, setModifyData] = useState("");
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
      const resumePayload: Record<string, unknown> = { action };
      if (action === "modify" && modifyData) {
        try { Object.assign(resumePayload, JSON.parse(modifyData)); } catch { resumePayload.data = modifyData; }
      }
      const stream = agentClient.hitlResumeStream({
        conversationId: BigInt(id),
        resumeData: new TextEncoder().encode(JSON.stringify(resumePayload)),
      });
      for await (const event of stream) {
        const ev = event.event;
        setEvents((prev) => [...prev, { timestamp: Date.now(), type: ev.case ?? "unknown", data: ev.value }]);
        if (ev.case === "messageDelta") { setContent((prev) => prev + ev.value.content); }
      }
    } catch (err) { console.error("HitlResumeStream error:", err); }
    finally { setStreaming(false); }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-lg font-semibold">Human-in-the-Loop Resume</h2>
          <input value={convIdInput} onChange={(e) => setConvIdInput(e.target.value)} placeholder="Conversation ID"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <div className="flex gap-2">
            {(["approve", "modify", "reject"] as const).map((a) => (
              <button key={a} onClick={() => setAction(a)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  action === a ? "bg-accent text-white" : "border border-border text-text-secondary hover:bg-surface-hover"}`}>
                {a}
              </button>
            ))}
          </div>
          {action === "modify" && (
            <textarea value={modifyData} onChange={(e) => setModifyData(e.target.value)}
              placeholder="Modify data (JSON or text)" rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/30" />
          )}
          <button onClick={handleResume} disabled={isStreaming || !convIdInput}
            className="rounded-xl bg-accent text-white px-6 py-2.5 text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors">
            {isStreaming ? "Streaming..." : "Resume"}
          </button>
          {content && <div className="rounded-xl border border-border bg-surface p-4 text-sm whitespace-pre-wrap">{content}</div>}
        </div>
      </div>
      {events.length > 0 && <div className="w-96 shrink-0"><EventStream events={events} /></div>}
    </div>
  );
}
