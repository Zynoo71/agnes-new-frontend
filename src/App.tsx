import { useState } from "react";
import { ChatPanel } from "@/panels/ChatPanel";
import { PixaPanel } from "@/panels/PixaPanel";
import { HistoryPanel } from "@/panels/HistoryPanel";
import { HITLPanel } from "@/panels/HITLPanel";
import { ResumePanel } from "@/panels/ResumePanel";
import { PingPanel } from "@/panels/PingPanel";

const MODES = [
  { value: "chat", label: "Chat" },
  { value: "pixa", label: "Pixa" },
  { value: "history", label: "History" },
  { value: "hitl", label: "HITL" },
  { value: "resume", label: "Resume" },
  { value: "ping", label: "Ping" },
] as const;

type Mode = (typeof MODES)[number]["value"];

const PANELS: Record<Mode, React.FC> = {
  chat: ChatPanel,
  pixa: PixaPanel,
  history: HistoryPanel,
  hitl: HITLPanel,
  resume: ResumePanel,
  ping: PingPanel,
};

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const Panel = PANELS[mode];

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-5 py-3 border-b border-border bg-surface shrink-0">
        <h1 className="text-base font-semibold text-text-primary">Agent Debug</h1>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm
                     focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </header>
      <main className="flex-1 overflow-hidden">
        <Panel />
      </main>
    </div>
  );
}
