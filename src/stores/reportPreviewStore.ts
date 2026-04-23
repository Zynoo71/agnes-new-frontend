import { create } from "zustand";

interface ReportPreviewState {
  isOpen: boolean;
  title: string;
  content: string;
  reportId?: string;
  durationMs?: number;
  open: (p: { title: string; content: string; reportId?: string; durationMs?: number }) => void;
  close: () => void;
}

export const useReportPreviewStore = create<ReportPreviewState>((set) => ({
  isOpen: false,
  title: "",
  content: "",
  reportId: undefined,
  durationMs: undefined,
  open: ({ title, content, reportId, durationMs }) =>
    set({ isOpen: true, title, content, reportId, durationMs }),
  close: () => set({ isOpen: false }),
}));
