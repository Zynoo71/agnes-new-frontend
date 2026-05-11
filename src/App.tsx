import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router";
import { useConversationStore } from "@/stores/conversationStore";
import { useConversationListStore } from "@/stores/conversationListStore";
import { PENDING_SKILLS_CONV_ID, useChatSelectedSkillsStore } from "@/stores/chatSelectedSkillsStore";
import { useChat } from "@/hooks/useChat";
import { Sidebar } from "@/components/Sidebar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ImagePreview } from "@/components/ImagePreview";
import { LocalSlidePreview } from "@/components/LocalSlidePreview";
import { ReportPreview } from "@/components/ReportPreview";
import { UserIdSetupModal } from "@/components/UserIdSetupModal";
import { ChatPanel } from "@/panels/ChatPanel";
import { PromptManagementPage } from "@/pages/PromptManagementPage";
import { ProfilePage } from "@/pages/ProfilePage";
import { MarketPage, MySkillsPage } from "@/pages/AgnesHub";
import { AdminAllSkillsPage, AdminLoginPage, AdminOfficialPage, AdminPendingPage } from "@/pages/Admin";

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
      useChatSelectedSkillsStore.getState().clear(PENDING_SKILLS_CONV_ID);
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
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ErrorBoundary><ChatPanel /></ErrorBoundary>} />
          <Route path="/chat/:convId" element={<ChatRoute />} />
          <Route path="/prompts" element={<ErrorBoundary><PromptManagementPage /></ErrorBoundary>} />
          <Route path="/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
          <Route path="/agnes-hub" element={<Navigate to="/agnes-hub/market" replace />} />
          <Route path="/agnes-hub/market" element={<ErrorBoundary><MarketPage /></ErrorBoundary>} />
          <Route path="/agnes-hub/mine" element={<ErrorBoundary><MySkillsPage /></ErrorBoundary>} />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </main>
      <ImagePreview />
      <LocalSlidePreview />
      <ReportPreview />
      <UserIdSetupModal />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin 子站：独立壳，无侧栏；登录页本身也不需要权限校验。*/}
        <Route path="/admin/login" element={<ErrorBoundary><AdminLoginPage /></ErrorBoundary>} />
        <Route path="/admin/skills" element={<ErrorBoundary><AdminPendingPage /></ErrorBoundary>} />
        <Route path="/admin/skills/official" element={<ErrorBoundary><AdminOfficialPage /></ErrorBoundary>} />
        <Route path="/admin/skills/all" element={<ErrorBoundary><AdminAllSkillsPage /></ErrorBoundary>} />
        <Route path="/admin" element={<Navigate to="/admin/skills" replace />} />

        {/* 其它一切走主壳 */}
        <Route path="/*" element={<AppLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
