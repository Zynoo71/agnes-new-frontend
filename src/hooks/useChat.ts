import { useCallback } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore } from "@/stores/conversationStore";

export function useChat() {
  const store = useConversationStore();

  const createConversation = useCallback(async () => {
    const reply = await agentClient.createConversation({});
    store.setConversationId(reply.conversationId);
    return reply.conversationId;
  }, [store]);

  const sendMessage = useCallback(
    async (query: string) => {
      if (!store.conversationId) return;

      store.addUserMessage(query);
      store.startAssistantMessage();
      store.setStreaming(true);

      try {
        const stream = agentClient.chatStream({
          conversationId: store.conversationId,
          query,
          agentType: store.agentType,
        });

        for await (const event of stream) {
          store.processEvent(event);
        }
      } catch (err) {
        console.error("ChatStream error:", err);
      } finally {
        store.setStreaming(false);
      }
    },
    [store]
  );

  return { createConversation, sendMessage };
}
