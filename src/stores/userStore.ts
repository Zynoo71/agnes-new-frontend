import { create } from "zustand";

const LS_KEY = "agnes:userId";

function loadInitial(): string {
  try {
    return localStorage.getItem(LS_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

interface UserStore {
  userId: string;
  setUserId: (id: string) => void;
}

export const useUserStore = create<UserStore>((set) => ({
  userId: loadInitial(),
  setUserId: (id) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(LS_KEY, trimmed);
    } catch {
      // ignore storage errors (private mode etc.) — in-memory value still applies
    }
    set({ userId: trimmed });
  },
}));
