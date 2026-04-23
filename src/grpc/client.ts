import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";
import { useUserStore } from "@/stores/userStore";

const DEV_LANE = import.meta.env.VITE_DEV_LANE ?? "";
const APP_ID = import.meta.env.VITE_APP_ID ?? "";

function generateTraceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
  return next(req);
};

const transport = createGrpcWebTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "",
  interceptors: [injectHeadersInterceptor],
});

export const agentClient = createClient(KwAgentServiceService, transport);
