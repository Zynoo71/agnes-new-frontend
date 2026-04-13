# System Prompt Management & Dynamic Injection

## Overview

Add frontend support for the backend's system prompt management feature. Users can create/edit/delete system prompt templates on a dedicated page, and select a prompt when starting a new conversation. The selected prompt is injected on the first message and frozen for the rest of the conversation.

## Backend Context

The backend (`agnes_core`) already provides:

- **CRUD gRPC RPCs**: `CreateSystemPrompt`, `UpdateSystemPrompt`, `DeleteSystemPrompt`, `GetSystemPrompt`, `ListSystemPrompts`
- **Proto messages**: `SystemPromptInfo` (id, app_id, name, content, created_at, updated_at), request/reply types
- **Injection**: `AgentRequest.system_prompt_id` (field 10) — agent loads the prompt from DB/Redis on the first turn, injects as `SystemMessage`, and freezes it for the conversation
- **Multi-tenancy**: All CRUD operations require `x-app-id` gRPC metadata header for tenant isolation

## Prerequisites

### 1. Regenerate Proto TypeScript

Run `buf generate` to update `src/gen/`. This brings in:

- `SystemPromptInfo`, `CreateSystemPromptRequest`, `UpdateSystemPromptRequest`, `DeleteSystemPromptRequest`, `GetSystemPromptRequest`, `ListSystemPromptsRequest`, `ListSystemPromptsResponse`, `DeleteSystemPromptReply`
- `AgentRequest.systemPromptId` (int64 field)
- Five new RPC methods on `KwAgentServiceService`

### 2. Envoy CORS

Add `x-app-id` to `allow_headers` in `envoy.yaml`. The backend's SystemPrompt CRUD operations read `x-app-id` from gRPC metadata to enforce tenant isolation.

### 3. gRPC Client Header

Add `x-app-id` to the interceptor in `src/grpc/client.ts`, read from `VITE_APP_ID` environment variable (same pattern as existing `VITE_DEV_USER_ID`).

## Feature 1: System Prompt Management Page

### Route

`/prompts` — new route in `App.tsx`, rendered inside the existing `AppLayout` (Sidebar + main area).

### Layout: Card Grid + Modal

**Main area:**
- Top bar: page title "System Prompts" + "+ New" button
- Card grid (responsive, 2-3 columns) showing all prompts
- Each card: name (bold) + content preview (2-line clamp)
- Click card to open edit modal
- Empty state when no prompts exist

**Modal (shared for create & edit):**
- Name input field
- Content textarea (resizable, generous height)
- Footer: Delete button (edit mode only, left-aligned) + Cancel + Save buttons (right-aligned)
- Create mode: empty fields, no Delete button
- Edit mode: pre-filled fields, Delete with confirmation

### Data Layer: `useSystemPromptStore`

Zustand store at `src/stores/systemPromptStore.ts`:

```typescript
interface SystemPromptStore {
  prompts: SystemPromptInfo[];
  loading: boolean;
  load: () => Promise<void>;           // ListSystemPrompts
  create: (name: string, content: string) => Promise<void>;
  update: (id: bigint, name?: string, content?: string) => Promise<void>;
  remove: (id: bigint) => Promise<void>;
}
```

- `load()` called on page mount
- After create/update/remove, optimistically update local state (no full re-fetch needed)
- gRPC calls use the shared `agentClient`

### Sidebar Entry

Add a "Prompts" navigation link at the bottom of `Sidebar.tsx` (above the collapse area). Uses `react-router` `useNavigate` + `useLocation` to highlight active state. Visible in both expanded and collapsed sidebar modes.

## Feature 2: Chat Prompt Selector

### UI: Inline Dropdown (right side of Agent Type row)

In `ChatPanel.tsx`, the Agent Type button row gets a prompt selector on the right side:

- **Component**: `SystemPromptSelector` at `src/components/SystemPromptSelector.tsx`
- **Default state**: icon + "No prompt" text (or just the icon when no prompt selected)
- **Expanded**: dropdown list of available prompts from `useSystemPromptStore`, plus a "None" option to clear
- **Selected**: shows prompt name, truncated if long
- **Reads from store**: uses `useSystemPromptStore.prompts` (triggers `load()` if empty)

### Frozen After First Message

The backend freezes the system prompt after the first turn. The frontend must reflect this:

- **Before first message sent** (conversation has no turns): selector is interactive, user can change selection freely
- **After first message sent** (conversation has turns): selector becomes **read-only**
  - Visual: slightly dimmed, no dropdown arrow, cursor changes to indicate non-interactive
  - **Hover tooltip**: shows the full prompt content as a preview popover/tooltip, so the user can still see what prompt is active
  - Cannot change the selection

**How to determine "has turns"**: check `useConversationStore` for whether the conversation has any messages/events. A new conversation with no messages is editable; once `sendMessage` completes (or streaming starts), lock the selector.

### Conversation-Level Persistence

**SQLite schema change** in `src/db/index.ts`:

Add `system_prompt_id TEXT` column to the `conversations` table. This stores the selected prompt's ID as a string (bigint serialized).

- On prompt selection change: update DB via `conversationListStore.update()`
- On conversation switch: read `system_prompt_id` from DB and set in conversation state
- The `ConvMeta` type gets an optional `systemPromptId` field

### Message Sending

In `useChat.ts`, when constructing the `AgentRequest` for `chatStream`:

```typescript
// In sendMessage / the gRPC call
create(AgentRequestSchema, {
  requestId: ...,
  conversationId: ...,
  query: ...,
  agentType: ...,
  files: ...,
  systemPromptId: selectedPromptId ? BigInt(selectedPromptId) : 0n,
})
```

Pass `systemPromptId` on every message. The backend only uses it on the first turn and ignores it afterward, so this is safe and avoids the frontend needing to track "is this the first message" for the gRPC call.

## New Files

| File | Purpose |
|------|---------|
| `src/pages/PromptManagementPage.tsx` | Management page: card grid + create/edit modal |
| `src/stores/systemPromptStore.ts` | Zustand store wrapping gRPC CRUD |
| `src/components/SystemPromptSelector.tsx` | Dropdown selector for ChatPanel |

## Modified Files

| File | Change |
|------|--------|
| `envoy.yaml` | Add `x-app-id` to CORS `allow_headers` |
| `.env` | Add `VITE_APP_ID` variable |
| `src/grpc/client.ts` | Inject `x-app-id` header in interceptor |
| `src/App.tsx` | Add `/prompts` route |
| `src/components/Sidebar.tsx` | Add "Prompts" nav link |
| `src/panels/ChatPanel.tsx` | Integrate `SystemPromptSelector` in input area |
| `src/hooks/useChat.ts` | Pass `systemPromptId` in `AgentRequest` |
| `src/db/index.ts` | Add `system_prompt_id` column to conversations table |
| `src/stores/conversationListStore.ts` | `ConvMeta` type + update logic for `systemPromptId` |
| `src/gen/` | Regenerated proto (automatic, not hand-edited) |

## Out of Scope

- Prompt versioning or history
- Prompt sharing between users/apps
- Prompt variables/templating
- Prompt categorization or tagging
- Import/export prompts
