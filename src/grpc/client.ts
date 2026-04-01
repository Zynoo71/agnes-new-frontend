import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const transport = createGrpcWebTransport({
  baseUrl: "http://localhost:8080",
});

export const agentClient = createClient(KwAgentServiceService, transport);
