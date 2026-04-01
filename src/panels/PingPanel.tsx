import { useState } from "react";
import { agentClient } from "@/grpc/client";

export function PingPanel() {
  const [message, setMessage] = useState("hello");
  const [response, setResponse] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePing = async () => {
    setLoading(true);
    setError("");
    const start = performance.now();
    try {
      const reply = await agentClient.ping({ message });
      setLatency(Math.round(performance.now() - start));
      setResponse(reply.message);
    } catch (err) {
      setError(String(err));
      setLatency(null);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-sm w-full space-y-4">
        <h2 className="text-lg font-semibold text-center">Ping</h2>
        <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ping message"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent/30" />
        <button onClick={handlePing} disabled={loading}
          className="w-full rounded-xl bg-accent text-white py-2.5 text-sm font-medium hover:bg-accent/90 disabled:opacity-40 transition-colors">
          {loading ? "Pinging..." : "Ping"}
        </button>
        {response !== null && (
          <div className="rounded-xl border border-border bg-surface p-4 text-center">
            <p className="text-sm text-text-primary">{response}</p>
            <p className="text-xs text-success mt-1">{latency}ms</p>
          </div>
        )}
        {error && <div className="text-error text-sm text-center p-3 bg-red-50 rounded-lg">{error}</div>}
      </div>
    </div>
  );
}
