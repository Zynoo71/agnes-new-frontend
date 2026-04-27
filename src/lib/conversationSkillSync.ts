import { agentClient } from "@/grpc/client";
import {
  bumpConversationSkillHydrateEpoch,
  getConversationSkillHydrateEpoch,
} from "@/lib/conversationSkillHydrateEpoch";
import { useChatSelectedSkillsStore } from "@/stores/chatSelectedSkillsStore";
import { useConversationStore } from "@/stores/conversationStore";

/** 避免 listConversationSkillSelections 慢请求覆盖用户刚点 Done / Remove 持久化后的本地选用。 */

const lastWriteMsByConv: Record<string, number> = {};

export function markConversationSkillSelectionWritten(convId: string): void {
  lastWriteMsByConv[convId] = Date.now();
  bumpConversationSkillHydrateEpoch(convId);
}

export function shouldSkipConversationSkillHydrate(convId: string, fetchStartedAt: number): boolean {
  return (lastWriteMsByConv[convId] ?? 0) > fetchStartedAt;
}

const hydrateInflight = new Map<string, Promise<void>>();

/**
 * 从后端拉取本会话已绑定的 hub skills 并写入 chatSelectedSkillsStore。
 * - 切换会话、新建会话后由 ChatPanel / selectConversation 触发；
 * - 同一 conv 并发只发一次请求；
 * - 返回后若用户已切到其它会话则丢弃结果。
 */
export function hydrateConversationSkillsFromServer(convId: string): Promise<void> {
  if (!convId) return Promise.resolve();

  let pending = hydrateInflight.get(convId);
  if (!pending) {
    pending = (async () => {
      const startedAt = Date.now();
      const epochAtStart = bumpConversationSkillHydrateEpoch(convId);
      try {
        const resp = await agentClient.listConversationSkillSelections({
          conversationId: BigInt(convId),
        });
        if (useConversationStore.getState().conversationId !== convId) return;
        if (getConversationSkillHydrateEpoch(convId) !== epochAtStart) return;
        if (shouldSkipConversationSkillHydrate(convId, startedAt)) return;

        const local = useChatSelectedSkillsStore.getState().get(convId);
        const serverItems = resp.items.map((it) => ({
          skillId: it.skillId,
          version: it.version || "",
          name: it.name || undefined,
          summary: it.summary || undefined,
        }));
        const lastW = lastWriteMsByConv[convId] ?? 0;
        if (
          serverItems.length === 0 &&
          local.length > 0 &&
          Date.now() - lastW < 15_000
        ) {
          if (import.meta.env.DEV) {
            console.debug(
              "[conversationSkillSync] skip empty list hydrate (recent write, keep local)",
              { convId, localCount: local.length },
            );
          }
          return;
        }

        if (import.meta.env.DEV) {
          console.debug(
            "[conversationSkillSync] listConversationSkillSelections ok",
            { convId, count: serverItems.length, items: serverItems },
          );
        }
        useChatSelectedSkillsStore.getState().setForConv(convId, serverItems);
      } catch (e) {
        console.warn("[conversationSkillSync] listConversationSkillSelections failed", e);
      } finally {
        hydrateInflight.delete(convId);
      }
    })();
    hydrateInflight.set(convId, pending);
  }
  return pending;
}

/**
 * 将当前 store 中的会话选用全量写入服务端（与 Skills 弹窗 Done / 移除后一致）。
 */
export async function persistConversationSkillSelections(convId: string): Promise<void> {
  if (!convId) return;
  const list = useChatSelectedSkillsStore.getState().get(convId);
  await agentClient.setConversationSkillSelections({
    conversationId: BigInt(convId),
    selections: list.map((s) => ({
      skillId: s.skillId,
      version: s.version || "",
    })),
  });
  markConversationSkillSelectionWritten(convId);
}
