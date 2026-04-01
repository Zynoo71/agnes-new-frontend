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
      <div className="w-80 space-y-5">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-text-primary">Health Check</h2>
          <p className="text-xs text-text-tertiary mt-0.5">Ping the agent service</p>
        </div>

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ping message"
          className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-center
                     focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30"
        />

        <button
          onClick={handlePing}
          disabled={loading}
          className="w-full rounded-xl bg-text-primary text-white py-2.5 text-sm font-medium
                     hover:bg-text-secondary active:scale-[0.98] disabled:opacity-40 transition-all shadow-sm"
        >
          {loading ? "Pinging..." : "Ping"}
        </button>

        {response !== null && (
          <div className="rounded-xl bg-surface border border-border-light p-4 text-center shadow-sm">
            <p className="text-sm text-text-primary font-medium">{response}</p>
            <p className="text-xs text-success font-mono mt-1">{latency}ms</p>
          </div>
        )}

        {error && (
          <div className="text-xs text-error text-center p-3 bg-error-light rounded-xl">{error}</div>
        )}
      </div>
    </div>
  );
}
