import { create } from "zustand";

const LS_KEY = "agnes:userId";

// Header-safe subset: ASCII letters, digits, dot, underscore, hyphen.
// Rules out spaces, CJK, and anything that would need URL-/header-encoding
// downstream (x-user-id is propagated to gRPC metadata and trace logs).
export const USER_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function isValidUserId(value: string): boolean {
  return USER_ID_PATTERN.test(value);
}

function loadInitial(): string {
  try {
    const raw = localStorage.getItem(LS_KEY)?.trim() ?? "";
    return isValidUserId(raw) ? raw : "";
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
    if (!isValidUserId(trimmed)) return;
    try {
      localStorage.setItem(LS_KEY, trimmed);
    } catch {
      // ignore storage errors (private mode etc.) — in-memory value still applies
    }
    set({ userId: trimmed });
  },
}));
