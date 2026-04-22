import type { ChatAttachment } from "@/types/chatAttachment";
import { getBffToken } from "@/api/bffAuth";

const BFF_BASE_URL = import.meta.env.VITE_BFF_BASE_URL ?? "";
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";
const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "d68d1d67-b721-4af5-ae35-4babdcc34735";
const DEV_LANE = import.meta.env.VITE_DEV_LANE ?? "";
const DEV_PRESIGN_PROXY_PATH = "/__dev_chat_attachment_presign";
const DEV_UPLOAD_PROXY_PATH = "/__dev_upload_proxy";

interface PresignedUrlResponse {
  code: string;
  message: string;
  data?: {
    upload_url: string;
    public_url: string;
    required_headers?: Record<string, string>;
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

export async function uploadChatAttachment(file: File, conversationId?: string | null): Promise<ChatAttachment> {
  const mimeType = file.type || "application/octet-stream";
  const devLaneHeader: Record<string, string> = DEV_LANE ? { "x-dev-lane": DEV_LANE } : {};
  const presignedPayload: Record<string, string> = {
    purpose: "chat_attachment",
    content_type: mimeType,
    filename: file.name,
  };
  const conversationIdLiteral = conversationId?.trim();
  const presignedBody =
    conversationIdLiteral && /^\d+$/.test(conversationIdLiteral)
      ? `${JSON.stringify(presignedPayload).slice(0, -1)},"conversation_id":${conversationIdLiteral}}`
      : JSON.stringify(presignedPayload);

  const presignedResp = isLocalDev()
    ? await fetch(DEV_PRESIGN_PROXY_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-user-id": DEV_USER_ID,
          ...devLaneHeader,
        },
        body: presignedBody,
      })
    : await fetch(`${resolveBffBaseUrl()}/api/v1/file/presigned-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await getBffToken()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-app-id": APP_ID,
          ...devLaneHeader,
        },
        body: presignedBody,
      });

  if (!presignedResp.ok) {
    throw new Error(`presigned-url request failed: HTTP ${presignedResp.status}`);
  }

  const presigned = (await presignedResp.json()) as PresignedUrlResponse;
  if (presigned.code !== "000000" || !presigned.data) {
    throw new Error(presigned.message || "presigned-url request failed");
  }

  const uploadHeaders = new Headers(presigned.data.required_headers ?? {});
  if (!uploadHeaders.has("Content-Type")) {
    uploadHeaders.set("Content-Type", mimeType);
  }

  const uploadResp = isLocalDev()
    ? await fetch(DEV_UPLOAD_PROXY_PATH, {
        method: "PUT",
        headers: {
          ...Object.fromEntries(uploadHeaders.entries()),
          "X-Upload-Target": presigned.data.upload_url,
        },
        body: file,
      })
    : await fetch(presigned.data.upload_url, {
        method: "PUT",
        headers: uploadHeaders,
        body: file,
      });

  if (!uploadResp.ok) {
    throw new Error(`file upload failed: HTTP ${uploadResp.status}`);
  }

  return {
    filename: file.name,
    mimeType,
    url: presigned.data.public_url,
  };
}
