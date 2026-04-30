# Model Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-conversation LLM model selector dropdown in the chat input toolbar. Selection is editable until the first user message is sent, then locked. Last pick is remembered as the default for the next new conversation.

**Architecture:**
- New Zustand store `modelStore` (localStorage-backed) for the user's "last pick" default.
- Per-conversation locked value persisted as a new column `llm_alias` on the existing sql.js `conversations` table; surfaced via the existing `conversationListStore`.
- `chatStream` request carries `llmAlias`. `resumeStream` / `editResendStream` / `regenerateStream` do **not** carry it (their proto messages have no such field; backend resolves from conversation state).

**Tech Stack:** React 19 + TypeScript (strict, `verbatimModuleSyntax: true`), Zustand, sql.js, Tailwind v4, Connect-ES gRPC client. Path alias `@/*` → `src/*`.

**Verification model (no test runner in this repo):** Each task ends with `npm run build` (TS strict + `tsc -b` gates Vite build) and, where UI changes, a manual browser smoke check via `npm run dev`. There is no test runner — do not attempt to add one for this feature.

**Spec:** `docs/superpowers/specs/2026-04-30-model-selector-design.md`

---

## Task 1: Extend `src/db/index.ts` with `llm_alias` column

**Files:**
- Modify: `src/db/index.ts:3-10` (ConvMeta interface)
- Modify: `src/db/index.ts:73-93` (table create + migration)
- Modify: `src/db/index.ts:96-104` (addConversation signature + INSERT)
- Modify: `src/db/index.ts:106-120` (updateConversation field map)
- Modify: `src/db/index.ts:126-144` (listConversations SELECT + row map)

- [ ] **Step 1: Add `llmAlias` to the `ConvMeta` interface**

Edit `src/db/index.ts`:

