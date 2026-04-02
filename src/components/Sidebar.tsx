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
  const groups = groupByDate(conversations);

  return (
    <aside className="w-[260px] shrink-0 bg-surface border-r border-border-light flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium
                     hover:bg-accent-hover active:scale-[0.98] transition-all shadow-sm"
        >
          + New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 && (
          <p className="text-xs text-text-tertiary text-center mt-8">No conversations yet</p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-2 py-1.5">
              {group.label}
            </div>
            {group.items.map((conv) => {
              const isActive = conversationId !== null && String(conversationId) === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(BigInt(conv.id))}
                  className={`w-full text-left rounded-lg px-3 py-2 mb-0.5 transition-all text-sm
                    ${isActive
                      ? "bg-accent/10 text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                >
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
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
