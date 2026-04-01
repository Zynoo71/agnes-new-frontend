import { useState } from "react";
import { ChatPanel } from "@/panels/ChatPanel";
import { PixaPanel } from "@/panels/PixaPanel";
import { HistoryPanel } from "@/panels/HistoryPanel";
import { HITLPanel } from "@/panels/HITLPanel";
import { ResumePanel } from "@/panels/ResumePanel";
import { PingPanel } from "@/panels/PingPanel";

const MODES = [
  { value: "chat", label: "Chat", desc: "Stream conversations" },
  { value: "pixa", label: "Pixa", desc: "Image & video generation" },
  { value: "history", label: "History", desc: "Browse conversations" },
  { value: "hitl", label: "HITL", desc: "Human-in-the-loop" },
  { value: "resume", label: "Resume", desc: "Reconnect streams" },
  { value: "ping", label: "Ping", desc: "Health check" },
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
  const currentMode = MODES.find((m) => m.value === mode)!;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-5 px-6 py-3.5 bg-surface border-b border-border-light shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-white text-xs font-bold tracking-tight">A</span>
          </div>
          <span className="text-sm font-semibold text-text-primary tracking-tight">
            Agent Debug
          </span>
        </div>

        <div className="h-4 w-px bg-border" />

        <div className="relative">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="appearance-none rounded-lg bg-surface-hover pl-3 pr-8 py-1.5 text-sm font-medium
                       text-text-primary cursor-pointer border-none
                       hover:bg-border-light focus:outline-none focus:ring-2 focus:ring-accent/20"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <span className="text-xs text-text-tertiary">{currentMode.desc}</span>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <Panel />
      </main>
    </div>
  );
}
