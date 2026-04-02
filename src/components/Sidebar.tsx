import { useState, useEffect, useRef } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { MODES, type Mode } from "@/App";
import type { ConvMeta } from "@/db";

interface SidebarProps {
  onNewChat: () => void;
  onSelectConversation: (id: bigint) => void;
  onDeleteConversation: (id: string) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
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

const AGENT_BADGE_COLORS: Record<string, string> = {
  search: "bg-blue-100 text-blue-700",
  super: "bg-purple-100 text-purple-700",
  research: "bg-green-100 text-green-700",
  pixa: "bg-orange-100 text-orange-700",
};

const MODE_ICONS: Record<string, JSX.Element> = {
  chat: <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />,
  pixa: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />,
  history: <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
  hitl: <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />,
  resume: <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />,
  ping: <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />,
};

export function Sidebar({ onNewChat, onSelectConversation, onDeleteConversation, mode, onModeChange }: SidebarProps) {
  const { conversations, conversationId } = useConversationStore();
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
      {/* Header: collapse toggle */}
      <div className={`flex items-center p-3 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
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
              const isActive = conversationId !== null && String(conversationId) === conv.id;
              return (
                <div
                  key={conv.id}
                  className={`group/conv relative mb-0.5 transition-all duration-200
                    ${deletingId === conv.id ? "opacity-0 -translate-x-4 max-h-0 overflow-hidden" : "opacity-100 translate-x-0 max-h-20"}`}
                >
                  <button
                    onClick={() => onSelectConversation(BigInt(conv.id))}
                    className={`w-full text-left rounded-lg transition-all relative
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
                    ) : confirmDeleteId === conv.id ? (
                      /* Inline confirm — replaces title with fade-in */
                      <div className="flex items-center gap-2 animate-message-in">
                        <span className="text-[12px] text-error font-medium">Delete?</span>
                        <button
                          ref={confirmRef}
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
                    ) : (
                      <>
                        <div className="truncate text-[13px] font-medium leading-snug">{conv.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize
                            ${AGENT_BADGE_COLORS[conv.agentType] ?? "bg-surface-hover text-text-tertiary"}`}>
                            {conv.agentType}
                          </span>
                          <span className="text-[10px] text-text-tertiary">
                            {new Date(conv.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </>
                    )}
                  </button>
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

      {/* Mode navigation */}
      <div className="border-t border-border-light px-2 py-2">
        {MODES.map((m) => {
          const isActive = mode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => onModeChange(m.value)}
              className={`w-full rounded-lg mb-0.5 transition-all flex items-center
                ${collapsed ? "p-2 justify-center" : "px-3 py-1.5 gap-2.5"}
                ${isActive
                  ? "bg-surface text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
                }`}
              title={collapsed ? m.label : undefined}
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {MODE_ICONS[m.value]}
              </svg>
              {!collapsed && <span className="text-xs font-medium">{m.label}</span>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
