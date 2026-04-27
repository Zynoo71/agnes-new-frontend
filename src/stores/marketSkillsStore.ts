import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

function formatRpcError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/^\[\w+\]\s*/, "");
  }
  return String(err);
}

interface MarketSkillsStore {
  items: SkillInfo[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  source: string; // "" = all
  loading: boolean;
  loaded: boolean;
  /** 最近一次 list 失败（网络 / gRPC）；成功或重试前清空 */
  loadError: string | null;
  addingId: string | null;

  load: (opts?: {
    keyword?: string;
    source?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<void>;
  setKeyword: (keyword: string) => void;
  addToMine: (skillId: string) => Promise<void>;
  refreshOne: (skillId: string) => Promise<void>;
  invalidate: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

export const useMarketSkillsStore = create<MarketSkillsStore>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  keyword: "",
  source: "",
  loading: false,
  loaded: false,
  loadError: null,
  addingId: null,

  load: async (opts) => {
    if (get().loading) return;
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? get().pageSize;
    const keyword = opts?.keyword ?? get().keyword;
    const source = opts?.source ?? get().source;
    set({ loading: true, loadError: null });
    try {
      const resp = await agentClient.listMarketSkills({
        page,
        pageSize,
        keyword,
        source,
      });
      set({
        items: resp.items,
        total: resp.total,
        page: resp.page || page,
        pageSize: resp.pageSize || pageSize,
        keyword,
        source,
        loaded: true,
        loadError: null,
      });
    } catch (e) {
      set({ loadError: formatRpcError(e), items: [], total: 0, loaded: false });
    } finally {
      set({ loading: false });
    }
  },

  setKeyword: (keyword) => set({ keyword }),

  addToMine: async (skillId) => {
    if (get().addingId) return;
    set({ addingId: skillId });
    try {
      const resp = await agentClient.addSkillToMine({ skillId });
      const updated = resp.skill;
      if (updated) {
        set((s) => ({
          items: s.items.map((it) => (it.id === skillId ? updated : it)),
        }));
      }
      // Invalidate My Skills cache so user sees the new entry on next visit.
      // Dynamic import to avoid circular store dependency.
      const { useMySkillsStore } = await import("@/stores/mySkillsStore");
      useMySkillsStore.getState().invalidate();
    } finally {
      set({ addingId: null });
    }
  },

  refreshOne: async (skillId) => {
    const fresh = await agentClient.getSkill({ skillId });
    set((s) => ({
      items: s.items.map((it) => (it.id === skillId ? fresh : it)),
    }));
  },

  invalidate: () => set({ loaded: false }),
}));
