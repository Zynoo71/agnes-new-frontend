import { agentClient } from "@/grpc/client";
import { getBffToken } from "@/api/bffAuth";

const BFF_BASE_URL = import.meta.env.VITE_BFF_BASE_URL ?? "";
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";
const DEV_LANE = import.meta.env.VITE_DEV_LANE ?? "";
export const DEV_CREATE_CONVERSATION_PROXY_PATH = "/__dev_agnes_conversation";

interface CreateConversationResponse {
  code?: string;
  message?: string;
  data?: {
    conversation_id?: string | number;
  };
}

function isLocalDev(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
}

function resolveBffBaseUrl(): string {
  if (BFF_BASE_URL) return BFF_BASE_URL;
  return "https://api-agnes-dev.kiwiar.com";
}

export async function createAgnesConversation(): Promise<string> {
  if (isLocalDev()) {
    const { conversationId } = await agentClient.createConversation({});
    const id = String(conversationId ?? "").trim();
    if (!id || id === "0") {
      throw new Error("create conversation via gRPC returned empty id");
    }
    return id;
  }

  const devLaneHeader: Record<string, string> = DEV_LANE ? { "x-dev-lane": DEV_LANE } : {};
  const response = await fetch(`${resolveBffBaseUrl()}/api/v1/agnes/conversation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getBffToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-app-id": APP_ID,
      ...devLaneHeader,
    },
    body: "{}",
  });

  if (!response.ok) {
    throw new Error(`create conversation request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as CreateConversationResponse;
  const conversationId = String(payload.data?.conversation_id ?? "").trim();
  if (payload.code !== "000000" || !conversationId) {
    throw new Error(payload.message || "create conversation request failed");
  }

  return conversationId;
}
