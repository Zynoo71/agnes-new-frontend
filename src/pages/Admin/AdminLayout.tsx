import type { ReactNode } from "react";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { useShallow } from "zustand/shallow";
import { useAdminAuthStore } from "@/stores/adminAuthStore";

interface AdminLayoutProps {
  children: ReactNode;
}

const TABS = [
  { key: "pending", label: "Pending Review", path: "/admin/skills" },
  { key: "official", label: "Official Skills", path: "/admin/skills/official" },
  { key: "all", label: "All Skills", path: "/admin/skills/all" },
] as const;

export function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const { admin, initialized, logout, init, hasToken } = useAdminAuthStore(
    useShallow((s) => ({
      admin: s.admin,
      initialized: s.initialized,
      logout: s.logout,
      init: s.init,
      hasToken: s.hasToken,
    })),
  );

  useEffect(() => {
    if (!initialized) init();
  }, [initialized, init]);

  if (!initialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface text-text-tertiary text-sm">
        Loading…
      </div>
    );
  }
  if (!hasToken() || !admin) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  const handleLogout = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="h-screen flex flex-col bg-surface">
      <header className="flex items-center justify-between px-8 py-3.5 border-b border-border-light bg-surface">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-text-primary">AgnesHub Admin</h2>
          </div>
          <nav className="flex items-center gap-1">
            {TABS.map((tab) => {
              const isActive = location.pathname === tab.path;
              return (
                <button
                  key={tab.key}
                  onClick={() => navigate(tab.path)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-tertiary">
            Signed in as <span className="text-text-secondary font-medium">{admin.displayName || admin.username}</span>
          </span>
          <button
            onClick={handleLogout}
            className="text-xs text-text-secondary hover:text-text-primary px-2.5 py-1 rounded border border-border hover:bg-surface-hover transition-all"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
