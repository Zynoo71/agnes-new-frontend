import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router";
import { useConversationStore } from "@/stores/conversationStore";
import { useConversationListStore } from "@/stores/conversationListStore";
import { useChat } from "@/hooks/useChat";
import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ImagePreview } from "@/components/ImagePreview";
import { ChatPanel } from "@/panels/ChatPanel";
import { PixaPanel } from "@/panels/PixaPanel";
import { PromptManagementPage } from "@/pages/PromptManagementPage";
import { ProfilePage } from "@/pages/ProfilePage";

/** Route: /chat/:convId — selects the conversation on mount */
function ChatRoute() {
  const { convId } = useParams<{ convId: string }>();
  const { selectConversation } = useChat();

  useEffect(() => {
    if (convId) {
      const currentId = useConversationStore.getState().conversationId;
      if (convId !== currentId) {
        selectConversation(convId);
      }
    }
  }, [convId, selectConversation]);

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
    navigate("/chat");
    const id = await createConversation();
    navigate(`/chat/${id}`, { replace: true });
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
          <Route path="/prompts" element={<ErrorBoundary><PromptManagementPage /></ErrorBoundary>} />
          <Route path="/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
      <ImagePreview />
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
