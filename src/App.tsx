import { useState } from "react";

const MODES = [
  { value: "chat", label: "💬 Chat" },
  { value: "pixa", label: "🎨 Pixa" },
  { value: "history", label: "📋 History" },
  { value: "hitl", label: "👤 HITL" },
  { value: "resume", label: "🔄 Resume" },
  { value: "ping", label: "🏓 Ping" },
] as const;

type Mode = (typeof MODES)[number]["value"];

// Lazy imports will be added as pages are implemented
// For now, placeholder
function Placeholder({ mode }: { mode: string }) {
  return (
    <div className="h-full flex items-center justify-center text-text-secondary">
      {mode} — coming soon
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface shrink-0">
        <h1 className="text-base font-semibold text-text-primary">Agent Debug</h1>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <Placeholder mode={mode} />
      </main>
    </div>
  );
}
