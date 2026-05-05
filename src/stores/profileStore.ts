import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { ProfileFactInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { useUserStore } from "@/stores/userStore";

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

function currentUserId(): string {
  return useUserStore.getState().userId;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  soul: [],
  identity: [],
  loading: false,
  loaded: false,

  load: async () => {
    const userId = currentUserId();
    if (!userId || get().loading) return;
    set({ loading: true });
    try {
      const [soulResp, identityResp] = await Promise.all([
        agentClient.listProfileFacts({ userId, field: "soul" }),
        agentClient.listProfileFacts({ userId, field: "identity" }),
      ]);
      set({ soul: soulResp.facts, identity: identityResp.facts, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  createFact: async (field, content) => {
    const fact = await agentClient.createProfileFact({ userId: currentUserId(), field, content });
    set((s) => ({ [field]: [...s[field], fact] }));
  },

  updateFact: async (field, factId, content) => {
    const updated = await agentClient.updateProfileFact({ userId: currentUserId(), field, factId, content });
    set((s) => ({
      [field]: s[field].map((f) => (f.id === factId ? updated : f)),
    }));
  },

  removeFact: async (field, factId) => {
    await agentClient.deleteProfileFact({ userId: currentUserId(), field, factId });
    set((s) => ({
      [field]: s[field].filter((f) => f.id !== factId),
    }));
  },
}));

// Reset + reload whenever the active user changes.
// Initial subscription call fires once with the current value — we guard against the
// no-op case (empty → empty) to avoid spurious reloads on first mount.
let previousUserId = useUserStore.getState().userId;
useUserStore.subscribe((state) => {
  if (state.userId === previousUserId) return;
  previousUserId = state.userId;
  useProfileStore.setState({ soul: [], identity: [], loaded: false });
  if (state.userId) {
    void useProfileStore.getState().load();
  }
});
