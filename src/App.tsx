import { useState, useEffect } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useChat } from "@/hooks/useChat";
import { deleteConversation as dbDelete } from "@/db";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/panels/ChatPanel";
import { PixaPanel } from "@/panels/PixaPanel";
import { HistoryPanel } from "@/panels/HistoryPanel";
import { HITLPanel } from "@/panels/HITLPanel";
import { ResumePanel } from "@/panels/ResumePanel";
import { PingPanel } from "@/panels/PingPanel";

export const MODES = [
  { value: "chat", label: "Chat", icon: "chat" },
  { value: "pixa", label: "Pixa", icon: "image" },
  { value: "history", label: "History", icon: "clock" },
  { value: "hitl", label: "HITL", icon: "user" },
  { value: "resume", label: "Resume", icon: "play" },
  { value: "ping", label: "Ping", icon: "signal" },
] as const;

export type Mode = (typeof MODES)[number]["value"];

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
  const { createConversation, selectConversation } = useChat();
  const loadConversations = useConversationStore((s) => s.loadConversations);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleNewChat = async () => {
    setMode("chat");
    await createConversation();
  };

  const handleSelectConversation = async (id: bigint) => {
    setMode("chat");
    await selectConversation(id);
  };

  const handleDeleteConversation = (id: string) => {
    if (!window.confirm("Delete this conversation?")) return;
    dbDelete(id);
    loadConversations();
    const s = useConversationStore.getState();
    if (s.conversationId !== null && String(s.conversationId) === id) {
      s.reset();
    }
  };

  return (
    <div className="h-screen flex bg-background">
      <Sidebar
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
        mode={mode}
        onModeChange={setMode}
      />

      <main className="flex-1 overflow-hidden min-w-0">
        <Panel />
      </main>
    </div>
  );
}
