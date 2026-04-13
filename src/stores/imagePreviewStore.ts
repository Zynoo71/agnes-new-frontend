import { create } from "zustand";

interface ImagePreviewState {
  isOpen: boolean;
  src: string;
  alt: string;
  open: (src: string, alt?: string) => void;
  close: () => void;
}

export const useImagePreviewStore = create<ImagePreviewState>((set) => ({
  isOpen: false,
  src: "",
  alt: "",
  open: (src, alt = "") => set({ isOpen: true, src, alt }),
  close: () => set({ isOpen: false }),
}));
