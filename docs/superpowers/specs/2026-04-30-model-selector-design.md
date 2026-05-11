# Model Selector — Per-Conversation LLM Choice

## Overview

Let the user pick which LLM the agent uses for a new conversation via a dropdown in the chat input toolbar. The choice is locked at conversation creation: subsequent messages in the same conversation always use the originally selected model. The user's last selection is remembered as the default for the next new conversation.

## Backend Context

`agnes_core` will add a new field on `AgentRequest`:

```proto
// kw_agent_service/v1/kw_agent_service.proto
string llm_alias = 8;   // empty = Auto, agent picks
```

Field number `8` (or next free), assigned by backend owner. After the proto change, run `npm run proto:gen` in this repo to regenerate `src/gen/**`. The generated TS field is `llmAlias` (camelCase, automatic).

**Note:** the existing `model_override` field (field 7) is unrelated and stays as-is. This spec uses the new `llm_alias` field exclusively.

No `ListModels` RPC is needed — the option list is hardcoded on the frontend.

## Prerequisites

1. Backend adds `string llm_alias = 8;` to `AgentRequest` in `agnes_core/proto/kw_agent_service/v1/kw_agent_service.proto`.
2. Frontend runs `npm run proto:gen` to regenerate `src/gen/kw_agent_service/v1/kw_agent_service_pb.ts`.
3. Backend implements alias → model resolution (out of scope for this spec).

## Model Options

Hardcoded in the frontend, single source of truth in `ModelSelector.tsx`:

| Display Label       | `llmAlias` value      |
| ------------------- | --------------------- |
| Auto（默认）         | `""` (empty string)   |
| DeepSeek V4 Flash   | `deepseek-v4-flash`   |
| Agnes 1.5 Flash     | `agnes-1.5-flash`     |
| Gemini 3 Flash      | `gemini-3-flash`      |
| Claude Opus 4.6     | `claude-opus-4-6`     |

`Auto` sends an empty string, semantically "let backend choose."

## Architecture

### State (Zustand stores)

**`src/stores/modelStore.ts` (new)** — global "user's last choice" preference.

```ts
interface ModelStore {
  selectedAlias: string;          // "" = Auto, otherwise one of the 4 alias strings
  setAlias: (alias: string) => void;
}
```

- Persistence: localStorage under key `agnes:llm-alias`.
- Initial value: read from localStorage; if missing, default to `""` (Auto).
- This store is **only** used as the default when a new conversation has not been created yet.

**`src/db/index.ts` (existing, extend)** — sql.js conversations table holds `ConvMeta`.

- Add `llmAlias: string | null` to the `ConvMeta` interface.
- In `initDb()` add an idempotent migration after the existing `system_prompt_id` migration:
  ```ts
  if (!hasColumn("llm_alias")) {
    db.run("ALTER TABLE conversations ADD COLUMN llm_alias TEXT");
  }
  ```
- Update `addConversation` signature to optionally accept `llmAlias`, and include it in the INSERT.
- Update `updateConversation`'s `fields` type and SET-clause builder to handle `llmAlias`.
- Update `listConversations` to read column index for `llm_alias` into the returned `ConvMeta`.

**`src/stores/conversationListStore.ts` (existing, extend)** — surface the new field.

- Extend `add` signature: accept optional `llmAlias` and pass through to `dbAdd`.
- Extend `update`'s `fields` type: add `"llmAlias"` to the `Pick<ConvMeta, ...>` set so callers can patch it.

### Lookup function

```ts
function resolveAliasForConv(convId: string | null): string {
  if (!convId) return modelStore.getState().selectedAlias;
  const conv = useConversationListStore
    .getState()
    .conversations.find((c) => c.id === convId);
  return conv?.llmAlias ?? modelStore.getState().selectedAlias;
}
```

(`useConversationListStore.conversations` is reloaded from sql.js on every mutation via `load()`, so the find always sees the latest persisted row.)

Use this everywhere a `chatStream` request is built.

### UI

**`src/components/ModelSelector.tsx` (new)** — dropdown component, visual style matches existing `SystemPromptSelector.tsx`.

Props (mirroring `SystemPromptSelector`):
- `selectedAlias: string` — current value to display
- `onChange: (alias: string) => void` — called when user picks an option
- `disabled: boolean` — true after first user message sent

Internals:
- Hardcoded `MODEL_OPTIONS` array at top of file.
- Renders dropdown showing the label for `selectedAlias`. When `selectedAlias === ""`, shows `Auto`.

**Wiring in `ChatPanel.tsx`** (mirror the `SystemPromptSelector` block at lines 852-861):

```tsx
<ModelSelector
  selectedAlias={resolveAliasForConv(conversationId) /* or read directly from store */}
  onChange={(alias) => {
    useModelStore.getState().setAlias(alias);
    if (conversationId) {
      useConversationListStore.getState().update(conversationId, { llmAlias: alias });
    }
  }}
  disabled={hasUserMessages}
/>
```

**Lock semantics** — `disabled={hasUserMessages}` matches the existing `SystemPromptSelector` pattern: dropdown is editable in a brand-new conv and even after `convId` is created (DB row exists), but disabled the moment the first user message has been sent. While editable, every change updates BOTH the global `modelStore` (so it becomes the default for the next new conv) AND the DB row (so subsequent reads via `resolveAliasForConv` return the latest pick).

