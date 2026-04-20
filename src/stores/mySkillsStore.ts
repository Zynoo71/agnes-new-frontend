import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

export interface CreateSkillFile {
  path: string;
  content: string;
}

interface MySkillsStore {
  items: SkillInfo[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  relation: string; // "" = all
  quotaUsed: number;
  quotaLimit: number;
  loading: boolean;
  loaded: boolean;
  removingId: string | null;
  creating: boolean;

  load: (opts?: {
    keyword?: string;
    relation?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<void>;
  remove: (skillId: string) => Promise<void>;
  create: (input: {
    name: string;
    summary: string;
    skillType: string;
    files: CreateSkillFile[];
  }) => Promise<SkillInfo>;
  update: (input: {
    skillId: string;
    name: string;
    summary: string;
    files: CreateSkillFile[];
  }) => Promise<SkillInfo>;
  publish: (skillId: string) => Promise<{ skill: SkillInfo | undefined; needsApproval: boolean }>;
  invalidate: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

export const useMySkillsStore = create<MySkillsStore>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  keyword: "",
  relation: "",
  quotaUsed: 0,
  quotaLimit: 30,
  loading: false,
  loaded: false,
  removingId: null,
  creating: false,

  load: async (opts) => {
    if (get().loading) return;
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? get().pageSize;
    const keyword = opts?.keyword ?? get().keyword;
    const relation = opts?.relation ?? get().relation;
    set({ loading: true });
    try {
      const resp = await agentClient.listMySkills({
        page,
        pageSize,
        keyword,
        relation,
      });
      set({
        items: resp.items,
        total: resp.total,
        page: resp.page || page,
        pageSize: resp.pageSize || pageSize,
        keyword,
        relation,
        quotaUsed: resp.quotaUsed,
        quotaLimit: resp.quotaLimit,
        loaded: true,
      });
    } finally {
      set({ loading: false });
    }
  },

  remove: async (skillId) => {
    if (get().removingId) return;
    set({ removingId: skillId });
    try {
      await agentClient.removeSkillFromMine({ skillId });
      // Optimistic local update; reload in background to keep total/quota fresh
      set((s) => ({
        items: s.items.filter((it) => it.id !== skillId),
        total: Math.max(0, s.total - 1),
        quotaUsed: Math.max(0, s.quotaUsed - 1),
      }));
      // 后端对 owner 的 remove 等同硬删（skill 整体消失），所以让市场列表失效，
      // 下次切回 Market 页会自动 reload。非 owner 场景下市场本身没变化，重拉一次
      // 也只是浪费一次 round-trip，可以接受。
      const { useMarketSkillsStore } = await import("@/stores/marketSkillsStore");
      useMarketSkillsStore.getState().invalidate();
    } finally {
      set({ removingId: null });
    }
  },

  create: async ({ name, summary, skillType, files }) => {
    if (get().creating) {
      throw new Error("Another create is in progress");
    }
    set({ creating: true });
    try {
      const resp = await agentClient.createSkill({
        name,
        summary,
        skillType,
        files,
      });
      if (!resp.skill) {
        throw new Error("Server did not return skill info");
      }
      // 创建成功 → 让 My Skills 与 Market 都重新拉一次（quota / 列表都会变）
      set({ loaded: false });
      const { useMarketSkillsStore } = await import("@/stores/marketSkillsStore");
      useMarketSkillsStore.getState().invalidate();
      await get().load({ page: 1 });
      return resp.skill;
    } finally {
      set({ creating: false });
    }
  },

  update: async ({ skillId, name, summary, files }) => {
    if (get().creating) {
      throw new Error("Another save is in progress");
    }
    set({ creating: true });
    try {
      const resp = await agentClient.updateSkill({
        skillId,
        name,
        summary,
        files,
      });
      if (!resp.skill) {
        throw new Error("Server did not return skill info");
      }
      // 编辑会让 skill 退回 draft → 市场列表可能少一条；两边都失效
      const { useMarketSkillsStore } = await import("@/stores/marketSkillsStore");
      useMarketSkillsStore.getState().invalidate();
      set({ loaded: false });
      await get().load({ page: get().page });
      return resp.skill;
    } finally {
      set({ creating: false });
    }
  },

  publish: async (skillId) => {
    const resp = await agentClient.publishSkill({ skillId });
    // 发布成功后市场可见性 / approval status 变了 → 失效市场缓存，刷新 my
    const { useMarketSkillsStore } = await import("@/stores/marketSkillsStore");
    useMarketSkillsStore.getState().invalidate();
    set({ loaded: false });
    await get().load({ page: get().page });
    return { skill: resp.skill, needsApproval: resp.needsApproval };
  },

  invalidate: () => set({ loaded: false }),
}));