```ts
export interface ConvMeta {
  id: string;  // stored as TEXT to preserve BigInt precision
  title: string;
  agentType: string;
  systemPromptId: string | null;
  llmAlias: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add idempotent migration in `initDb`**

In `initDb()`, **after** the existing `system_prompt_id` migration block (around line 86-88), append:

```ts
if (!hasColumn("llm_alias")) {
  db.run("ALTER TABLE conversations ADD COLUMN llm_alias TEXT");
}
```

(Do not modify the original `CREATE TABLE` body — relying on the migration keeps idempotency for users with an existing IndexedDB snapshot.)

- [ ] **Step 3: Update `addConversation` to accept and persist `llmAlias`**

Replace the function body:

```ts
export function addConversation(
  userId: string,
  id: string,
  agentType: string,
  systemPromptId?: string,
  llmAlias?: string,
): void {
  if (!db) return;
  const now = new Date().toISOString();
  db.run(
    "INSERT OR IGNORE INTO conversations (id, user_id, title, agent_type, system_prompt_id, llm_alias, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, "New Conversation", agentType, systemPromptId ?? null, llmAlias ?? null, now, now],
  );
  schedulePersist();
}
```

- [ ] **Step 4: Update `updateConversation` whitelist**

Replace the function body:

```ts
export function updateConversation(
  userId: string,
  id: string,
  fields: Partial<Pick<ConvMeta, "title" | "agentType" | "systemPromptId" | "llmAlias">>,
): void {
  if (!db) return;
  const sets: string[] = ["updated_at = ?"];
  const vals: (string | number | null)[] = [new Date().toISOString()];
  if (fields.title !== undefined) { sets.push("title = ?"); vals.push(fields.title); }
  if (fields.agentType !== undefined) { sets.push("agent_type = ?"); vals.push(fields.agentType); }
  if (fields.systemPromptId !== undefined) { sets.push("system_prompt_id = ?"); vals.push(fields.systemPromptId); }
  if (fields.llmAlias !== undefined) { sets.push("llm_alias = ?"); vals.push(fields.llmAlias); }
  vals.push(id, userId);
  db.run(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, vals);
  schedulePersist();
}
```

- [ ] **Step 5: Update `listConversations` SELECT and row map**

Replace the function body:

```ts
export function listConversations(userId: string): ConvMeta[] {
  if (!db) return [];
  if (!SAFE_USER_ID.test(userId)) return [];
  const rows = db.exec(
    `SELECT id, title, agent_type, system_prompt_id, llm_alias, created_at, updated_at FROM conversations WHERE user_id = '${userId}' ORDER BY updated_at DESC`,
  );
  if (!rows.length) return [];
  return rows[0].values.map((r) => ({
    id: String(r[0]),
    title: r[1] as string,
    agentType: r[2] as string,
    systemPromptId: (r[3] as string) ?? null,
    llmAlias: (r[4] as string) ?? null,
    createdAt: r[5] as string,
    updatedAt: r[6] as string,
  }));
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: PASS. (`tsc -b` strict mode passes despite the new required `llmAlias` field on `ConvMeta` — at this point no caller of `listConversations` constructs a `ConvMeta` literal, so adding the new field doesn't break call sites. If `tsc` complains about a missed call site, revisit.)

- [ ] **Step 7: Commit**

```bash
git add src/db/index.ts
git commit -m "feat(db): add llm_alias column to conversations table"
```

---

## Task 2: Surface `llmAlias` through `conversationListStore`

**Files:**
- Modify: `src/stores/conversationListStore.ts:12-19` (interface)
- Modify: `src/stores/conversationListStore.ts:30-35` (`add` impl)

- [ ] **Step 1: Update store interface**

Edit `src/stores/conversationListStore.ts`:

```ts
interface ConversationListStore {
  conversations: ConvMeta[];

  load: () => void;
  add: (id: string, agentType: string, systemPromptId?: string, llmAlias?: string) => void;
  update: (id: string, fields: Partial<Pick<ConvMeta, "title" | "agentType" | "systemPromptId" | "llmAlias">>) => void;
  remove: (id: string) => void;
}
```

- [ ] **Step 2: Update `add` implementation to forward `llmAlias`**

```ts
  add: (id, agentType, systemPromptId, llmAlias) => {
    const userId = currentUserId();
    if (!userId) return;
    dbAdd(userId, id, agentType, systemPromptId, llmAlias);
    set({ conversations: dbList(userId) });
  },
```

(`update` body is unchanged — the new field flows through `fields` automatically since the impl already forwards the whole `fields` object to `dbUpdate`.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/stores/conversationListStore.ts
git commit -m "feat(stores): plumb llmAlias through conversationListStore"
```

---

## Task 3: Create `modelStore`

**Files:**
- Create: `src/stores/modelStore.ts`

- [ ] **Step 1: Write the new store**

Create `src/stores/modelStore.ts`:

```ts
import { create } from "zustand";

const LS_KEY = "agnes:llm-alias";

// Hardcoded list of accepted aliases. Empty string means "Auto" (let backend choose).
// Keep in sync with MODEL_OPTIONS in src/components/ModelSelector.tsx.
const VALID_ALIASES = new Set<string>([
  "",
  "deepseek-v4-flash",
  "agnes-1.5-flash",
  "gemini-3-flash",
  "claude-opus-4-6",
]);

function loadInitial(): string {
  try {
    const raw = localStorage.getItem(LS_KEY) ?? "";
    return VALID_ALIASES.has(raw) ? raw : "";
  } catch {
    return "";
  }
}

interface ModelStore {
  selectedAlias: string;
  setAlias: (alias: string) => void;
}

export const useModelStore = create<ModelStore>((set) => ({
  selectedAlias: loadInitial(),
  setAlias: (alias) => {
    if (!VALID_ALIASES.has(alias)) return;
    try {
      localStorage.setItem(LS_KEY, alias);
    } catch {
      // ignore storage errors (private mode etc.) — in-memory value still applies
    }
    set({ selectedAlias: alias });
  },
}));
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS. (Store is unused at this point but file must type-check; `noUnusedLocals` does not flag exports.)

- [ ] **Step 3: Commit**

```bash
git add src/stores/modelStore.ts
git commit -m "feat(stores): add modelStore for last-picked LLM alias"
```

---

## Task 4: Create `ModelSelector` component

**Files:**
- Create: `src/components/ModelSelector.tsx`
- Reference (read-only): `src/components/SystemPromptSelector.tsx` for visual style and dropdown mechanics

- [ ] **Step 1: Write the component**

Create `src/components/ModelSelector.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";

interface Props {
  selectedAlias: string;
  onChange: (alias: string) => void;
  disabled: boolean;
}

interface Option {
  label: string;
  alias: string;
}

const MODEL_OPTIONS: Option[] = [
  { label: "Auto（默认）", alias: "" },
  { label: "DeepSeek V4 Flash", alias: "deepseek-v4-flash" },
  { label: "Agnes 1.5 Flash", alias: "agnes-1.5-flash" },
  { label: "Gemini 3 Flash", alias: "gemini-3-flash" },
  { label: "Claude Opus 4.6", alias: "claude-opus-4-6" },
];

function labelFor(alias: string): string {
  return MODEL_OPTIONS.find((o) => o.alias === alias)?.label ?? "Auto（默认）";
}

export function ModelSelector({ selectedAlias, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isAuto = selectedAlias === "";

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all max-w-[180px]
          ${disabled
            ? "cursor-default opacity-70"
            : "cursor-pointer hover:bg-surface-hover"
          }
          ${!isAuto
            ? "text-accent font-medium"
            : "text-text-tertiary"
          }`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
        </svg>
        <span className="truncate">{labelFor(selectedAlias)}</span>
        {!disabled && (
          <svg className="w-2.5 h-2.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {open && !disabled && (
        <div className="absolute right-0 bottom-full mb-1 z-50 w-56 bg-surface border border-border
                        rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto">
          {MODEL_OPTIONS.map((o) => (
            <button
              key={o.alias || "__auto__"}
              onClick={() => { onChange(o.alias); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors
                ${o.alias === selectedAlias ? "text-accent bg-accent/5" : "text-text-secondary hover:bg-surface-hover"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ModelSelector.tsx
git commit -m "feat(components): add ModelSelector dropdown"
```

---

## Task 5: Mount `ModelSelector` in `ChatPanel` and lock at conv creation

**Files:**
- Modify: `src/panels/ChatPanel.tsx:10` (import)
- Modify: `src/panels/ChatPanel.tsx:852-861` (toolbar — insert next to `SystemPromptSelector`)
- Modify: `src/hooks/useChat.ts:498-510` (createConversation — pass llmAlias to add)

- [ ] **Step 1: Add imports in `ChatPanel.tsx`**

At the top of `src/panels/ChatPanel.tsx`, add to the existing component imports:

```tsx
import { ModelSelector } from "@/components/ModelSelector";
import { useModelStore } from "@/stores/modelStore";
```

- [ ] **Step 2: Compute the display alias and insert `ModelSelector`**

In `ChatPanel`, near the top of the component body where other derived values are computed (next to `hasUserMessages`), add:

```tsx
  const lastPickAlias = useModelStore((s) => s.selectedAlias);
  const conversations = useConversationListStore((s) => s.conversations);
  const lockedAlias = conversationId
    ? conversations.find((c) => c.id === conversationId)?.llmAlias ?? null
    : null;
  const displayAlias = lockedAlias ?? lastPickAlias;
```

(Both hooks are called unconditionally — Rules of Hooks compliant. Subscribing to `conversations` ensures the dropdown re-renders when the conv's locked alias is patched via `update`.)

Then locate the existing `<SystemPromptSelector ... />` block (around line 852-861) and replace it with:

```tsx
        <div className="flex items-center gap-1">
          <SystemPromptSelector
            selectedId={systemPromptId}
            onChange={(id) => {
              setSystemPromptId(id);
              if (conversationId) {
                useConversationListStore.getState().update(conversationId, { systemPromptId: id });
              }
            }}
            disabled={hasUserMessages}
          />
          <ModelSelector
            selectedAlias={displayAlias}
            onChange={(alias) => {
              useModelStore.getState().setAlias(alias);
              if (conversationId) {
                useConversationListStore.getState().update(conversationId, { llmAlias: alias });
              }
            }}
            disabled={hasUserMessages}
          />
        </div>
```

(The wrapping `<div>` keeps both pills grouped on the right, mirroring the existing layout.)

- [ ] **Step 3: Pass `llmAlias` into `add()` at `createConversation`**

In `src/hooks/useChat.ts:498-510`, update the existing `createConversation`:

```ts
  const createConversation = useCallback(async () => {
    getState().reset();
    const id = await createAgnesConversation();
    getState().setConversationId(id);
    useConversationListStore.getState().add(
      id,
      getState().agentType,
      getState().systemPromptId ?? undefined,
      useModelStore.getState().selectedAlias,
    );
    const skillsStore = useChatSelectedSkillsStore.getState();
    const pending = skillsStore.get(PENDING_SKILLS_CONV_ID);
    if (pending.length > 0) {
      skillsStore.setForConv(id, pending);
      skillsStore.clear(PENDING_SKILLS_CONV_ID);
    }
    return id;
  }, []);
```

Add the import at the top of `useChat.ts` (next to other store imports):

```ts
import { useModelStore } from "@/stores/modelStore";
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 5: Manual smoke (without proto field yet)**

Run `npm run dev`. In browser:

- [ ] Open `/chat` (blank state). Confirm a new pill labeled `Auto（默认）` appears next to the prompt selector.
- [ ] Click the pill — dropdown opens with 5 options. Pick `Claude Opus 4.6` — pill label updates.
- [ ] Refresh the page. Pill still shows `Claude Opus 4.6` (localStorage round-trip).
- [ ] Click `New Chat`/start a brand new conversation, then change the model in the dropdown to `Gemini 3 Flash`. (Don't send a message yet.)
- [ ] In DevTools → Application → IndexedDB → `agnes-conversations` → `db` → `main`, dump the sql.js DB (or use `sqlite-viewer` from a download); confirm the row has `llm_alias = 'gemini-3-flash'`. Alternatively, log `useConversationListStore.getState().conversations` from the console and confirm the entry's `llmAlias` field reflects the latest pick.
- [ ] Send a message. Confirm the dropdown becomes disabled (visually greyed, no caret) — request will fail because backend does not yet expose `llm_alias`; that's expected at this step.

- [ ] **Step 6: Commit**

```bash
git add src/panels/ChatPanel.tsx src/hooks/useChat.ts
git commit -m "feat(chat): wire ModelSelector into input toolbar and lock at conv creation"
```

---

## Task 6: Coordinate backend proto change + regenerate TS

**Files:**
- Auto-regenerated: `src/gen/kw_agent_service/v1/kw_agent_service_pb.ts`

This task is a coordination point with the `agnes_core` repo owner.

- [ ] **Step 1: Confirm backend has added the proto field**

Verify the sibling checkout `../agnes_core/proto/kw_agent_service/v1/kw_agent_service.proto` contains:

```proto
message AgentRequest {
  // ... existing fields ...
  string llm_alias = 8;   // (or next free field number)
}
```

Run:

```bash
grep -n 'llm_alias' /Users/zealyoung/Code/Kiwi/agnes_core/proto/kw_agent_service/v1/kw_agent_service.proto
```

Expected: a line like `string llm_alias = N;` inside the `AgentRequest` message.

If absent, **stop here** and ping the backend owner. Do not fabricate a field number.

- [ ] **Step 2: Regenerate frontend TS bindings**

Run: `npm run proto:gen`
Expected: `src/gen/**` files are rewritten (no errors). The `AgentRequest` TS class in `src/gen/kw_agent_service/v1/kw_agent_service_pb.ts` should now declare a `llmAlias?: string` field.

Verify:

```bash
grep -n 'llmAlias' src/gen/kw_agent_service/v1/kw_agent_service_pb.ts
```

Expected: at least one match inside the `AgentRequest` class.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS. The new generated field is unused for now — that's fine.

- [ ] **Step 4: Commit the regenerated code**

```bash
git add src/gen/
git commit -m "chore(gen): regenerate proto TS for llm_alias field"
```

---

## Task 7: Wire `llmAlias` into `chatStream` request

**Files:**
- Modify: `src/hooks/useChat.ts` (top — add helper) and `:545-562` (chatStream req body)

- [ ] **Step 1: Add `resolveAliasForConv` helper in `useChat.ts`**

Near the top of `src/hooks/useChat.ts`, after the existing imports and before the hook definition (find a sensible spot near the other module-level helpers like `abortMap` / `getLatestSeq`), add:

```ts
function resolveAliasForConv(convId: string | null): string {
  if (!convId) return useModelStore.getState().selectedAlias;
  const conv = useConversationListStore
    .getState()
    .conversations.find((c) => c.id === convId);
  return conv?.llmAlias ?? useModelStore.getState().selectedAlias;
}
```

- [ ] **Step 2: Add `llmAlias` to the `chatStream` request body**

In `src/hooks/useChat.ts:545-562`, modify the `chatStream` call:

```ts
    const stream = agentClient.chatStream(
      {
        conversationId: BigInt(convId),
        query,
        agentType: s.agentType,
        files: files.map((file) => ({
          mimeType: file.mimeType,
          url: file.url,
          filename: file.filename,
          data: new Uint8Array(),
        })),
        systemPromptId: s.systemPromptId ? BigInt(s.systemPromptId) : 0n,
        extraContext,
        selectedSkills: pickSelectedSkillsForRequest(convId),
        billingEnabled,
        llmAlias: resolveAliasForConv(convId),
      },
      { signal },
    );
```

Do **not** add `llmAlias` to `resumeStream` / `editResendStream` / `regenerateStream` / `hitlResumeStream` — their proto messages do not have the field, and TypeScript will reject the property.

- [ ] **Step 3: Verify build + lint**

Run: `npm run build && npm run lint`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat(useChat): carry llmAlias on chatStream requests"
```

---

## Task 8: End-to-end smoke verification

This task has no code changes — it is the manual acceptance gate.

- [ ] **Step 1: Verify build + lint clean**

```bash
npm run build && npm run lint
```

Expected: both PASS.

- [ ] **Step 2: Run dev server**

```bash
npm run dev
```

- [ ] **Step 3: Walk through the smoke checklist**

In a clean browser profile (or after clearing this app's IndexedDB and localStorage):

- [ ] Empty `/chat`: dropdown shows `Auto（默认）`, opens to 5 options.
- [ ] Pick `Claude Opus 4.6` → refresh page → dropdown still shows `Claude Opus 4.6` (localStorage round-trip).
- [ ] Start a new chat (which triggers `createConversation`). Dropdown still shows `Claude Opus 4.6`. Change to `Gemini 3 Flash`. Send first message.
- [ ] In Network panel, find the `kw_agent_service.v1.KwAgentService/ChatStream` request. Inspect the gRPC-Web payload (Connect-ES will show JSON-ish encoding in the dev tools). Confirm `llmAlias: "gemini-3-flash"` is present.
- [ ] Dropdown is now disabled (greyed pill, no caret) and still shows `Gemini 3 Flash`.
- [ ] Send a second message in the same conversation. Inspect the second `ChatStream` request — `llmAlias` is still `"gemini-3-flash"`.
- [ ] Open the original conversation (with `Claude Opus 4.6` lock) from the sidebar. Dropdown shows `Claude Opus 4.6`, disabled.
- [ ] Open a fresh `/chat`. Dropdown defaults to `Gemini 3 Flash` (the most recent global pick).
- [ ] Pick `Auto（默认）` and send a message in a new conv. Network: `llmAlias: ""` (or omitted entirely if Connect-ES skips empty strings — both are equivalent per proto3).
- [ ] Backend integration: confirm the backend acknowledges the alias (no error response, expected model is used). If backend reports unknown alias, recheck Task 6's proto wiring.

- [ ] **Step 4: If all checks pass, branch is ready for review**

No commit needed for this task. Run:

```bash
git status
git log --oneline main..HEAD
```

Expected: working tree clean, the commits from Tasks 1-7 visible. Branch is ready for `git push` and PR.

---

## Out of Scope

The spec lists several deliberate non-goals; do not add work for them in this plan:

- Mid-conversation model switching (locked by `disabled={hasUserMessages}`).
- Per-model UI badges, pricing, or metadata.
- A backend `ListModels` RPC.
- Server-side persistence of user model preference.
- Showing the model used per-message in the transcript.
- Adding `llm_alias` to `ResumeRequest` / `EditResendRequest` / `RegenerateRequest` (backend resolves from conversation state).
