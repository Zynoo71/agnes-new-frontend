import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const transport = createGrpcWebTransport({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080",
});

export const agentClient = createClient(KwAgentServiceService, transport);
