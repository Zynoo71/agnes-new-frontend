import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router";
import { useConversationStore } from "@/stores/conversationStore";
import { useConversationListStore } from "@/stores/conversationListStore";
import { useChat } from "@/hooks/useChat";
import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ChatPanel } from "@/panels/ChatPanel";
import { PixaPanel } from "@/panels/PixaPanel";

/** Route: /chat/:convId — selects the conversation on mount */
function ChatRoute() {
  const { convId } = useParams<{ convId: string }>();
  const { selectConversation } = useChat();
  const currentId = useConversationStore((s) => s.conversationId);

  useEffect(() => {
    if (convId && convId !== currentId) {
      selectConversation(convId);
    }
  }, [convId, currentId, selectConversation]);

  return (
    <ErrorBoundary>
      <ChatPanel />
    </ErrorBoundary>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const { createConversation } = useChat();
  const load = useConversationListStore((s) => s.load);
  const remove = useConversationListStore((s) => s.remove);

  useEffect(() => {
    load();
  }, [load]);

  const handleNewChat = async () => {
    const id = await createConversation();
    navigate(`/chat/${id}`);
  };

  const handleSelectConversation = (id: string) => {
    navigate(`/chat/${id}`);
  };

  const handleDeleteConversation = (id: string) => {
    remove(id);
    const s = useConversationStore.getState();
    if (s.conversationId === id) {
      s.reset();
      navigate("/chat");
    }
  };

  return (
    <div className="h-screen flex bg-background">
      <Sidebar
        onNewChat={handleNewChat}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      <main className="flex-1 overflow-hidden min-w-0">
        <Routes>
          <Route path="/chat" element={<ErrorBoundary><ChatPanel /></ErrorBoundary>} />
          <Route path="/chat/:convId" element={<ChatRoute />} />
          <Route path="/pixa" element={<ErrorBoundary><PixaPanel /></ErrorBoundary>} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
