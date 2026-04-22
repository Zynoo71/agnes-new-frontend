const BFF_BASE_URL = import.meta.env.VITE_BFF_BASE_URL ?? "";
const STATIC_TOKEN = import.meta.env.VITE_BFF_TOKEN ?? "";
const BFF_LOGIN_EMAIL = import.meta.env.VITE_BFF_LOGIN_EMAIL || "renhua.tian@kiwiar.com";
const BFF_LOGIN_PASSWORD = import.meta.env.VITE_BFF_LOGIN_PASSWORD || "kiwiar@2026";
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";

interface LoginResponse {
  code?: string;
  message?: string;
  data?: { access_token?: string };
}

let cached: { token: string; expiresAtMs: number } | null = null;

function parseJwtExpiry(token: string): number {
  const payload = token.split(".")[1] ?? "";
  if (!payload) return 0;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function resolveBffBaseUrl(): string {
  if (BFF_BASE_URL) return BFF_BASE_URL;
  return "https://api-agnes-dev.kiwiar.com";
}

/**
 * 获取 BFF Bearer token：
 * 1. 构建时有 VITE_BFF_TOKEN 直接用（静态注入）
 * 2. 否则自动登录 BFF 并缓存（过期前 60s 刷新）
 */
export async function getBffToken(): Promise<string> {
  if (STATIC_TOKEN) return STATIC_TOKEN;

  if (cached && cached.expiresAtMs - Date.now() > 60_000) {
    return cached.token;
  }

  const resp = await fetch(`${resolveBffBaseUrl()}/api/v1/user/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-app-id": APP_ID,
    },
    body: JSON.stringify({
      email_password: {
        email: BFF_LOGIN_EMAIL,
        password: BFF_LOGIN_PASSWORD,
      },
    }),
  });

  if (!resp.ok) {
    throw new Error(`BFF auto-login failed: HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as LoginResponse;
  const token = String(json.data?.access_token ?? "").trim();
  if (json.code !== "000000" || !token) {
    throw new Error(json.message || "BFF auto-login failed");
  }

  cached = {
    token,
    expiresAtMs: parseJwtExpiry(token) || Date.now() + 10 * 60 * 1000,
  };
  return token;
}
