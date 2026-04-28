import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useShallow } from "zustand/shallow";
import { useAdminAuthStore } from "@/stores/adminAuthStore";

export function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromPath = (location.state as { from?: string } | null)?.from || "/admin/skills";

  const { login, loading, error, hasToken, init, initialized } = useAdminAuthStore(
    useShallow((s) => ({
      login: s.login,
      loading: s.loading,
      error: s.error,
      hasToken: s.hasToken,
      init: s.init,
      initialized: s.initialized,
    })),
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!initialized) init();
  }, [initialized, init]);

  useEffect(() => {
    if (initialized && hasToken()) {
      navigate(fromPath, { replace: true });
    }
  }, [initialized, hasToken, navigate, fromPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || loading) return;
    try {
      await login(username, password);
      navigate(fromPath, { replace: true });
    } catch {
      // 错误已经放到 store.error 里
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-surface">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 shadow-sm flex flex-col gap-5"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-text-primary">SkillsHub Admin</h1>
          <p className="text-xs text-text-tertiary">Sign in to review and manage skills.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-text-secondary font-medium">Username</label>
          <input
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-accent transition-colors bg-surface"
            placeholder="admin"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-text-secondary font-medium">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:border-accent transition-colors bg-surface"
            placeholder="••••"
          />
        </div>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="px-4 py-2.5 text-sm font-medium rounded-lg bg-accent text-white
                     hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all
                     flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
          )}
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
