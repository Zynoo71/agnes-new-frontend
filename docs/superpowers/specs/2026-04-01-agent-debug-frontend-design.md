# Agent Service Debug Frontend — Design Spec

## Overview

A React frontend for debugging the `kw-agent-service` gRPC API. Covers all 7 RPC endpoints with real-time streaming visualization and an extensible tool rendering system.

## Architecture

```
React + TS + Vite (localhost:5173)
    ↓ grpc-web protocol (HTTP/1.1)
Envoy Proxy (localhost:8080)
    ↓ gRPC / HTTP2
kw-agent-service (localhost:9200)
```

## Tech Stack

| Layer      | Choice                                          |
| ---------- | ----------------------------------------------- |
| Build      | Vite                                            |
| Framework  | React 18 + TypeScript                           |
| gRPC       | @connectrpc/connect-web + @bufbuild/protobuf    |
| Styling    | Tailwind CSS + shadcn/ui                        |
| State      | Zustand                                         |
| Routing    | React Router v7                                 |
| Proxy      | Envoy (grpc-web → gRPC)                         |

## UI Design

Inspired by Claude's official website:

- Minimalist layout with generous whitespace
- Soft, warm color palette (light backgrounds, subtle borders)
- Rounded corners, clean typography
- Left sidebar navigation, right content area
- Chat bubbles: clean, no heavy borders

## Pages

### 1. Chat (core page)

- **Top bar**: `Create Conversation` button, `conversation_id` display, `agent_type` selector (super / search / research / pixa)
- **Message area**: Renders user/assistant messages
  - `MessageDelta` → incrementally assembled text bubble
  - `ToolCallStart/Result` → rendered via Tool Renderer Registry
  - `NodeStart/End` → collapsible step indicators
  - `AgentError` → red error banner
- **Input area**: Text input + file upload (FileInput: mime_type, url/data, filename)
- **Debug panel**: Collapsible raw event stream sidebar showing all `AgentStreamEvent` as JSON

### 2. Pixa

- Form for all `PixaRequest` fields: media_type, model, ratio, duration, images (URL list), count, resolution, sound
- Calls `PixaStream`
- Result area: image/video preview + streaming events

### 3. History

- Input `conversation_id` → calls `GetConversationHistory`
- Renders `ConversationTurn[]` reusing Chat message components
- Shows `is_running`, `pending_review` status badges

### 4. HITL (Human-in-the-Loop)

- Displays `interrupt_payload` content
- Action buttons: approve / modify / reject
- Calls `HitlResumeStream`, streams follow-up response

### 5. Resume

- Input `conversation_id` → calls `ResumeStream`
- Replays buffered events + continues real-time stream

### 6. Ping

- Simple health check, calls `Ping`, displays response

## Tool Renderer Registry

Extensible plugin system for rendering tool calls with custom UI and emoji.

```typescript
interface ToolRenderProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  toolCallId: string;
}

// Registry: map tool name → component
const toolRendererRegistry = new Map<string, React.FC<ToolRenderProps>>();

// Register
toolRendererRegistry.set('web_search', WebSearchToolRenderer);

// Resolve (with fallback)
const Renderer = toolRendererRegistry.get(toolName) ?? DefaultJsonRenderer;
```

- **DefaultJsonRenderer**: Collapsible JSON tree view, used as fallback for unregistered tools
- **WebSearchToolRenderer**: Search result cards with emoji decorations
- **Adding a new tool**: Write a component → register one line in registry
- Components can freely use emoji, icons, custom styling

## Project Structure

```
src/
├── gen/                  # Protobuf generated TS code (via buf)
├── grpc/                 # Connect-Web transport config
│   └── client.ts
├── pages/
│   ├── Chat/
│   │   ├── index.tsx
│   │   ├── MessageArea.tsx
│   │   └── InputBar.tsx
│   ├── Pixa/
│   │   └── index.tsx
│   ├── History/
│   │   └── index.tsx
│   ├── HITL/
│   │   └── index.tsx
│   ├── Resume/
│   │   └── index.tsx
│   └── Ping/
│       └── index.tsx
├── components/
│   ├── MessageBubble.tsx
│   ├── EventStream.tsx       # Raw event stream debug panel
│   ├── ToolRenderer/
│   │   ├── registry.ts
│   │   ├── DefaultJsonRenderer.tsx
│   │   └── renderers/       # Per-tool renderer components
│   ├── NodeSteps.tsx         # Graph node step indicators
│   └── Layout.tsx            # Sidebar + content layout
├── stores/
│   ├── conversationStore.ts
│   └── streamStore.ts
├── hooks/
│   ├── useChat.ts            # ChatStream hook
│   ├── useStream.ts          # Generic streaming hook
│   └── useConversation.ts    # Create/get conversation
├── App.tsx
└── main.tsx
```

## Envoy Configuration

Minimal `envoy.yaml` to proxy grpc-web requests from port 8080 to agent-service at port 9200. Enables CORS for local development.

## Protobuf Code Generation

Use `buf` CLI to generate TypeScript code from proto files:

- Source protos: `agnes_core/proto/kw_agent_service/v1/*.proto` and `agnes_core/proto/common/v1/*.proto`
- Output: `src/gen/`
- Plugins: `@bufbuild/protobuf` + `@connectrpc/connect`

A `buf.gen.yaml` config file at project root handles generation.

## gRPC Endpoints Coverage

| RPC                    | Method           | Page    |
| ---------------------- | ---------------- | ------- |
| Ping                   | Unary            | Ping    |
| CreateConversation     | Unary            | Chat    |
| GetConversationHistory | Unary            | History |
| ChatStream             | Server Streaming | Chat    |
| PixaStream             | Server Streaming | Pixa    |
| ResumeStream           | Server Streaming | Resume  |
| HitlResumeStream       | Server Streaming | HITL    |

## Streaming Event Handling

All streaming RPCs return `AgentStreamEvent`. The frontend processes each event type:

| Event          | Rendering                                           |
| -------------- | --------------------------------------------------- |
| AgentStart     | Show loading indicator                              |
| AgentEnd       | Complete loading, finalize message                  |
| AgentError     | Red error banner (show recoverable flag)            |
| NodeStart      | Add step to node indicator (collapsible)            |
| NodeEnd        | Mark step complete                                  |
| MessageDelta   | Append content to current message bubble            |
| ToolCallStart  | Render via Tool Renderer Registry (loading state)   |
| ToolCallResult | Update tool renderer with result                    |
| CustomEvent    | Render type + payload in debug panel                |
