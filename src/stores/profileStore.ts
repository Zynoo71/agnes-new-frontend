import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { ProfileFactInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "d68d1d67-b721-4af5-ae35-4babdcc34735";

type Field = "soul" | "identity";

interface ProfileStore {
  soul: ProfileFactInfo[];
  identity: ProfileFactInfo[];
  loading: boolean;
  loaded: boolean;

  load: () => Promise<void>;
  createFact: (field: Field, content: string) => Promise<void>;
  updateFact: (field: Field, factId: number, content: string) => Promise<void>;
  removeFact: (field: Field, factId: number) => Promise<void>;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  soul: [],
  identity: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [soulResp, identityResp] = await Promise.all([
        agentClient.listProfileFacts({ userId: DEV_USER_ID, field: "soul" }),
        agentClient.listProfileFacts({ userId: DEV_USER_ID, field: "identity" }),
      ]);
      set({ soul: soulResp.facts, identity: identityResp.facts, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  createFact: async (field, content) => {
    const fact = await agentClient.createProfileFact({ userId: DEV_USER_ID, field, content });
    set((s) => ({ [field]: [...s[field], fact] }));
  },

  updateFact: async (field, factId, content) => {
    const updated = await agentClient.updateProfileFact({ userId: DEV_USER_ID, field, factId, content });
    set((s) => ({
      [field]: s[field].map((f) => (f.id === factId ? updated : f)),
    }));
  },

  removeFact: async (field, factId) => {
    await agentClient.deleteProfileFact({ userId: DEV_USER_ID, field, factId });
    set((s) => ({
      [field]: s[field].filter((f) => f.id !== factId),
    }));
  },
}));
