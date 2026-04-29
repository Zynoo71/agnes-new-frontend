import type { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router";
import { useShallow } from "zustand/shallow";
import { useMySkillsStore } from "@/stores/mySkillsStore";

interface AgnesHubLayoutProps {
  rightSlot?: ReactNode;
  children: ReactNode;
}

const TABS = [
  { key: "market", label: "Market", path: "/agnes-hub/market" },
  { key: "mine", label: "My Skills", path: "/agnes-hub/mine" },
] as const;

export function AgnesHubLayout({ rightSlot, children }: AgnesHubLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const { quotaUsed, quotaLimit, mineLoaded } = useMySkillsStore(
    useShallow((s) => ({
      quotaUsed: s.quotaUsed,
      quotaLimit: s.quotaLimit,
      mineLoaded: s.loaded,
    })),
  );

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-border-light bg-surface">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-text-primary">SkillsHub</h2>
          </div>
          <nav className="flex items-center gap-1">
            {TABS.map((tab) => {
              const isActive = location.pathname === tab.path;
              const showBadge = tab.key === "mine" && mineLoaded;
              return (
                <button
                  key={tab.key}
                  onClick={() => navigate(tab.path)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all flex items-center gap-1.5
                    ${isActive
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                    }`}
                >
                  {tab.label}
                  {showBadge && (
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full
                        ${isActive ? "bg-accent text-white" : "bg-surface-hover text-text-tertiary"}`}
                    >
                      {quotaUsed}/{quotaLimit}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
        {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
      </div>

      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