**Placement** — `src/panels/ChatPanel.tsx`, input toolbar:

```
[agent type pills] [SystemPromptSelector] [ModelSelector] ........ [Send]
                                          ↑ insert here
```

Same row as `SystemPromptSelector`, immediately to its right.

### Wiring `useChat`

`src/hooks/useChat.ts` — only `chatStream` carries `llmAlias`. `resumeStream` / `editResendStream` / `regenerateStream` proto messages do not have an `llm_alias` field; backend resolves the model from conversation state for those flows.

**At conversation creation** (existing line 502, inside `createConversation`) — pass the current `modelStore` selection into `add` so the DB row starts in sync with the dropdown:

```ts
useConversationListStore.getState().add(
  id,
  getState().agentType,
  getState().systemPromptId ?? undefined,
  useModelStore.getState().selectedAlias,   // NEW
);
```

**At every chatStream request** — read via `resolveAliasForConv` so the request always carries whatever value is currently locked on the conv:

```ts
const llmAlias = resolveAliasForConv(convId);
const req = {
  conversationId: BigInt(convId),
  query,
  agentType: s.agentType,
  files: [...],
  systemPromptId: s.systemPromptId ? BigInt(...) : 0n,
  extraContext,
  selectedSkills: [...],
  billingEnabled,
  llmAlias,                              // NEW
};
```

**Mid-life updates** are handled by the `ModelSelector`'s `onChange` (in `ChatPanel.tsx`) calling `update(convId, { llmAlias })`. Once `hasUserMessages` flips true, the dropdown is `disabled` and no further updates occur — the value is effectively locked.

## Data Flow

```
[User picks model in dropdown (blank /chat)]
   └─→ modelStore.setAlias("claude-opus-4-6")
        └─→ localStorage["agnes:llm-alias"] = "claude-opus-4-6"

[User clicks "New Chat"]
   └─→ createConversation()
        └─→ addConversation(userId, convId, agentType, systemPromptId, "claude-opus-4-6")
              (DB row created with current modelStore value)

[User changes dropdown before first message]
   └─→ ModelSelector onChange("gemini-3-flash")
        ├─→ modelStore.setAlias("gemini-3-flash") → localStorage updated
        └─→ conversationListStore.update(convId, {llmAlias: "gemini-3-flash"})
              (DB row patched, future reads see "gemini-3-flash")

[User sends first message]
   └─→ useChat.sendMessage()
        ├─→ resolveAliasForConv(convId) = "gemini-3-flash" (latest DB row value)
        └─→ chatStream({..., llmAlias: "gemini-3-flash"})
   └─→ hasUserMessages → true → dropdown becomes disabled

[User sends 2nd message in same conv]
   └─→ resolveAliasForConv(convId) = "gemini-3-flash" (still in DB)
   └─→ chatStream({..., llmAlias: "gemini-3-flash"})

[User opens existing conv from sidebar]
   └─→ ModelSelector shows conv's locked label, disabled (hasUserMessages=true)

[User opens new /chat]
   └─→ ModelSelector reads modelStore.selectedAlias = "gemini-3-flash" (last pick), enabled
```

## Files Changed

**New:**
- `src/stores/modelStore.ts`
- `src/components/ModelSelector.tsx`

**Modified:**
- `src/db/index.ts` — extend `ConvMeta`, add `llm_alias TEXT` column with idempotent migration, thread `llmAlias` through `addConversation` / `updateConversation` / `listConversations`.
- `src/stores/conversationListStore.ts` — extend `update` field whitelist to include `llmAlias`.
- `src/hooks/useChat.ts` — add `resolveAliasForConv` helper; wire `llmAlias` into the `chatStream` request constructor; pass `llmAlias` to `add()` at conv creation.
- `src/panels/ChatPanel.tsx` — render `<ModelSelector convId={convId} />` in input toolbar next to `SystemPromptSelector`.

**Auto-regenerated (do not hand-edit):**
- `src/gen/kw_agent_service/v1/kw_agent_service_pb.ts` — picks up the new `llmAlias` field after `npm run proto:gen`.

## Out of Scope (YAGNI)

- Mid-conversation model switching (deliberately disallowed by lock semantics)
- Per-model UI badges, pricing display, model metadata
- Backend `ListModels` RPC (list is hardcoded; product can change models with a frontend release)
- Server-side persistence of user model preference (localStorage is sufficient)
- Showing model used per-message in the transcript

## Verification

No test runner is configured in this repo. Verification is build + manual smoke test.

1. `npm run build` — `tsc -b` strict mode + `noUnusedLocals` must pass.
2. `npm run lint` — ESLint must pass.
3. Manual smoke test (`npm run dev`):
   - Empty `/chat`: dropdown shows `Auto`, opens to 5 options.
   - Pick a model, refresh page → dropdown still shows the same selection (localStorage round-trip).
   - Send first message → after success, dropdown becomes disabled and shows the chosen model.
   - Open new `/chat` in another tab → dropdown defaults to last picked model.
   - Open original locked conv → dropdown shows that conv's locked model, disabled.
   - In a locked conv, send a follow-up message → check Network tab: `chatStream` request payload contains the conv's locked `llmAlias`.
   - Pick `Auto` and send → request contains empty `llmAlias`, backend handles default path.
4. Proto integration: only after `agnes_core` adds `llm_alias` field and `npm run proto:gen` runs successfully in this repo.
