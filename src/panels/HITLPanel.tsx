import { useState } from "react";
import { agentClient } from "@/grpc/client";
import type { RawEvent } from "@/stores/conversationStore";
import { EventStream } from "@/components/EventStream";

const inputClass = "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 transition-all";

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
    setEvents([]); setContent(""); setStreaming(true);
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
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-xl mx-auto space-y-5">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Human-in-the-Loop</h2>
            <p className="text-xs text-text-tertiary mt-0.5">Resume an interrupted agent with a review decision</p>
          </div>

          <div className="space-y-4 rounded-2xl bg-surface border border-border-light p-5 shadow-sm">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Conversation ID</label>
              <input value={convIdInput} onChange={(e) => setConvIdInput(e.target.value)}
                placeholder="Enter conversation ID" className={inputClass} />
            </div>

            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">Action</label>
              <div className="flex items-center bg-surface-hover rounded-xl p-0.5">
                {(["approve", "modify", "reject"] as const).map((a) => (
                  <button key={a} onClick={() => setAction(a)}
                    className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
                      action === a
                        ? "bg-surface text-text-primary shadow-sm"
                        : "text-text-tertiary hover:text-text-secondary"
                    }`}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {action === "modify" && (
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">Modify Data</label>
                <textarea value={modifyData} onChange={(e) => setModifyData(e.target.value)}
                  placeholder='{"key": "value"}' rows={4}
                  className={`${inputClass} font-mono`} />
              </div>
            )}
          </div>

          <button onClick={handleResume} disabled={isStreaming || !convIdInput}
            className="rounded-xl bg-text-primary text-white px-6 py-2.5 text-sm font-medium
                       hover:bg-text-secondary active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm">
            {isStreaming ? "Streaming..." : "Send Resume"}
          </button>

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
