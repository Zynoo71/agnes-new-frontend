import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "@/components/Layout";
import ChatPage from "@/pages/Chat";
import PixaPage from "@/pages/Pixa";
import HistoryPage from "@/pages/History";
import HITLPage from "@/pages/HITL";
import ResumePage from "@/pages/Resume";
import PingPage from "@/pages/Ping";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ChatPage />} />
          <Route path="pixa" element={<PixaPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="hitl" element={<HITLPage />} />
          <Route path="resume" element={<ResumePage />} />
          <Route path="ping" element={<PingPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
