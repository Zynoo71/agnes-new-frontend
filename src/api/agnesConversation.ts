const BFF_BASE_URL = import.meta.env.VITE_BFF_BASE_URL ?? "";
const BFF_TOKEN = import.meta.env.VITE_BFF_TOKEN ?? "";
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "d68d1d67-b721-4af5-ae35-4babdcc34735";
const DEV_LANE = import.meta.env.VITE_DEV_LANE ?? "";
const DEV_CREATE_CONVERSATION_PROXY_PATH = "/__dev_agnes_conversation";

interface CreateConversationResponse {
  code?: string;
  message?: string;
  data?: {
    conversation_id?: string | number;
  };
}

function requireBffToken(): string {
  if (!BFF_TOKEN) {
    throw new Error("VITE_BFF_TOKEN is required for Agnes BFF requests");
  }
  return BFF_TOKEN;
}

function isLocalDev(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
}

function resolveBffBaseUrl(): string {
  if (BFF_BASE_URL) {
    return BFF_BASE_URL;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://127.0.0.1:8201";
}

export async function createAgnesConversation(): Promise<string> {
  const devLaneHeader: Record<string, string> = DEV_LANE ? { "x-dev-lane": DEV_LANE } : {};
  const response = isLocalDev()
    ? await fetch(DEV_CREATE_CONVERSATION_PROXY_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-user-id": DEV_USER_ID,
          ...devLaneHeader,
        },
        body: "{}",
      })
    : await fetch(`${resolveBffBaseUrl()}/api/v1/agnes/conversation`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireBffToken()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-App": APP_ID,
          "x-user-id": DEV_USER_ID,
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
