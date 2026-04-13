import { create } from "zustand";

interface LocalSlidePreviewState {
  isOpen: boolean;
  conversationId: string;
  fallbackOutline: Record<string, unknown> | null;
  initialSlideId: string;
  open: (conversationId: string, fallbackOutline?: Record<string, unknown> | null, initialSlideId?: string) => void;
  close: () => void;
}

export const useLocalSlidePreviewStore = create<LocalSlidePreviewState>((set) => ({
  isOpen: false,
  conversationId: "",
  fallbackOutline: null,
  initialSlideId: "",
  open: (conversationId, fallbackOutline = null, initialSlideId = "") =>
    set({ isOpen: true, conversationId, fallbackOutline, initialSlideId }),
  close: () =>
    set({ isOpen: false, conversationId: "", fallbackOutline: null, initialSlideId: "" }),
}));
