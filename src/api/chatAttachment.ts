import type { ChatAttachment } from "@/types/chatAttachment";

const BFF_BASE_URL = import.meta.env.VITE_BFF_BASE_URL ?? "http://127.0.0.1:8201";
const BFF_TOKEN = import.meta.env.VITE_BFF_TOKEN ?? "";
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";

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

export async function uploadChatAttachment(file: File): Promise<ChatAttachment> {
  const mimeType = file.type || "application/octet-stream";
  const token = requireUploadToken();

  const presignedResp = await fetch(`${BFF_BASE_URL}/api/v1/file/presigned-url`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-App": APP_ID,
    },
    body: JSON.stringify({
      purpose: "chat_attachment",
      content_type: mimeType,
      filename: file.name,
    }),
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

  const uploadResp = await fetch(presigned.data.upload_url, {
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
