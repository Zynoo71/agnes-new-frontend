import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

interface AdminPendingStore {
  items: SkillInfo[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  appId: string;
  loading: boolean;
  loaded: boolean;
  actingId: string | null;

  load: (opts?: {
    keyword?: string;
    appId?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<void>;
  approve: (skillId: string, reason?: string) => Promise<void>;
  reject: (skillId: string, reason?: string) => Promise<{ hardDeleted: boolean }>;
  invalidate: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

export const useAdminPendingStore = create<AdminPendingStore>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  keyword: "",
  appId: "",
  loading: false,
  loaded: false,
  actingId: null,

  load: async (opts) => {
    if (get().loading) return;
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? get().pageSize;
    const keyword = opts?.keyword ?? get().keyword;
    const appId = opts?.appId ?? get().appId;
    set({ loading: true });
    try {
      const resp = await agentClient.adminListPendingSkills({
        page,
        pageSize,
        keyword,
        appId,
      });
      set({
        items: resp.items,
        total: resp.total,
        page: resp.page || page,
        pageSize: resp.pageSize || pageSize,
        keyword,
        appId,
        loaded: true,
      });
    } finally {
      set({ loading: false });
    }
  },

  approve: async (skillId, reason) => {
    if (get().actingId) return;
    set({ actingId: skillId });
    try {
      await agentClient.adminApproveSkill({ skillId, reason: reason ?? "" });
      // 通过后该条从 pending 列表消失
      set((s) => ({
        items: s.items.filter((it) => it.id !== skillId),
        total: Math.max(0, s.total - 1),
      }));
    } finally {
      set({ actingId: null });
    }
  },

  reject: async (skillId, reason) => {
    if (get().actingId) return { hardDeleted: false };
    set({ actingId: skillId });
    try {
      const resp = await agentClient.adminRejectSkill({ skillId, reason: reason ?? "" });
      set((s) => ({
        items: s.items.filter((it) => it.id !== skillId),
        total: Math.max(0, s.total - 1),
      }));
      return { hardDeleted: resp.hardDeleted };
    } finally {
      set({ actingId: null });
    }
  },

  invalidate: () => set({ loaded: false }),
}));
