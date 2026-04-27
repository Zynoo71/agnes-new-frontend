import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SkillSource } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

interface SkillSourcesStore {
  items: SkillSource[];
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useSkillSourcesStore = create<SkillSourcesStore>((set, get) => ({
  items: [],
  loading: false,
  loaded: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true });
    try {
      // 加载全部，前端再按 enabled 区分
      const resp = await agentClient.listSkillSources({ onlyEnabled: false });
      set({ items: resp.items, loaded: true });
    } finally {
      set({ loading: false });
    }
  },
}));
