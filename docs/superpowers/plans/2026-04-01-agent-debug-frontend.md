# Agent Service Debug Frontend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React frontend for debugging all 7 kw-agent-service gRPC endpoints with streaming visualization and extensible tool rendering.

**Architecture:** React + Vite app using Connect-Web (grpc-web protocol) through Envoy proxy to reach the gRPC backend. Zustand for state, Tailwind + shadcn/ui for Claude-inspired minimal UI.

**Tech Stack:** React 18, TypeScript, Vite, @connectrpc/connect-web, @bufbuild/protobuf, Tailwind CSS, shadcn/ui, Zustand, React Router v7, Envoy

---

## File Structure

```
agnes-new-frontend/
├── buf.gen.yaml                    # Protobuf codegen config
├── envoy.yaml                      # Envoy grpc-web proxy config
├── docker-compose.yaml             # Run Envoy via Docker
├── src/
│   ├── main.tsx                    # App entry
│   ├── App.tsx                     # Routes
│   ├── index.css                   # Tailwind + Claude theme
│   ├── gen/                        # Generated protobuf TS (gitignored)
│   ├── grpc/
│   │   └── client.ts              # Connect-Web transport + client
│   ├── stores/
│   │   └── conversationStore.ts   # Zustand: conversation + messages + events
│   ├── hooks/
│   │   ├── useChat.ts             # ChatStream hook
│   │   └── usePixa.ts             # PixaStream hook
│   ├── components/
│   │   ├── Layout.tsx             # Sidebar + content shell
│   │   ├── MessageBubble.tsx      # User/assistant message display
│   │   ├── NodeSteps.tsx          # Agent graph node indicators
│   │   ├── EventStream.tsx        # Raw event JSON debug panel
│   │   └── ToolRenderer/
│   │       ├── registry.ts        # Tool renderer registry
│   │       ├── ToolCallBlock.tsx   # Wrapper: resolves renderer from registry
│   │       ├── DefaultJsonRenderer.tsx
│   │       └── renderers/
│   │           └── WebSearchRenderer.tsx
│   └── pages/
│       ├── Chat/
│       │   ├── index.tsx
│       │   ├── MessageArea.tsx
│       │   └── InputBar.tsx
│       ├── Pixa/
│       │   └── index.tsx
│       ├── History/
│       │   └── index.tsx
│       ├── HITL/
│       │   └── index.tsx
│       ├── Resume/
│       │   └── index.tsx
│       └── Ping/
│           └── index.tsx
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`

- [ ] **Step 1: Scaffold Vite project**

```bash
cd /Users/zealyoung/Code/agnes-new-frontend
npm create vite@latest . -- --template react-ts
```

Select "Ignore files and continue" if prompted about existing files.

- [ ] **Step 2: Install core dependencies**

```bash
npm install react-router zustand
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Install Connect-Web + Protobuf dependencies**

```bash
npm install @connectrpc/connect @connectrpc/connect-web @bufbuild/protobuf
npm install -D @bufbuild/buf @bufbuild/protoc-gen-es
```

- [ ] **Step 4: Add `src/gen` to `.gitignore`**

Append to `.gitignore`:

```
src/gen/
```

- [ ] **Step 5: Verify project runs**

```bash
npm run dev
```

Expected: Vite dev server starts on `http://localhost:5173`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS project with deps"
```

---

### Task 2: Tailwind + shadcn/ui + Claude Theme

**Files:**
- Modify: `src/index.css`
- Modify: `vite.config.ts`
- Create: `src/lib/utils.ts`, `components.json`

- [ ] **Step 1: Configure Tailwind in Vite**

Replace `vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Set up Tailwind CSS with Claude-inspired theme**

Replace `src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-background: #faf9f6;
  --color-surface: #ffffff;
  --color-surface-hover: #f5f4f1;
  --color-border: #e8e5e0;
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #6b6560;
  --color-text-tertiary: #9b9590;
  --color-accent: #c96442;
  --color-accent-light: #fdf0eb;
  --color-user-bubble: #f0ede8;
  --color-assistant-bubble: #ffffff;
  --color-error: #dc3545;
  --color-success: #28a745;
  --color-sidebar: #f5f4f1;
  --radius-sm: 0.375rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--color-background);
  color: var(--color-text-primary);
  margin: 0;
}
```

- [ ] **Step 3: Init shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted:
- Style: **New York**
- Base color: **Neutral**
- CSS variables: **Yes**

- [ ] **Step 4: Add shadcn/ui components we need**

```bash
npx shadcn@latest add button input textarea select card badge scroll-area sheet collapsible separator tabs
```

- [ ] **Step 5: Verify Tailwind works**

Replace `src/App.tsx`:

```tsx
function App() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <h1 className="text-2xl text-text-primary">Agent Debug Console</h1>
    </div>
  );
}

export default App;
```

Run `npm run dev` and verify the page shows styled text on a warm background.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: set up Tailwind + shadcn/ui with Claude-inspired theme"
```

---

### Task 3: Protobuf Code Generation

**Files:**
- Create: `buf.gen.yaml`
- Generated: `src/gen/` (multiple files)

- [ ] **Step 1: Create `buf.gen.yaml`**

```yaml
version: v2
plugins:
  - local: protoc-gen-es
    opt: target=ts
    out: src/gen
