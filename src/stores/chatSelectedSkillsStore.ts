import { create } from "zustand";
import { bumpConversationSkillHydrateEpoch } from "@/lib/conversationSkillHydrateEpoch";

/**
 * 尚未有后端 `conversationId` 时（例如路由 `/chat` 且未发首条消息）选用 skills 的暂存键。
 * `createConversation()` 或首次发送前建会话时会把本键下的列表迁到真实 conv id。
 */
export const PENDING_SKILLS_CONV_ID = "__pending_skills__";

/**
 * 用户在对话页面显式选用的 hub skill。
 *
 * 对应后端 ``proto/kw_agent_service/v1/kw_agent_service.proto`` 的 ``SelectedSkill``：
 * 服务端会把这些 skill 的 SKILL.md 全文注入 system prompt 强制段，
 * references/* 与 examples/* 仍走 ``load_skill`` 渐进加载。
 *
 * ``name`` / ``summary`` 仅用于前端 chip 渲染，发请求时不会被使用。
 */
export interface ChatSkillSelection {
  skillId: string;
  version: string;
  name?: string;
  summary?: string;
}

interface ChatSelectedSkillsStore {
  /** 按 conversationId 存放当前选用列表；未出现的 conv 视为空选。 */
  byConv: Record<string, ChatSkillSelection[]>;

  get: (convId: string) => ChatSkillSelection[];
  /** 加入一个 skill；相同 skillId 已存在则保留原顺序，仅覆盖 version/meta。 */
  add: (convId: string, item: ChatSkillSelection) => void;
  /** 切换指定 skill 的版本。 */
  setVersion: (convId: string, skillId: string, version: string) => void;
  /** 移除一个 skill。 */
  remove: (convId: string, skillId: string) => void;
  /** 清空某个 conversation 的全部选项（新建对话或退出聊天时调用）。 */
  clear: (convId: string) => void;
  /** 全量替换某个 conversation 的列表（用于编辑器 / 批量操作）。 */
  setForConv: (convId: string, items: ChatSkillSelection[]) => void;
}

export const useChatSelectedSkillsStore = create<ChatSelectedSkillsStore>((set, get) => ({
  byConv: {},

  get: (convId) => get().byConv[convId] ?? [],

  add: (convId, item) => {
    if (!convId || !item.skillId) return;
    bumpConversationSkillHydrateEpoch(convId);
    set((s) => {
      const existing = s.byConv[convId] ?? [];
      const idx = existing.findIndex((it) => it.skillId === item.skillId);
      const next = [...existing];
      if (idx >= 0) {
        next[idx] = { ...next[idx], ...item };
      } else {
        next.push(item);
      }
      return { byConv: { ...s.byConv, [convId]: next } };
    });
  },

  setVersion: (convId, skillId, version) => {
    if (!convId || !skillId) return;
    bumpConversationSkillHydrateEpoch(convId);
    set((s) => {
      const existing = s.byConv[convId];
      if (!existing) return s;
      const next = existing.map((it) =>
        it.skillId === skillId ? { ...it, version } : it,
      );
      return { byConv: { ...s.byConv, [convId]: next } };
    });
  },

  remove: (convId, skillId) => {
    if (!convId || !skillId) return;
    bumpConversationSkillHydrateEpoch(convId);
    set((s) => {
      const existing = s.byConv[convId];
      if (!existing || existing.length === 0) return s;
      const next = existing.filter((it) => it.skillId !== skillId);
      if (next.length === existing.length) return s;
      return { byConv: { ...s.byConv, [convId]: next } };
    });
  },

  clear: (convId) => {
    if (!convId) return;
    set((s) => {
      if (!(convId in s.byConv)) return s;
      const next = { ...s.byConv };
      delete next[convId];
      return { byConv: next };
    });
  },

  setForConv: (convId, items) => {
    if (!convId) return;
    set((s) => ({ byConv: { ...s.byConv, [convId]: items } }));
  },
}));
