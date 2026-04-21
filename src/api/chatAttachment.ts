import type { ChatAttachment } from "@/types/chatAttachment";

const BFF_BASE_URL = import.meta.env.VITE_BFF_BASE_URL ?? "";
const BFF_TOKEN = import.meta.env.VITE_BFF_TOKEN ?? "";
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";
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

function requireUploadToken(): string {
  if (!BFF_TOKEN) {
    throw new Error("VITE_BFF_TOKEN is required for chat attachment uploads");
  }
  return BFF_TOKEN;
}

/** True for loopback and typical LAN private IPv4 (RFC 1918), so dev presign/upload proxies work when opened via http://192.168.x.x:5173 etc. */
function isPrivateLanHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return true;
  }
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return false;
  }
  const nums = parts.map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = nums;
  if (a === 10) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  return false;
}

function isLocalDev(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return isPrivateLanHostname(window.location.hostname);
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

export async function uploadChatAttachment(file: File, conversationId?: string | null): Promise<ChatAttachment> {
  const mimeType = file.type || "application/octet-stream";
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
        },
        body: presignedBody,
      })
    : await fetch(`${resolveBffBaseUrl()}/api/v1/file/presigned-url`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${requireUploadToken()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-App": APP_ID,
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
