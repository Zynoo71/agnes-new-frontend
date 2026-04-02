import { useState } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import type { ConvMeta } from "@/db";

interface SidebarProps {
  onNewChat: () => void;
  onSelectConversation: (id: bigint) => void;
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

export function Sidebar({ onNewChat, onSelectConversation }: SidebarProps) {
  const { conversations, conversationId } = useConversationStore();
  const [collapsed, setCollapsed] = useState(false);
  const groups = groupByDate(conversations);

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
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(BigInt(conv.id))}
                  className={`w-full text-left rounded-lg mb-0.5 transition-all relative
                    ${collapsed ? "p-2 flex items-center justify-center" : "px-3 py-2"}
                    ${isActive
                      ? "bg-accent/10 text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                >
                  {/* Active indicator bar */}
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all
                    ${isActive ? "h-5 bg-accent" : "h-0 bg-transparent"}`} />

                  {collapsed ? (
                    <span className="text-xs font-medium">{conv.title?.[0] ?? "?"}</span>
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
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
