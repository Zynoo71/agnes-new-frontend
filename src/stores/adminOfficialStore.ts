import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

interface AdminOfficialStore {
  items: SkillInfo[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  appId: string;
  loading: boolean;
  loaded: boolean;
  /** create/update/publish/delete 进行中的 skill_id；纯展示用。 */
  busyId: string | null;

  load: (opts?: {
    keyword?: string;
    appId?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<void>;
  invalidate: () => void;
  reload: () => Promise<void>;

  // Admin official skill CRUD —— 与 mySkillsStore 的 create/update/publish 对称
  create: (input: {
    appId: string;
    name: string;
    summary: string;
    skillType: string;
    files: { path: string; content: string }[];
  }) => Promise<SkillInfo>;
  update: (input: {
    skillId: string;
    name: string;
    summary: string;
    files: { path: string; content: string }[];
  }) => Promise<SkillInfo>;
  publish: (skillId: string, reason?: string) => Promise<SkillInfo>;
  hardDelete: (skillId: string, reason?: string) => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * AdminOfficialStore —— 列出 ``source='agnes'`` 的官方 skill（含全部状态）+ 完整
 * CRUD（create / update / publish / delete）。
 *
 * 与 ``adminAllStore`` 的差异：本 store 专做"创建/编辑/发布"流转，``adminAllStore``
 * 仅做"全量只读 + 硬删"。
 */
export const useAdminOfficialStore = create<AdminOfficialStore>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  keyword: "",
  appId: "",
  loading: false,
  loaded: false,
  busyId: null,

  load: async (opts) => {
    if (get().loading) return;
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? get().pageSize;
    const keyword = opts?.keyword ?? get().keyword;
    const appId = opts?.appId ?? get().appId;
    set({ loading: true });
    try {
      const resp = await agentClient.adminListOfficialSkills({
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

  invalidate: () => set({ loaded: false }),

  reload: async () => {
    set({ loaded: false });
    await get().load({ page: get().page });
  },

  create: async ({ appId, name, summary, skillType, files }) => {
    set({ busyId: "__create__" });
    try {
      const resp = await agentClient.adminCreateOfficialSkill({
        appId,
        name,
        summary,
        skillType,
        files,
      });
      if (!resp.skill) throw new Error("Create returned empty skill");
      // 列表会变（新条目），下次进页面 reload
      set({ loaded: false });
      return resp.skill;
    } finally {
      set({ busyId: null });
    }
  },

  update: async ({ skillId, name, summary, files }) => {
    set({ busyId: skillId });
    try {
      const resp = await agentClient.adminUpdateOfficialSkill({
        skillId,
        name,
        summary,
        files,
      });
      if (!resp.skill) throw new Error("Update returned empty skill");
      // 局部替换
      const next = get().items.map((s) => (s.id === skillId && resp.skill ? resp.skill : s));
      set({ items: next });
      return resp.skill;
    } finally {
      set({ busyId: null });
    }
  },

  publish: async (skillId, reason) => {
    set({ busyId: skillId });
    try {
      const resp = await agentClient.adminPublishOfficialSkill({ skillId, reason: reason ?? "" });
      if (!resp.skill) throw new Error("Publish returned empty skill");
      const next = get().items.map((s) => (s.id === skillId && resp.skill ? resp.skill : s));
      set({ items: next });
      return resp.skill;
    } finally {
      set({ busyId: null });
    }
  },

  hardDelete: async (skillId, reason) => {
    set({ busyId: skillId });
    try {
      await agentClient.adminHardDeleteSkill({ skillId, reason: reason ?? "" });
      const remaining = get().items.filter((s) => s.id !== skillId);
      set({ items: remaining, total: Math.max(0, get().total - 1) });
    } finally {
      set({ busyId: null });
    }
  },
}));
