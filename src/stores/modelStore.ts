import { create } from "zustand";

const LS_KEY = "agnes:llm-alias";

// Hardcoded list of accepted aliases. Empty string means "Auto" (let backend choose).
// Keep in sync with MODEL_OPTIONS in src/components/ModelSelector.tsx.
const VALID_ALIASES = new Set<string>([
  "",
  "deepseek-v4-flash",
  "agnes-1.5-flash",
  "gemini-3-flash",
  "claude-opus-4-6",
]);

function loadInitial(): string {
  try {
    const raw = localStorage.getItem(LS_KEY) ?? "";
    return VALID_ALIASES.has(raw) ? raw : "";
  } catch {
    return "";
  }
}

interface ModelStore {
  selectedAlias: string;
  setAlias: (alias: string) => void;
}

export const useModelStore = create<ModelStore>((set) => ({
  selectedAlias: loadInitial(),
  setAlias: (alias) => {
    if (!VALID_ALIASES.has(alias)) return;
    try {
      localStorage.setItem(LS_KEY, alias);
    } catch {
      // ignore storage errors (private mode etc.) — in-memory value still applies
    }
    set({ selectedAlias: alias });
  },
}));
