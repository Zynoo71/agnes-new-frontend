import { useState } from "react";
import { agentClient } from "@/grpc/client";

const inputClass = "rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30 transition-all";

export function HistoryPanel() {
  const [convIdInput, setConvIdInput] = useState("");
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchHistory = async () => {
    const id = Number(convIdInput);
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const resp = await agentClient.getConversationHistory({ conversationId: BigInt(id) });
      setHistory(resp);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-text-primary">Conversation History</h2>
          <p className="text-xs text-text-tertiary mt-0.5">Fetch and inspect conversation turns</p>
        </div>

        <div className="flex gap-2 mb-6">
          <input value={convIdInput} onChange={(e) => setConvIdInput(e.target.value)} placeholder="Conversation ID"
            className={`flex-1 ${inputClass}`} />
          <button onClick={fetchHistory} disabled={loading}
            className="rounded-xl bg-text-primary text-white px-5 py-2.5 text-sm font-medium
                       hover:bg-text-secondary active:scale-[0.97] disabled:opacity-40 transition-all shadow-sm">
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>

        {error && <div className="text-xs text-error p-3.5 bg-error-light rounded-xl mb-4">{error}</div>}

        {history && (
          <div className="space-y-4">
            {/* Status */}
            <div className="flex gap-2">
              <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${
                history.isRunning ? "bg-accent/10 text-accent" : "bg-success-light text-success"
              }`}>
                {history.isRunning ? "Running" : "Idle"}
              </span>
              {history.pendingReview && (
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-warning-light text-warning">
                  Pending Review
                </span>
              )}
            </div>

            {/* Interrupt payload */}
            {history.interruptPayload && history.interruptPayload.length > 0 && (
              <details className="rounded-xl border border-border-light bg-surface p-4 shadow-sm">
                <summary className="cursor-pointer text-xs font-semibold text-text-primary">Interrupt Payload</summary>
                <pre className="mt-2 text-[11px] font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {new TextDecoder().decode(history.interruptPayload)}
                </pre>
              </details>
            )}

            {/* Turns */}
            {history.turns.map((turn: any, i: number) => (
              <div key={i} className="rounded-2xl border border-border-light bg-surface p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-light">
                  <code className="text-[10px] text-text-tertiary bg-surface-hover px-2 py-0.5 rounded-md">
                    {turn.requestId}
                  </code>
                  <span className="text-[10px] text-text-tertiary">
                    {new Date(Number(turn.createdAt)).toLocaleString()}
                  </span>
                </div>
                <div className="space-y-3">
                  {turn.user.map((block: any, j: number) => (
                    <div key={`u-${j}`}>
                      <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1">
                        User &middot; {block.type}
                      </div>
                      <pre className="text-[12px] font-mono bg-user-bubble rounded-xl p-3 whitespace-pre-wrap overflow-x-auto
                                      text-text-secondary leading-relaxed">
                        {JSON.stringify(block.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                  {turn.assistant.map((block: any, j: number) => (
                    <div key={`a-${j}`}>
                      <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1">
                        Assistant &middot; {block.type}
                        {block.toolCallId && <span className="normal-case tracking-normal"> &middot; {block.toolCallId}</span>}
                      </div>
                      <pre className="text-[12px] font-mono bg-background rounded-xl p-3 whitespace-pre-wrap overflow-x-auto
                                      text-text-secondary leading-relaxed border border-border-light">
                        {JSON.stringify(block.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
