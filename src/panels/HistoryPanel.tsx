import { useState } from "react";
import { agentClient } from "@/grpc/client";

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
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">Conversation History</h2>
        <div className="flex gap-2 mb-6">
          <input value={convIdInput} onChange={(e) => setConvIdInput(e.target.value)} placeholder="Conversation ID"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
          <button onClick={fetchHistory} disabled={loading}
            className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium hover:bg-accent/90 disabled:opacity-40">
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>
        {error && <div className="text-error text-sm mb-4 p-3 bg-red-50 rounded-lg">{error}</div>}
        {history && (
          <div>
            <div className="flex gap-2 mb-4">
              <span className={`text-xs px-2 py-1 rounded-full ${history.isRunning ? "bg-accent-light text-accent" : "bg-green-50 text-success"}`}>
                {history.isRunning ? "Running" : "Idle"}
              </span>
              {history.pendingReview && (
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-50 text-yellow-700">Pending Review</span>
              )}
            </div>
            {history.interruptPayload && history.interruptPayload.length > 0 && (
              <details className="mb-4 rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">Interrupt Payload</summary>
                <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">
                  {new TextDecoder().decode(history.interruptPayload)}
                </pre>
              </details>
            )}
            <div className="space-y-4">
              {history.turns.map((turn: any, i: number) => (
                <div key={i} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-text-tertiary">{turn.requestId}</span>
                    <span className="text-xs text-text-tertiary">{new Date(Number(turn.createdAt)).toLocaleString()}</span>
                  </div>
                  {turn.user.map((block: any, j: number) => (
                    <div key={`u-${j}`} className="mb-2">
                      <span className="text-xs text-text-tertiary">user [{block.type}]</span>
                      <pre className="text-sm bg-user-bubble rounded p-2 mt-1 whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(block.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                  {turn.assistant.map((block: any, j: number) => (
                    <div key={`a-${j}`} className="mb-2">
                      <span className="text-xs text-text-tertiary">
                        assistant [{block.type}]{block.toolCallId && ` tool_call_id=${block.toolCallId}`}
                      </span>
                      <pre className="text-sm bg-background rounded p-2 mt-1 whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(block.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
