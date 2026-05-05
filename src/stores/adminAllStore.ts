import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SkillInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

interface AdminAllStore {
  items: SkillInfo[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  appId: string;
  source: string; // "" = 全部 source；"agnes" / "github" / "gitee" / "user" 精确过滤
  loading: boolean;
  loaded: boolean;

  load: (opts?: {
    keyword?: string;
    appId?: string;
    source?: string;
    page?: number;
    pageSize?: number;
  }) => Promise<void>;
  hardDelete: (skillId: string, reason?: string) => Promise<void>;
  invalidate: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * AdminAllStore —— 跨租户列出全部 skill（含全部 source / 全部状态）。
 *
 * - 删除入口：仅 ``source ∈ {agnes, github, gitee}`` 的 skill 会暴露 Delete 按钮，
 *   实际权限由后端 ``AdminHardDeleteSkill`` 二次校验，前端只是 UX 上做提示。
 * - 不允许编辑：与 OfficialPage 的"编辑/发布"是 Round-B 的职责，All Skills 页只做
 *   "看 + 删"。
 */
export const useAdminAllStore = create<AdminAllStore>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  keyword: "",
  appId: "",
  source: "",
  loading: false,
  loaded: false,

  load: async (opts) => {
    if (get().loading) return;
    const page = opts?.page ?? 1;
    const pageSize = opts?.pageSize ?? get().pageSize;
    const keyword = opts?.keyword ?? get().keyword;
    const appId = opts?.appId ?? get().appId;
    const source = opts?.source ?? get().source;
    set({ loading: true });
    try {
      const resp = await agentClient.adminListAllSkills({
        page,
        pageSize,
        keyword,
        appId,
        source,
      });
      set({
        items: resp.items,
        total: resp.total,
        page: resp.page || page,
        pageSize: resp.pageSize || pageSize,
        keyword,
        appId,
        source,
        loaded: true,
      });
    } finally {
      set({ loading: false });
    }
  },

  hardDelete: async (skillId, reason) => {
    await agentClient.adminHardDeleteSkill({ skillId, reason: reason ?? "" });
    // 乐观本地剔除；后续 reload 会重置 total
    const remaining = get().items.filter((s) => s.id !== skillId);
    set({ items: remaining, total: Math.max(0, get().total - 1) });
  },

  invalidate: () => set({ loaded: false }),
}));