```

- [ ] **Step 2: Add proto generation npm script**

Add to `package.json` scripts:

```json
"proto:gen": "buf generate ../Kiwi/agnes_core/proto"
```

- [ ] **Step 3: Run code generation**

```bash
npm run proto:gen
```

Expected: Files generated in `src/gen/`:
- `src/gen/kw_agent_service/v1/kw_agent_service_pb.ts`
- `src/gen/common/v1/agent_stream_pb.ts`

- [ ] **Step 4: Verify generated types compile**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add buf.gen.yaml package.json
git commit -m "feat: add protobuf code generation with buf"
```

---

### Task 4: Envoy Proxy Configuration

**Files:**
- Create: `envoy.yaml`, `docker-compose.yaml`

- [ ] **Step 1: Create `envoy.yaml`**

```yaml
static_resources:
  listeners:
    - name: listener_0
      address:
        socket_address: { address: 0.0.0.0, port_value: 8080 }
      filter_chains:
        - filters:
            - name: envoy.filters.network.http_connection_manager
              typed_config:
                "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                codec_type: auto
                stat_prefix: ingress_http
                route_config:
                  name: local_route
                  virtual_hosts:
                    - name: local_service
                      domains: ["*"]
                      routes:
                        - match: { prefix: "/" }
                          route:
                            cluster: grpc_service
                            timeout: 0s
                            max_stream_duration:
                              grpc_timeout_header_max: 0s
                      cors:
                        allow_origin_string_match:
                          - prefix: "*"
                        allow_methods: GET, PUT, DELETE, POST, OPTIONS
                        allow_headers: keep-alive,user-agent,cache-control,content-type,content-transfer-encoding,x-accept-content-transfer-encoding,x-accept-response-streaming,x-user-agent,x-grpc-web,grpc-timeout
                        max_age: "1728000"
                        expose_headers: grpc-status,grpc-message
                http_filters:
                  - name: envoy.filters.http.grpc_web
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_web.v3.GrpcWeb
                  - name: envoy.filters.http.cors
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.cors.v3.Cors
                  - name: envoy.filters.http.router
                    typed_config:
                      "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
  clusters:
    - name: grpc_service
      type: LOGICAL_DNS
      lb_policy: ROUND_ROBIN
      typed_extension_protocol_options:
        envoy.extensions.upstreams.http.v3.HttpProtocolOptions:
          "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions
          explicit_http_config:
            http2_protocol_options: {}
      load_assignment:
        cluster_name: grpc_service
        endpoints:
          - lb_endpoints:
              - endpoint:
                  address:
                    socket_address:
                      address: host.docker.internal
                      port_value: 9200
```

- [ ] **Step 2: Create `docker-compose.yaml`**

```yaml
services:
  envoy:
    image: envoyproxy/envoy:v1.31-latest
    ports:
      - "8080:8080"
    volumes:
      - ./envoy.yaml:/etc/envoy/envoy.yaml:ro
    command: envoy -c /etc/envoy/envoy.yaml
```

- [ ] **Step 3: Add npm script for starting proxy**

Add to `package.json` scripts:

```json
"proxy": "docker compose up envoy"
```

- [ ] **Step 4: Commit**

```bash
git add envoy.yaml docker-compose.yaml package.json
git commit -m "feat: add Envoy grpc-web proxy config"
```

---

### Task 5: gRPC Client Setup

**Files:**
- Create: `src/grpc/client.ts`

- [ ] **Step 1: Create Connect-Web client**

Create `src/grpc/client.ts`:

```typescript
import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const transport = createGrpcWebTransport({
  baseUrl: "http://localhost:8080",
});

export const agentClient = createClient(KwAgentServiceService, transport);
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/grpc/
git commit -m "feat: add Connect-Web gRPC client"
```

---

### Task 6: App Shell — Layout + Routing

**Files:**
- Create: `src/components/Layout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`
- Create placeholder pages: `src/pages/Chat/index.tsx`, `src/pages/Pixa/index.tsx`, `src/pages/History/index.tsx`, `src/pages/HITL/index.tsx`, `src/pages/Resume/index.tsx`, `src/pages/Ping/index.tsx`

- [ ] **Step 1: Create Layout component**

Create `src/components/Layout.tsx`:

