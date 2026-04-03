import { create } from "zustand";
import {
  listConversations as dbList,
  addConversation as dbAdd,
  updateConversation as dbUpdate,
  deleteConversation as dbDelete,
  type ConvMeta,
} from "@/db";

interface ConversationListStore {
  conversations: ConvMeta[];

  load: () => void;
  add: (id: string, agentType: string) => void;
  update: (id: string, fields: Partial<Pick<ConvMeta, "title" | "agentType">>) => void;
  remove: (id: string) => void;
}

export const useConversationListStore = create<ConversationListStore>((set) => ({
  conversations: [],

  load: () => set({ conversations: dbList() }),

  add: (id, agentType) => {
    dbAdd(id, agentType);
    set({ conversations: dbList() });
  },

  update: (id, fields) => {
    dbUpdate(id, fields);
    set({ conversations: dbList() });
  },

  remove: (id) => {
    dbDelete(id);
    set({ conversations: dbList() });
  },
}));
