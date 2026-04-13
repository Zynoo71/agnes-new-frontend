import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SystemPromptInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

interface SystemPromptStore {
  prompts: SystemPromptInfo[];
  loading: boolean;
  loaded: boolean;

  load: () => Promise<void>;
  create: (name: string, content: string) => Promise<SystemPromptInfo>;
  update: (id: bigint, fields: { name?: string; content?: string }) => Promise<void>;
  remove: (id: bigint) => Promise<void>;
}

export const useSystemPromptStore = create<SystemPromptStore>((set, get) => ({
  prompts: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const resp = await agentClient.listSystemPrompts({});
      set({ prompts: resp.prompts, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  create: async (name, content) => {
    const prompt = await agentClient.createSystemPrompt({ name, content });
    set((s) => ({ prompts: [prompt, ...s.prompts] }));
    return prompt;
  },

  update: async (id, fields) => {
    const updated = await agentClient.updateSystemPrompt({
      id,
      name: fields.name ?? "",
      content: fields.content ?? "",
    });
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === id ? updated : p)),
    }));
  },

  remove: async (id) => {
    await agentClient.deleteSystemPrompt({ id });
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }));
  },
}));