```tsx
import { NavLink, Outlet } from "react-router";

const navItems = [
  { to: "/", label: "Chat", icon: "💬" },
  { to: "/pixa", label: "Pixa", icon: "🎨" },
  { to: "/history", label: "History", icon: "📋" },
  { to: "/hitl", label: "HITL", icon: "👤" },
  { to: "/resume", label: "Resume", icon: "🔄" },
  { to: "/ping", label: "Ping", icon: "🏓" },
];

export function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-sidebar border-r border-border flex flex-col py-6 px-3 shrink-0">
        <h1 className="text-lg font-semibold px-3 mb-6 text-text-primary">
          Agent Debug
        </h1>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-surface text-text-primary font-medium shadow-sm"
                    : "text-text-secondary hover:bg-surface-hover"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create placeholder pages**

Create each placeholder page with the same pattern. Example `src/pages/Chat/index.tsx`:

```tsx
export default function ChatPage() {
  return (
    <div className="h-full flex items-center justify-center text-text-secondary">
      Chat — coming soon
    </div>
  );
}
```

Create the same pattern for: `Pixa/index.tsx`, `History/index.tsx`, `HITL/index.tsx`, `Resume/index.tsx`, `Ping/index.tsx` (changing the label text for each).

- [ ] **Step 3: Set up routing in App.tsx**

Replace `src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "@/components/Layout";
import ChatPage from "@/pages/Chat";
import PixaPage from "@/pages/Pixa";
import HistoryPage from "@/pages/History";
import HITLPage from "@/pages/HITL";
import ResumePage from "@/pages/Resume";
import PingPage from "@/pages/Ping";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ChatPage />} />
          <Route path="pixa" element={<PixaPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="hitl" element={<HITLPage />} />
          <Route path="resume" element={<ResumePage />} />
          <Route path="ping" element={<PingPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Update main.tsx**

Replace `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 5: Verify routing works**

Run `npm run dev`, navigate between sidebar links. Each page should show its placeholder text.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: add app shell with sidebar layout and routing"
```

---

### Task 7: Zustand Store + Stream Event Processing

**Files:**
- Create: `src/stores/conversationStore.ts`

- [ ] **Step 1: Create conversation store**

Create `src/stores/conversationStore.ts`:

```typescript
import { create } from "zustand";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

export interface ToolCallData {
  toolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
}

export interface NodeData {
  node: string;
  status: "running" | "done";
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  reasoningContent: string;
  toolCalls: ToolCallData[];
  nodes: NodeData[];
  error?: { errorType: string; message: string; recoverable: boolean };
}

export interface RawEvent {
  timestamp: number;
  type: string;
  data: unknown;
}

interface ConversationState {
  conversationId: bigint | null;
  agentType: string;
  messages: Message[];
  rawEvents: RawEvent[];
  isStreaming: boolean;

  setConversationId: (id: bigint) => void;
  setAgentType: (type: string) => void;
  setStreaming: (v: boolean) => void;
  addUserMessage: (content: string) => void;
  startAssistantMessage: () => void;
  processEvent: (event: AgentStreamEvent) => void;
  addRawEvent: (type: string, data: unknown) => void;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversationId: null,
  agentType: "search",
  messages: [],
  rawEvents: [],
  isStreaming: false,

  setConversationId: (id) => set({ conversationId: id }),
  setAgentType: (type) => set({ agentType: type }),
  setStreaming: (v) => set({ isStreaming: v }),

  addUserMessage: (content) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "user", content, reasoningContent: "", toolCalls: [], nodes: [] },
      ],
    })),

  startAssistantMessage: () =>
    set((s) => ({
      messages: [
        ...s.messages,
        { role: "assistant", content: "", reasoningContent: "", toolCalls: [], nodes: [] },
      ],
    })),

  addRawEvent: (type, data) =>
    set((s) => ({
      rawEvents: [...s.rawEvents, { timestamp: Date.now(), type, data }],
    })),

  processEvent: (event) => {
    const store = get();
    store.addRawEvent(event.event.case ?? "unknown", event.event.value);

    set((s) => {
      const messages = [...s.messages];
      const last = messages[messages.length - 1];
      if (!last || last.role !== "assistant") return s;

      const updated = { ...last };

      switch (event.event.case) {
        case "messageDelta": {
          const delta = event.event.value;
          updated.content += delta.content;
          updated.reasoningContent += delta.reasoningContent;
          break;
        }
        case "toolCallStart": {
          const tc = event.event.value;
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(new TextDecoder().decode(tc.toolInput));
          } catch {}
          updated.toolCalls = [
            ...updated.toolCalls,
            { toolCallId: tc.toolCallId, toolName: tc.toolName, toolInput: input },
          ];
          break;
        }
        case "toolCallResult": {
          const tr = event.event.value;
          let result: Record<string, unknown> = {};
          try {
            result = JSON.parse(new TextDecoder().decode(tr.toolResult));
          } catch {}
          updated.toolCalls = updated.toolCalls.map((tc) =>
            tc.toolCallId === tr.toolCallId ? { ...tc, toolResult: result } : tc
          );
          break;
        }
        case "nodeStart": {
          const ns = event.event.value;
          updated.nodes = [...updated.nodes, { node: ns.node, status: "running" }];
          break;
        }
        case "nodeEnd": {
          const ne = event.event.value;
          updated.nodes = updated.nodes.map((n) =>
            n.node === ne.node ? { ...n, status: "done" } : n
          );
          break;
        }
        case "agentError": {
          const err = event.event.value;
          updated.error = {
            errorType: err.errorType,
            message: err.message,
            recoverable: err.recoverable,
          };
          break;
        }
      }

      messages[messages.length - 1] = updated;
      return { messages };
    });
  },

  reset: () =>
    set({ conversationId: null, messages: [], rawEvents: [], isStreaming: false }),
}));
```

- [ ] **Step 2: Verify store compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/
git commit -m "feat: add conversation Zustand store with event processing"
```

---

### Task 8: Streaming Hooks

**Files:**
- Create: `src/hooks/useChat.ts`, `src/hooks/usePixa.ts`

- [ ] **Step 1: Create useChat hook**

Create `src/hooks/useChat.ts`:

```typescript
import { useCallback } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore } from "@/stores/conversationStore";

export function useChat() {
  const store = useConversationStore();

  const createConversation = useCallback(async () => {
    const reply = await agentClient.createConversation({});
    store.setConversationId(reply.conversationId);
    return reply.conversationId;
  }, [store]);

  const sendMessage = useCallback(
    async (query: string) => {
      if (!store.conversationId) return;

      store.addUserMessage(query);
      store.startAssistantMessage();
      store.setStreaming(true);

      try {
        const stream = agentClient.chatStream({
          conversationId: store.conversationId,
          query,
          agentType: store.agentType,
        });

        for await (const event of stream) {
          store.processEvent(event);
        }
      } catch (err) {
        console.error("ChatStream error:", err);
      } finally {
        store.setStreaming(false);
      }
    },
    [store]
  );

  return { createConversation, sendMessage };
}
```

- [ ] **Step 2: Create usePixa hook**

Create `src/hooks/usePixa.ts`:

```typescript
import { useCallback, useState } from "react";
import { agentClient } from "@/grpc/client";
import type { RawEvent } from "@/stores/conversationStore";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

export interface PixaParams {
  query: string;
  conversationId?: bigint;
  mediaType?: string;
  model?: string;
  ratio?: string;
  duration?: number;
  images?: string[];
  count?: number;
  resolution?: string;
  sound?: boolean;
}

export function usePixa() {
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [assistantContent, setContent] = useState("");

  const generate = useCallback(async (params: PixaParams) => {
    setEvents([]);
    setContent("");
    setStreaming(true);

    try {
      const stream = agentClient.pixaStream({
        agent: {
          conversationId: params.conversationId ?? BigInt(0),
          query: params.query,
          agentType: "pixa",
        },
        mediaType: params.mediaType ?? "",
        model: params.model ?? "",
        ratio: params.ratio ?? "",
        duration: params.duration ?? 0,
        images: params.images ?? [],
        count: params.count ?? 1,
        resolution: params.resolution ?? "",
        sound: params.sound ?? false,
      });

      for await (const event of stream) {
        setEvents((prev) => [
          ...prev,
          { timestamp: Date.now(), type: event.event.case ?? "unknown", data: event.event.value },
        ]);
        if (event.event.case === "messageDelta") {
          setContent((prev) => prev + event.event.value.content);
        }
      }
    } catch (err) {
      console.error("PixaStream error:", err);
    } finally {
      setStreaming(false);
    }
  }, []);

  return { generate, events, isStreaming, assistantContent };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/
git commit -m "feat: add useChat and usePixa streaming hooks"
```

---

### Task 9: Tool Renderer System

**Files:**
- Create: `src/components/ToolRenderer/registry.ts`, `src/components/ToolRenderer/ToolCallBlock.tsx`, `src/components/ToolRenderer/DefaultJsonRenderer.tsx`, `src/components/ToolRenderer/renderers/WebSearchRenderer.tsx`

- [ ] **Step 1: Create registry**

Create `src/components/ToolRenderer/registry.ts`:

```typescript
import type { FC } from "react";

export interface ToolRenderProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  toolCallId: string;
}

const registry = new Map<string, FC<ToolRenderProps>>();

export function registerToolRenderer(toolName: string, component: FC<ToolRenderProps>) {
  registry.set(toolName, component);
}

export function getToolRenderer(toolName: string): FC<ToolRenderProps> | undefined {
  return registry.get(toolName);
}
```

- [ ] **Step 2: Create DefaultJsonRenderer**

Create `src/components/ToolRenderer/DefaultJsonRenderer.tsx`:

```tsx
import type { ToolRenderProps } from "./registry";

export function DefaultJsonRenderer({ toolName, toolInput, toolResult }: ToolRenderProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-center gap-2 mb-2 font-medium text-text-primary">
        <span>🔧</span>
        <span>{toolName}</span>
        {!toolResult && (
          <span className="text-xs text-text-tertiary animate-pulse">running...</span>
        )}
      </div>
      <details className="group">
        <summary className="cursor-pointer text-xs text-text-tertiary hover:text-text-secondary">
          Input
        </summary>
        <pre className="mt-1 text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(toolInput, null, 2)}
        </pre>
      </details>
      {toolResult && (
        <details className="mt-2 group" open>
          <summary className="cursor-pointer text-xs text-text-tertiary hover:text-text-secondary">
            Result
          </summary>
          <pre className="mt-1 text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(toolResult, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create WebSearchRenderer (example custom renderer)**

Create `src/components/ToolRenderer/renderers/WebSearchRenderer.tsx`:

```tsx
import { registerToolRenderer, type ToolRenderProps } from "../registry";

function WebSearchRenderer({ toolInput, toolResult }: ToolRenderProps) {
  const query = (toolInput.query as string) ?? (toolInput.search_query as string) ?? "";

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex items-center gap-2 mb-2 font-medium text-text-primary">
        <span>🔍</span>
        <span>Web Search</span>
        {!toolResult && (
          <span className="text-xs text-text-tertiary animate-pulse">searching...</span>
        )}
      </div>
      {query && (
        <p className="text-text-secondary text-xs mb-2 italic">"{query}"</p>
      )}
      {toolResult && (
        <div className="space-y-2 mt-2">
          {Array.isArray(toolResult.results)
            ? toolResult.results.map((r: Record<string, unknown>, i: number) => (
                <div key={i} className="p-2 bg-background rounded text-xs">
                  <p className="font-medium text-accent">{r.title as string}</p>
                  <p className="text-text-tertiary mt-0.5 line-clamp-2">
                    {r.snippet as string}
                  </p>
                </div>
              ))
            : (
              <pre className="text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(toolResult, null, 2)}
              </pre>
            )}
        </div>
      )}
    </div>
  );
}

registerToolRenderer("web_search", WebSearchRenderer);
```

- [ ] **Step 4: Create ToolCallBlock wrapper**

Create `src/components/ToolRenderer/ToolCallBlock.tsx`:

```tsx
import type { ToolCallData } from "@/stores/conversationStore";
import { getToolRenderer } from "./registry";
import { DefaultJsonRenderer } from "./DefaultJsonRenderer";

// Import all renderers to trigger registration
import "./renderers/WebSearchRenderer";

export function ToolCallBlock({ toolName, toolInput, toolResult, toolCallId }: ToolCallData) {
  const Renderer = getToolRenderer(toolName) ?? DefaultJsonRenderer;
  return <Renderer toolName={toolName} toolInput={toolInput} toolResult={toolResult} toolCallId={toolCallId} />;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ToolRenderer/
git commit -m "feat: add extensible tool renderer registry with default + web_search renderers"
```

---

### Task 10: Shared Message Components

**Files:**
- Create: `src/components/MessageBubble.tsx`, `src/components/NodeSteps.tsx`, `src/components/EventStream.tsx`

- [ ] **Step 1: Create MessageBubble**

Create `src/components/MessageBubble.tsx`:

```tsx
import type { Message } from "@/stores/conversationStore";
import { ToolCallBlock } from "./ToolRenderer/ToolCallBlock";
import { NodeSteps } from "./NodeSteps";

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[75%] rounded-xl px-4 py-3 ${
          isUser
            ? "bg-user-bubble text-text-primary"
            : "bg-assistant-bubble border border-border text-text-primary"
        }`}
      >
        {message.nodes.length > 0 && <NodeSteps nodes={message.nodes} />}

        {message.content && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        )}

        {message.toolCalls.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.toolCalls.map((tc) => (
              <ToolCallBlock key={tc.toolCallId} {...tc} />
            ))}
          </div>
        )}

        {message.error && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md text-xs text-error">
            <span className="font-medium">⚠️ {message.error.errorType}</span>
            <p>{message.error.message}</p>
            {message.error.recoverable && (
              <span className="text-text-tertiary">(recoverable)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create NodeSteps**

Create `src/components/NodeSteps.tsx`:

```tsx
import type { NodeData } from "@/stores/conversationStore";

export function NodeSteps({ nodes }: { nodes: NodeData[] }) {
  if (nodes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {nodes.map((n, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            n.status === "running"
              ? "bg-accent-light text-accent animate-pulse"
              : "bg-green-50 text-success"
          }`}
        >
          {n.status === "running" ? "⏳" : "✅"} {n.node}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create EventStream debug panel**

Create `src/components/EventStream.tsx`:

```tsx
import type { RawEvent } from "@/stores/conversationStore";

export function EventStream({ events }: { events: RawEvent[] }) {
  return (
    <div className="h-full flex flex-col bg-surface border-l border-border">
      <div className="px-3 py-2 border-b border-border text-xs font-medium text-text-secondary">
        Raw Events ({events.length})
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {events.map((ev, i) => (
          <div key={i} className="text-xs font-mono">
            <span className="text-text-tertiary">
              {new Date(ev.timestamp).toLocaleTimeString()}
            </span>{" "}
            <span className="text-accent font-medium">{ev.type}</span>
            <pre className="ml-4 text-text-secondary whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(ev.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/MessageBubble.tsx src/components/NodeSteps.tsx src/components/EventStream.tsx
git commit -m "feat: add MessageBubble, NodeSteps, and EventStream components"
```

---

### Task 11: Chat Page

**Files:**
- Modify: `src/pages/Chat/index.tsx`
- Create: `src/pages/Chat/MessageArea.tsx`, `src/pages/Chat/InputBar.tsx`

- [ ] **Step 1: Create InputBar**

Create `src/pages/Chat/InputBar.tsx`:

```tsx
import { useState, type KeyboardEvent } from "react";

interface InputBarProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function InputBar({ onSend, disabled }: InputBarProps) {
  const [value, setValue] = useState("");

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-surface p-4">
      <div className="max-w-3xl mx-auto flex gap-2 items-end">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm
                     focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent
                     disabled:opacity-50 placeholder:text-text-tertiary"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="shrink-0 rounded-xl bg-accent text-white px-4 py-3 text-sm font-medium
                     hover:bg-accent/90 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MessageArea**

Create `src/pages/Chat/MessageArea.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { Message } from "@/stores/conversationStore";
import { MessageBubble } from "@/components/MessageBubble";

export function MessageArea({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto">
        {messages.length === 0 && (
          <div className="text-center text-text-tertiary mt-32">
            <p className="text-lg">Agent Debug Console</p>
            <p className="text-sm mt-1">Create a conversation and start chatting</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create Chat page**

Replace `src/pages/Chat/index.tsx`:

```tsx
import { useState } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useChat } from "@/hooks/useChat";
import { MessageArea } from "./MessageArea";
import { InputBar } from "./InputBar";
import { EventStream } from "@/components/EventStream";

const AGENT_TYPES = ["super", "search", "research", "pixa"] as const;

export default function ChatPage() {
  const { conversationId, agentType, messages, rawEvents, isStreaming, setAgentType } =
    useConversationStore();
  const { createConversation, sendMessage } = useChat();
  const [showEvents, setShowEvents] = useState(false);

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
          <button
            onClick={createConversation}
            className="rounded-lg bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            + New
          </button>

          {conversationId && (
            <span className="text-xs text-text-tertiary font-mono">
              conv: {conversationId.toString()}
            </span>
          )}

          <select
            value={agentType}
            onChange={(e) => setAgentType(e.target.value)}
            className="ml-auto rounded-lg border border-border bg-background px-3 py-1.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {AGENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowEvents(!showEvents)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
              showEvents
                ? "border-accent text-accent bg-accent-light"
                : "border-border text-text-secondary hover:bg-surface-hover"
            }`}
          >
            Events {rawEvents.length > 0 && `(${rawEvents.length})`}
          </button>
        </div>

        {/* Messages */}
        <MessageArea messages={messages} />

        {/* Input */}
        <InputBar onSend={sendMessage} disabled={isStreaming || !conversationId} />
      </div>

      {/* Debug panel */}
      {showEvents && (
        <div className="w-96 shrink-0">
          <EventStream events={rawEvents} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify Chat page renders**

Run `npm run dev`, navigate to `/`. Should see top bar with "New" button, agent type selector, and Events toggle.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Chat/ src/hooks/useChat.ts
git commit -m "feat: implement Chat page with streaming and debug panel"
```

---

### Task 12: Pixa Page

**Files:**
- Modify: `src/pages/Pixa/index.tsx`

- [ ] **Step 1: Implement Pixa page**

Replace `src/pages/Pixa/index.tsx`:

```tsx
import { useState } from "react";
import { usePixa, type PixaParams } from "@/hooks/usePixa";
import { EventStream } from "@/components/EventStream";

export default function PixaPage() {
  const { generate, events, isStreaming, assistantContent } = usePixa();
  const [form, setForm] = useState<PixaParams>({
    query: "",
    mediaType: "",
    model: "",
    ratio: "",
    duration: 0,
    images: [],
    count: 1,
    resolution: "",
    sound: false,
  });
  const [imageUrlInput, setImageUrlInput] = useState("");

  const update = <K extends keyof PixaParams>(key: K, val: PixaParams[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const addImage = () => {
    const url = imageUrlInput.trim();
    if (url) {
      update("images", [...(form.images ?? []), url]);
      setImageUrlInput("");
    }
  };

  const handleSubmit = () => {
    if (!form.query.trim() || isStreaming) return;
    generate(form);
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-lg font-semibold">🎨 Pixa — Image / Video Generation</h2>

          {/* Query */}
          <div>
            <label className="block text-sm font-medium mb-1">Query *</label>
            <textarea
              value={form.query}
              onChange={(e) => update("query", e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-accent/30"
              placeholder="Describe what to generate..."
            />
          </div>

          {/* Grid: media_type, model, ratio, resolution */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Media Type</label>
              <select
                value={form.mediaType}
                onChange={(e) => update("mediaType", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Auto</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              <input
                value={form.model}
                onChange={(e) => update("model", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Auto"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Ratio</label>
              <input
                value={form.ratio}
                onChange={(e) => update("ratio", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="e.g. 16:9"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Resolution</label>
              <select
                value={form.resolution}
                onChange={(e) => update("resolution", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Auto</option>
                <option value="SD">SD</option>
                <option value="HD">HD</option>
                <option value="UHD">UHD</option>
              </select>
            </div>
          </div>

          {/* Grid: duration, count, sound */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Duration (s)</label>
              <input
                type="number"
                value={form.duration}
                onChange={(e) => update("duration", Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Count</label>
              <input
                type="number"
                value={form.count}
                onChange={(e) => update("count", Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                min={1}
                max={10}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.sound}
                  onChange={(e) => update("sound", e.target.checked)}
                  className="rounded"
                />
                Sound
              </label>
            </div>
          </div>

          {/* Reference images */}
          <div>
            <label className="block text-sm font-medium mb-1">Reference Images</label>
            <div className="flex gap-2">
              <input
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder="Image URL"
              />
              <button
                onClick={addImage}
                className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-hover"
              >
                Add
              </button>
            </div>
            {form.images && form.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.images.map((url, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-xs bg-background px-2 py-1 rounded"
                  >
                    {url.slice(0, 30)}...
                    <button
                      onClick={() => update("images", form.images!.filter((_, j) => j !== i))}
                      className="text-text-tertiary hover:text-error"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isStreaming || !form.query.trim()}
            className="rounded-xl bg-accent text-white px-6 py-2.5 text-sm font-medium
                       hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {isStreaming ? "Generating..." : "Generate"}
          </button>

          {/* Result */}
          {assistantContent && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm whitespace-pre-wrap">
              {assistantContent}
            </div>
          )}
        </div>
      </div>

      {/* Events sidebar */}
      {events.length > 0 && (
        <div className="w-96 shrink-0">
          <EventStream events={events} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Pixa/
git commit -m "feat: implement Pixa page with full PixaRequest form"
```

---

### Task 13: History Page

**Files:**
- Modify: `src/pages/History/index.tsx`

- [ ] **Step 1: Implement History page**

Replace `src/pages/History/index.tsx`:

```tsx
import { useState } from "react";
import { agentClient } from "@/grpc/client";
import type { ConversationHistoryResponse } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

export default function HistoryPage() {
  const [convIdInput, setConvIdInput] = useState("");
  const [history, setHistory] = useState<ConversationHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchHistory = async () => {
    const id = Number(convIdInput);
    if (!id) return;

    setLoading(true);
    setError("");
    try {
      const resp = await agentClient.getConversationHistory({
        conversationId: BigInt(id),
      });
      setHistory(resp);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">📋 Conversation History</h2>

        <div className="flex gap-2 mb-6">
          <input
            value={convIdInput}
            onChange={(e) => setConvIdInput(e.target.value)}
            placeholder="Conversation ID"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium
                       hover:bg-accent/90 disabled:opacity-40"
          >
            {loading ? "Loading..." : "Fetch"}
          </button>
        </div>

        {error && (
          <div className="text-error text-sm mb-4 p-3 bg-red-50 rounded-lg">{error}</div>
        )}

        {history && (
          <div>
            {/* Status badges */}
            <div className="flex gap-2 mb-4">
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  history.isRunning
                    ? "bg-accent-light text-accent"
                    : "bg-green-50 text-success"
                }`}
              >
                {history.isRunning ? "⏳ Running" : "✅ Idle"}
              </span>
              {history.pendingReview && (
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-50 text-yellow-700">
                  👤 Pending Review
                </span>
              )}
            </div>

            {/* Interrupt payload */}
            {history.interruptPayload.length > 0 && (
              <details className="mb-4 rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Interrupt Payload
                </summary>
                <pre className="mt-2 text-xs overflow-x-auto whitespace-pre-wrap">
                  {new TextDecoder().decode(history.interruptPayload)}
                </pre>
              </details>
            )}

            {/* Turns */}
            <div className="space-y-4">
              {history.turns.map((turn, i) => (
                <div key={i} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-text-tertiary">
                      {turn.requestId}
                    </span>
                    <span className="text-xs text-text-tertiary">
                      {new Date(Number(turn.createdAt)).toLocaleString()}
                    </span>
                  </div>

                  {/* User blocks */}
                  {turn.user.map((block, j) => (
                    <div key={`u-${j}`} className="mb-2">
                      <span className="text-xs text-text-tertiary">user [{block.type}]</span>
                      <pre className="text-sm bg-user-bubble rounded p-2 mt-1 whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(block.data?.toJson?.() ?? block.data, null, 2)}
                      </pre>
                    </div>
                  ))}

                  {/* Assistant blocks */}
                  {turn.assistant.map((block, j) => (
                    <div key={`a-${j}`} className="mb-2">
                      <span className="text-xs text-text-tertiary">
                        assistant [{block.type}]
                        {block.toolCallId && ` tool_call_id=${block.toolCallId}`}
                      </span>
                      <pre className="text-sm bg-background rounded p-2 mt-1 whitespace-pre-wrap overflow-x-auto">
                        {JSON.stringify(block.data?.toJson?.() ?? block.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/History/
git commit -m "feat: implement History page with conversation turns viewer"
```

---

### Task 14: HITL, Resume, and Ping Pages

**Files:**
- Modify: `src/pages/HITL/index.tsx`, `src/pages/Resume/index.tsx`, `src/pages/Ping/index.tsx`

- [ ] **Step 1: Implement HITL page**

Replace `src/pages/HITL/index.tsx`:

```tsx
import { useState } from "react";
import { agentClient } from "@/grpc/client";
import type { RawEvent } from "@/stores/conversationStore";
import { EventStream } from "@/components/EventStream";

export default function HITLPage() {
  const [convIdInput, setConvIdInput] = useState("");
  const [action, setAction] = useState<"approve" | "modify" | "reject">("approve");
  const [modifyData, setModifyData] = useState("");
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [content, setContent] = useState("");

  const handleResume = async () => {
    const id = Number(convIdInput);
    if (!id || isStreaming) return;

    setEvents([]);
    setContent("");
    setStreaming(true);

    try {
      const resumePayload: Record<string, unknown> = { action };
      if (action === "modify" && modifyData) {
        try {
          Object.assign(resumePayload, JSON.parse(modifyData));
        } catch {
          resumePayload.data = modifyData;
        }
      }

      const stream = agentClient.hitlResumeStream({
        conversationId: BigInt(id),
        resumeData: new TextEncoder().encode(JSON.stringify(resumePayload)),
      });

      for await (const event of stream) {
        setEvents((prev) => [
          ...prev,
          { timestamp: Date.now(), type: event.event.case ?? "unknown", data: event.event.value },
        ]);
        if (event.event.case === "messageDelta") {
          setContent((prev) => prev + event.event.value.content);
        }
      }
    } catch (err) {
      console.error("HitlResumeStream error:", err);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-lg font-semibold">👤 Human-in-the-Loop Resume</h2>

          <input
            value={convIdInput}
            onChange={(e) => setConvIdInput(e.target.value)}
            placeholder="Conversation ID"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-accent/30"
          />

          <div className="flex gap-2">
            {(["approve", "modify", "reject"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  action === a
                    ? "bg-accent text-white"
                    : "border border-border text-text-secondary hover:bg-surface-hover"
                }`}
              >
                {a === "approve" ? "✅ " : a === "modify" ? "✏️ " : "❌ "}
                {a}
              </button>
            ))}
          </div>

          {action === "modify" && (
            <textarea
              value={modifyData}
              onChange={(e) => setModifyData(e.target.value)}
              placeholder='Modify data (JSON or text)'
              rows={4}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          )}

          <button
            onClick={handleResume}
            disabled={isStreaming || !convIdInput}
            className="rounded-xl bg-accent text-white px-6 py-2.5 text-sm font-medium
                       hover:bg-accent/90 disabled:opacity-40 transition-colors"
          >
            {isStreaming ? "Streaming..." : "Resume"}
          </button>

          {content && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm whitespace-pre-wrap">
              {content}
            </div>
          )}
        </div>
      </div>

      {events.length > 0 && (
        <div className="w-96 shrink-0">
          <EventStream events={events} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement Resume page**

Replace `src/pages/Resume/index.tsx`:

```tsx
import { useState } from "react";
import { agentClient } from "@/grpc/client";
import type { RawEvent } from "@/stores/conversationStore";
import { EventStream } from "@/components/EventStream";

export default function ResumePage() {
  const [convIdInput, setConvIdInput] = useState("");
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [content, setContent] = useState("");

  const handleResume = async () => {
    const id = Number(convIdInput);
    if (!id || isStreaming) return;

    setEvents([]);
    setContent("");
    setStreaming(true);

    try {
      const stream = agentClient.resumeStream({
        conversationId: BigInt(id),
      });

      for await (const event of stream) {
        setEvents((prev) => [
          ...prev,
          { timestamp: Date.now(), type: event.event.case ?? "unknown", data: event.event.value },
        ]);
        if (event.event.case === "messageDelta") {
          setContent((prev) => prev + event.event.value.content);
        }
      }
    } catch (err) {
      console.error("ResumeStream error:", err);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="h-full flex">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <h2 className="text-lg font-semibold">🔄 Resume Stream</h2>
          <p className="text-sm text-text-secondary">
            Reconnect to an in-progress agent stream. Replays buffered events (60s window) then continues real-time.
          </p>

          <div className="flex gap-2">
            <input
              value={convIdInput}
              onChange={(e) => setConvIdInput(e.target.value)}
              placeholder="Conversation ID"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <button
              onClick={handleResume}
              disabled={isStreaming || !convIdInput}
              className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-medium
                         hover:bg-accent/90 disabled:opacity-40"
            >
              {isStreaming ? "Streaming..." : "Resume"}
            </button>
          </div>

          {content && (
            <div className="rounded-xl border border-border bg-surface p-4 text-sm whitespace-pre-wrap">
              {content}
            </div>
          )}
        </div>
      </div>

      {events.length > 0 && (
        <div className="w-96 shrink-0">
          <EventStream events={events} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Implement Ping page**

Replace `src/pages/Ping/index.tsx`:

```tsx
import { useState } from "react";
import { agentClient } from "@/grpc/client";

export default function PingPage() {
  const [message, setMessage] = useState("hello");
  const [response, setResponse] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePing = async () => {
    setLoading(true);
    setError("");
    const start = performance.now();

    try {
      const reply = await agentClient.ping({ message });
      setLatency(Math.round(performance.now() - start));
      setResponse(reply.message);
    } catch (err) {
      setError(String(err));
      setLatency(null);
      setResponse(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-sm w-full space-y-4">
        <h2 className="text-lg font-semibold text-center">🏓 Ping</h2>

        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ping message"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-center
                     focus:outline-none focus:ring-2 focus:ring-accent/30"
        />

        <button
          onClick={handlePing}
          disabled={loading}
          className="w-full rounded-xl bg-accent text-white py-2.5 text-sm font-medium
                     hover:bg-accent/90 disabled:opacity-40 transition-colors"
        >
          {loading ? "Pinging..." : "Ping"}
        </button>

        {response !== null && (
          <div className="rounded-xl border border-border bg-surface p-4 text-center">
            <p className="text-sm text-text-primary">{response}</p>
            <p className="text-xs text-success mt-1">{latency}ms</p>
          </div>
        )}

        {error && (
          <div className="text-error text-sm text-center p-3 bg-red-50 rounded-lg">{error}</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify all pages render**

Run `npm run dev`, navigate to each page via sidebar. All should render their UI.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HITL/ src/pages/Resume/ src/pages/Ping/
git commit -m "feat: implement HITL, Resume, and Ping pages"
```
