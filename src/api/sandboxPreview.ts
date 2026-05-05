const BFF_BASE_URL = import.meta.env.VITE_BFF_BASE_URL ?? "";

export const DEV_SANDBOX_PREVIEW_PROXY_PATH = "/__dev_agnes_sandbox_file";

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
  return "http://127.0.0.1:18080";
}

export function buildSandboxPreviewFileUrl(conversationId: string, filePath: string): string {
  const encodedPath = filePath
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");

  if (isLocalDev()) {
    return `${DEV_SANDBOX_PREVIEW_PROXY_PATH}/${encodeURIComponent(conversationId)}/${encodedPath}`;
  }

  return `${resolveBffBaseUrl()}/api/v1/agnes/conversation/sandbox-file/${encodeURIComponent(conversationId)}/${encodedPath}`;
}
