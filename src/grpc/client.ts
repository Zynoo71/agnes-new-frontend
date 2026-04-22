import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "d68d1d67-b721-4af5-ae35-4babdcc34735";
const DEV_LANE = import.meta.env.VITE_DEV_LANE ?? "";
/** 与 `agnesConversation.ts` 一致；未传时后端会拒掉 Skill Hub 等 RPC（需 x-app-id）。 */
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";

const API_BASE_URL =
  (typeof import.meta.env.VITE_API_BASE_URL === "string" && import.meta.env.VITE_API_BASE_URL.trim()) ||
  "https://agnesx-dev-sg.kiwiar.com";

function generateTraceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const ADMIN_TOKEN_STORAGE_KEY = "agnes.admin.token";

function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

const injectHeadersInterceptor: Interceptor = (next) => (req) => {
  req.header.set("x-trace-id", generateTraceId());
  if (DEV_USER_ID) {
    req.header.set("x-user-id", DEV_USER_ID);
  }
  if (DEV_LANE) {
    req.header.set("x-dev-lane", DEV_LANE);
  }
  if (APP_ID) {
    req.header.set("x-app-id", APP_ID);
  }
  // Admin RPC 用，普通 RPC 后端会忽略；登录前/登出后 localStorage 为空也无害。
  const adminToken = getAdminToken();
  if (adminToken) {
    req.header.set("x-admin-token", adminToken);
  }
  return next(req);
};

const transport = createGrpcWebTransport({
  baseUrl: API_BASE_URL,
  interceptors: [injectHeadersInterceptor],
});

export const agentClient = createClient(KwAgentServiceService, transport);
