import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { useUserStore } from "@/stores/userStore";
import { getBrowserTimezone } from "@/utils/timezone";

const DEV_LANE = import.meta.env.VITE_DEV_LANE ?? "";
/** 与 `agnesConversation.ts` 一致；未传时后端会拒掉 Skill Hub 等 RPC（需 x-app-id）。 */
const APP_ID = import.meta.env.VITE_APP_ID ?? "agnes";

// Prod 部署在 .env.production 把 VITE_API_BASE_URL 留空 → 这里 baseUrl 也保持空字符串，
// gRPC-Web 请求走相对路径 /<service>/<method>，由同源 nginx → envoy 完成 gRPC-Web↔gRPC 转换。
// 切勿在 fallback 里写远端绝对地址：远端只接受原生 gRPC，浏览器直连会缺 `TE: trailers`，
// 报 ConnectError "Missing :te header"。dev 由 package.json 的 cross-env 注入完整 URL。
const API_BASE_URL =
  (typeof import.meta.env.VITE_API_BASE_URL === "string" && import.meta.env.VITE_API_BASE_URL.trim()) ||
  "";

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
  const userId = useUserStore.getState().userId;
  if (userId) {
    req.header.set("x-user-id", userId);
  }
  if (DEV_LANE) {
    req.header.set("x-dev-lane", DEV_LANE);
  }
  if (APP_ID) {
    req.header.set("x-app-id", APP_ID);
  }
  const timezone = getBrowserTimezone();
  if (timezone) {
    req.header.set("x-app-timezone", timezone);
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
