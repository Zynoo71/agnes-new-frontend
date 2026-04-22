import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "d68d1d67-b721-4af5-ae35-4babdcc34735";
const DEV_LANE = import.meta.env.VITE_DEV_LANE ?? "";
const APP_ID = import.meta.env.VITE_APP_ID ?? "";

function generateTraceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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
  return next(req);
};

const transport = createGrpcWebTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL || "https://agnesx-dev-sg.kiwiar.com",
  interceptors: [injectHeadersInterceptor],
});

export const agentClient = createClient(KwAgentServiceService, transport);
