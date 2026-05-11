import { create } from "zustand";
import { agentClient, ADMIN_TOKEN_STORAGE_KEY } from "@/grpc/client";
import type { AdminInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

interface AdminAuthStore {
  admin: AdminInfo | null;
  expiresAtMs: number;
  loading: boolean;
  initialized: boolean;
  error: string;

  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasToken: () => boolean;
}

const EXPIRES_STORAGE_KEY = "agnes.admin.expiresAt";

function readToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeToken(token: string, expiresAtMs: number): void {
  try {
    if (token) {
      localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      localStorage.setItem(EXPIRES_STORAGE_KEY, String(expiresAtMs));
    } else {
      localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      localStorage.removeItem(EXPIRES_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

function readExpires(): number {
  try {
    const v = Number(localStorage.getItem(EXPIRES_STORAGE_KEY) || "0");
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export const useAdminAuthStore = create<AdminAuthStore>((set, get) => ({
  admin: null,
  expiresAtMs: 0,
  loading: false,
  initialized: false,
  error: "",

  hasToken: () => !!readToken(),

  init: async () => {
    if (get().initialized) return;
    const token = readToken();
    if (!token) {
      set({ initialized: true });
      return;
    }
    const exp = readExpires();
    if (exp > 0 && exp <= Date.now()) {
      writeToken("", 0);
      set({ initialized: true, admin: null, expiresAtMs: 0 });
      return;
    }
    set({ loading: true, expiresAtMs: exp });
    try {
      const me = await agentClient.adminMe({});
      set({ admin: me, initialized: true, error: "" });
    } catch {
      writeToken("", 0);
      set({ admin: null, expiresAtMs: 0, initialized: true });
    } finally {
      set({ loading: false });
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: "" });
    try {
      const resp = await agentClient.adminLogin({ username, password });
      const token = resp.token;
      const expMs = Number(resp.expiresAtMs);
      writeToken(token, expMs);
      set({
        admin: resp.admin ?? null,
        expiresAtMs: expMs,
        initialized: true,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const cleaned = msg.replace(/^\[\w+\]\s*/, "");
      set({ error: cleaned });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      await agentClient.adminLogout({});
    } catch {
      // 即便服务端调用失败也清本地，避免无法登出
    }
    writeToken("", 0);
    set({ admin: null, expiresAtMs: 0 });
  },
}));
