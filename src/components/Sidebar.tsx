import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router";
import { useConversationStore } from "@/stores/conversationStore";
import { useConversationListStore } from "@/stores/conversationListStore";
import { useShallow } from "zustand/shallow";
import type { ConvMeta } from "@/db";

interface SidebarProps {
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

function groupByDate(conversations: ConvMeta[]): { label: string; items: ConvMeta[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const groups: Record<string, ConvMeta[]> = {};
  for (const conv of conversations) {
    const dateStr = new Date(conv.updatedAt).toDateString();
    let label: string;
    if (dateStr === todayStr) label = "Today";
    else if (dateStr === yesterdayStr) label = "Yesterday";
    else label = "Earlier";
    (groups[label] ??= []).push(conv);
  }

  const order = ["Today", "Yesterday", "Earlier"];
  return order.filter((l) => groups[l]?.length).map((label) => ({ label, items: groups[label] }));
}

export function Sidebar({ onNewChat, onSelectConversation, onDeleteConversation }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isPromptsActive = location.pathname === "/prompts";
  const isProfileActive = location.pathname === "/profile";
  const isAgnesHubActive = location.pathname.startsWith("/agnes-hub");

  const { conversationId, streamingConvIds } = useConversationStore(
    useShallow((s) => ({ conversationId: s.conversationId, streamingConvIds: s.streamingConvIds })),
  );
  const conversations = useConversationListStore((s) => s.conversations);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const groups = groupByDate(conversations);

  // Click outside cancels confirm
  useEffect(() => {
    if (!confirmDeleteId) return;
    const handler = (e: MouseEvent) => {
      if (confirmRef.current && !confirmRef.current.contains(e.target as Node)) {
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [confirmDeleteId]);

  return (
    <aside
      className="shrink-0 bg-[#f0ece7] border-r border-border-light flex flex-col h-full transition-[width] duration-200 ease-in-out"
      style={{ width: collapsed ? 56 : 260 }}
    >
      {/* Header: logo + collapse toggle */}
      <div className={`flex items-center p-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(315deg, #a84e1e, #e8985a)" }}>
              <svg width="22" height="22" viewBox="0 0 72 72" fill="none">
                <circle cx="30" cy="30" r="18" stroke="white" strokeWidth="3.5" strokeOpacity="0.4" fill="none"/>
                <circle cx="42" cy="42" r="18" stroke="white" strokeWidth="3.5" strokeOpacity="0.8" fill="none"/>
                <circle cx="36" cy="36" r="6" fill="white" fillOpacity="0.9"/>
              </svg>
            </div>
            <span className="text-sm font-semibold text-text-primary">Agnes</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
      </div>

      {/* New Chat button */}
      <div className={`px-2 pb-2 ${collapsed ? "px-1.5" : ""}`}>
        <button
          onClick={onNewChat}
          className={`w-full rounded-2xl bg-accent text-white text-sm font-medium
                     hover:bg-accent-hover active:scale-[0.98] transition-all shadow-sm
                     ${collapsed ? "p-2 flex items-center justify-center" : "px-4 py-2 flex items-center justify-center gap-2"}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Prompts link */}
      <div className={`px-2 pb-2 ${collapsed ? "px-1.5" : ""}`}>
        <button
          onClick={() => navigate("/prompts")}
          className={`w-full rounded-lg text-sm font-medium transition-all
                     ${collapsed ? "p-2 flex items-center justify-center" : "px-3 py-2 flex items-center gap-2"}
                     ${isPromptsActive
                       ? "bg-accent/10 text-accent"
                       : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                     }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          {!collapsed && <span>Prompts</span>}
        </button>
      </div>

      {/* AgnesHub link */}
      <div className={`px-2 pb-2 ${collapsed ? "px-1.5" : ""}`}>
        <button
          onClick={() => navigate("/agnes-hub/market")}
          className={`w-full rounded-lg text-sm font-medium transition-all
                     ${collapsed ? "p-2 flex items-center justify-center" : "px-3 py-2 flex items-center gap-2"}
                     ${isAgnesHubActive
                       ? "bg-accent/10 text-accent"
                       : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                     }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>
          {!collapsed && <span>AgnesHub</span>}
        </button>
      </div>

      {/* Profile link */}
      <div className={`px-2 pb-2 ${collapsed ? "px-1.5" : ""}`}>
        <button
          onClick={() => navigate("/profile")}
          className={`w-full rounded-lg text-sm font-medium transition-all
                     ${collapsed ? "p-2 flex items-center justify-center" : "px-3 py-2 flex items-center gap-2"}
                     ${isProfileActive
                       ? "bg-accent/10 text-accent"
                       : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                     }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {!collapsed && <span>Profile</span>}
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {!collapsed && groups.length === 0 && (
          <p className="text-xs text-text-tertiary text-center mt-8">No conversations yet</p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-2 py-1.5">
                {group.label}
              </div>
            )}
            {group.items.map((conv) => {
              const isActive = conversationId === conv.id;
              const isConvStreaming = streamingConvIds.has(conv.id);
              return (
                <div
                  key={conv.id}
                  className={`group/conv relative mb-0.5 transition-all duration-200
                    ${deletingId === conv.id ? "opacity-0 -translate-x-4 max-h-0 overflow-hidden" : "opacity-100 translate-x-0 max-h-20"}`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectConversation(conv.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectConversation(conv.id); }}
                    className={`w-full text-left rounded-lg transition-all relative cursor-pointer
                      ${collapsed ? "p-2 flex items-center justify-center" : "px-3 py-2 pr-8"}
                      ${isActive
                        ? "bg-accent/10 text-text-primary"
                        : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                      }`}
                  >
                    <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all
                      ${isActive ? "h-5 bg-accent" : "h-0 bg-transparent"}`} />

                    {collapsed ? (
                      <span className="text-xs font-medium">{conv.title?.[0] ?? "?"}</span>
                    ) : (
                      <div className="relative w-full overflow-hidden">
                        {/* Normal title — fades out when confirming */}
                        <div className={`transition-all duration-150 ${confirmDeleteId === conv.id ? "opacity-0 scale-95 h-0" : "opacity-100 scale-100"}`}>
                          <div className="truncate text-[13px] font-medium leading-snug">{conv.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {isConvStreaming && !isActive && (
                              <span className="flex items-center gap-1 text-[10px] text-accent">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                                Running
                              </span>
                            )}
                            <span className="text-[10px] text-text-tertiary">
                              {new Date(conv.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                        {/* Confirm row — fades in when confirming */}
                        <div className={`flex items-center gap-2 transition-all duration-150 ${confirmDeleteId === conv.id ? "opacity-100 scale-100" : "opacity-0 scale-95 h-0 pointer-events-none"}`}>
                          <span className="text-[12px] text-error font-medium">Delete?</span>
                          <button
                            ref={confirmDeleteId === conv.id ? confirmRef : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                              setDeletingId(conv.id);
                              setTimeout(() => {
                                onDeleteConversation(conv.id);
                                setDeletingId(null);
                              }, 200);
                            }}
                            className="text-[11px] font-medium text-white bg-error px-2 py-0.5 rounded-md
                                       hover:bg-error/80 transition-all"
                          >
                            Yes
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            className="text-[11px] font-medium text-text-tertiary hover:text-text-secondary transition-colors"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Delete icon — hover visible, only when not confirming */}
                  {!collapsed && confirmDeleteId !== conv.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(conv.id); }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center
                                 text-text-tertiary hover:text-error hover:bg-error-light
                                 opacity-0 group-hover/conv:opacity-100 transition-all"
                      title="Delete"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
