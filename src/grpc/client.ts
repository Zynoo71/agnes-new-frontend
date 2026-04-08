import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "";

const injectUserIdInterceptor: Interceptor = (next) => (req) => {
  if (DEV_USER_ID) {
    req.header.set("x-user-id", DEV_USER_ID);
  }
  return next(req);
};

const transport = createGrpcWebTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  interceptors: [injectUserIdInterceptor],
});

export const agentClient = createClient(KwAgentServiceService, transport);
