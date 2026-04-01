import { useCallback } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore } from "@/stores/conversationStore";

// Read latest state inside async callbacks to avoid stale closures
const getState = () => useConversationStore.getState();

export function useChat() {
  const createConversation = useCallback(async () => {
    getState().reset();
    const reply = await agentClient.createConversation({});
    getState().setConversationId(reply.conversationId);
    return reply.conversationId;
  }, []);

  const sendMessage = useCallback(async (query: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.addUserMessage(query);
    s.startAssistantMessage();
    s.setStreaming(true);

    try {
      const stream = agentClient.chatStream({
        conversationId: s.conversationId,
        query,
        agentType: s.agentType,
      });

      for await (const event of stream) {
        getState().processEvent(event);
      }
    } catch (err) {
      console.error("ChatStream error:", err);
    } finally {
      getState().setStreaming(false);
    }
  }, []);

  const hitlResume = useCallback(async (action: "approve" | "modify", feedback?: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.resolveHumanReview();
    s.startAssistantMessage();
    s.setStreaming(true);

    try {
      const resumePayload: Record<string, unknown> = { action };
      if (action === "modify" && feedback) {
        resumePayload.feedback = feedback;
      }

      const stream = agentClient.hitlResumeStream({
        conversationId: s.conversationId,
        resumeData: new TextEncoder().encode(JSON.stringify(resumePayload)),
      });

      for await (const event of stream) {
        getState().processEvent(event);
      }
    } catch (err) {
      console.error("HitlResumeStream error:", err);
    } finally {
      getState().setStreaming(false);
    }
  }, []);

  return { createConversation, sendMessage, hitlResume };
}
