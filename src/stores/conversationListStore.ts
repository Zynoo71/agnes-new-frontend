import { create } from "zustand";
import {
  listConversations as dbList,
  addConversation as dbAdd,
  updateConversation as dbUpdate,
  deleteConversation as dbDelete,
  type ConvMeta,
} from "@/db";
import { useUserStore } from "@/stores/userStore";
import { useConversationStore } from "@/stores/conversationStore";

interface ConversationListStore {
  conversations: ConvMeta[];

  load: () => void;
  add: (id: string, agentType: string, systemPromptId?: string, llmAlias?: string) => void;
  update: (id: string, fields: Partial<Pick<ConvMeta, "title" | "agentType" | "systemPromptId" | "llmAlias">>) => void;
  remove: (id: string) => void;
}

function currentUserId(): string {
  return useUserStore.getState().userId;
}

export const useConversationListStore = create<ConversationListStore>((set) => ({
  conversations: [],

  load: () => set({ conversations: dbList(currentUserId()) }),

  add: (id, agentType, systemPromptId, llmAlias) => {
    const userId = currentUserId();
    if (!userId) return;
    dbAdd(userId, id, agentType, systemPromptId, llmAlias);
    set({ conversations: dbList(userId) });
  },

  update: (id, fields) => {
    const userId = currentUserId();
    if (!userId) return;
    dbUpdate(userId, id, fields);
    set({ conversations: dbList(userId) });
  },

  remove: (id) => {
    const userId = currentUserId();
    if (!userId) return;
    dbDelete(userId, id);
    set({ conversations: dbList(userId) });
  },
}));

// Whenever the active user changes: clear any currently-open conversation
// (it belongs to the previous user) and reload the sidebar list for the new one.
let previousUserId = useUserStore.getState().userId;
useUserStore.subscribe((state) => {
  if (state.userId === previousUserId) return;
  previousUserId = state.userId;
  useConversationStore.getState().reset();
  useConversationListStore.getState().load();
});
