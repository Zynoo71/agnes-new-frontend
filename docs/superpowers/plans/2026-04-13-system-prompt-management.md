# System Prompt Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add frontend CRUD for system prompts and a per-conversation prompt selector that injects `system_prompt_id` into the agent request.

**Architecture:** A Zustand store wraps gRPC CRUD calls. A new `/prompts` page shows a card grid with modal editing. A dropdown selector in ChatPanel's input area lets users pick a prompt per conversation, persisted in local SQLite. After the first message the selector becomes read-only with a hover preview.

**Tech Stack:** React 19, TypeScript, Zustand, @connectrpc/connect-web, sql.js (WASM SQLite), Tailwind CSS, Vite

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `envoy.yaml:29` | Modify | Add `x-app-id` to CORS allow_headers |
| `.env` + `.env.example` | Modify | Add `VITE_APP_ID` |
| `src/grpc/client.ts` | Modify | Inject `x-app-id` header |
| `src/gen/` | Regenerate | `npm run proto:gen` to get SystemPrompt types |
| `src/stores/systemPromptStore.ts` | Create | Zustand store wrapping ListSystemPrompts/Create/Update/Delete |
| `src/pages/PromptManagementPage.tsx` | Create | Card grid + create/edit modal |
| `src/components/SystemPromptSelector.tsx` | Create | Dropdown selector for ChatPanel input area |
| `src/db/index.ts` | Modify | Add `system_prompt_id` column + update CRUD |
| `src/stores/conversationListStore.ts` | Modify | Add `systemPromptId` to ConvMeta + update flow |
| `src/App.tsx` | Modify | Add `/prompts` route |
| `src/components/Sidebar.tsx` | Modify | Add Prompts nav link |
| `src/panels/ChatPanel.tsx` | Modify | Integrate SystemPromptSelector |
| `src/hooks/useChat.ts` | Modify | Pass `systemPromptId` in AgentRequest |

---

### Task 1: Proto Regeneration & Infrastructure

**Files:**
- Modify: `envoy.yaml:29`
- Modify: `.env`
- Modify: `.env.example`
- Modify: `src/grpc/client.ts:5-21`
- Regenerate: `src/gen/`

- [ ] **Step 1: Add `x-app-id` to Envoy CORS allow_headers**

In `envoy.yaml`, line 29, append `,x-app-id` to the `allow_headers` value:

```yaml
allow_headers: keep-alive,user-agent,cache-control,content-type,content-transfer-encoding,x-accept-content-transfer-encoding,x-accept-response-streaming,x-user-agent,x-grpc-web,grpc-timeout,x-user-id,x-trace-id,x-dev-lane,x-app-id
```

- [ ] **Step 2: Add `VITE_APP_ID` to env files**

In `.env`, add:
```
VITE_APP_ID=agnes-frontend
```

In `.env.example`, add:
```
VITE_APP_ID=
```

- [ ] **Step 3: Inject `x-app-id` header in gRPC interceptor**

In `src/grpc/client.ts`, add a new env var read and inject it in the interceptor:

```typescript
import { createClient, type Interceptor } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { KwAgentServiceService } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "";
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
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  interceptors: [injectHeadersInterceptor],
});

export const agentClient = createClient(KwAgentServiceService, transport);
```

- [ ] **Step 4: Regenerate proto TypeScript**

Run:
```bash
npm run proto:gen
```

Expected: `src/gen/kw_agent_service/v1/kw_agent_service_pb.ts` now contains `SystemPromptInfo`, `CreateSystemPromptRequest`, etc., and `AgentRequest` has a `systemPromptId` field. The `KwAgentServiceService` includes `createSystemPrompt`, `updateSystemPrompt`, `deleteSystemPrompt`, `getSystemPrompt`, `listSystemPrompts` methods.

Verify:
```bash
grep -c "SystemPromptInfo" src/gen/kw_agent_service/v1/kw_agent_service_pb.ts
```
Expected: a number > 0

- [ ] **Step 5: Commit**

```bash
git add envoy.yaml .env .env.example src/grpc/client.ts src/gen/
git commit -m "feat: add x-app-id header and regenerate proto for system prompt support"
```

---

### Task 2: System Prompt Zustand Store

**Files:**
- Create: `src/stores/systemPromptStore.ts`

- [ ] **Step 1: Create the store**

Create `src/stores/systemPromptStore.ts`:

```typescript
import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { SystemPromptInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

interface SystemPromptStore {
  prompts: SystemPromptInfo[];
  loading: boolean;
  loaded: boolean;

  load: () => Promise<void>;
  create: (name: string, content: string) => Promise<SystemPromptInfo>;
  update: (id: bigint, fields: { name?: string; content?: string }) => Promise<void>;
  remove: (id: bigint) => Promise<void>;
}

export const useSystemPromptStore = create<SystemPromptStore>((set, get) => ({
  prompts: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const resp = await agentClient.listSystemPrompts({});
      set({ prompts: resp.prompts, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  create: async (name, content) => {
    const prompt = await agentClient.createSystemPrompt({ name, content });
    set((s) => ({ prompts: [prompt, ...s.prompts] }));
    return prompt;
  },

  update: async (id, fields) => {
    const updated = await agentClient.updateSystemPrompt({
      id,
      name: fields.name ?? "",
      content: fields.content ?? "",
    });
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === id ? updated : p)),
    }));
  },

  remove: async (id) => {
    await agentClient.deleteSystemPrompt({ id });
    set((s) => ({ prompts: s.prompts.filter((p) => p.id !== id) }));
  },
}));
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors related to systemPromptStore

- [ ] **Step 3: Commit**

```bash
git add src/stores/systemPromptStore.ts
git commit -m "feat: add system prompt Zustand store"
```

---

### Task 3: SQLite Schema — Add `system_prompt_id` to Conversations

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/stores/conversationListStore.ts`

- [ ] **Step 1: Update ConvMeta type and schema**

In `src/db/index.ts`, add `systemPromptId` to the `ConvMeta` interface:

```typescript
export interface ConvMeta {
  id: string;
  title: string;
  agentType: string;
  systemPromptId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Update `initDb` to add the column**

After the existing `CREATE TABLE IF NOT EXISTS` statement in `initDb()`, add a migration for existing databases. Replace the `initDb` function:

```typescript
export async function initDb(): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const saved = await loadFromIDB();
  db = saved ? new SQL.Database(saved) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id                TEXT PRIMARY KEY,
      title             TEXT NOT NULL DEFAULT 'New Conversation',
      agent_type        TEXT NOT NULL,
      system_prompt_id  TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )
  `);

  // Migration: add system_prompt_id column for existing databases
  const cols = db.exec("PRAGMA table_info(conversations)");
  const hasCol = cols[0]?.values.some((row) => row[1] === "system_prompt_id");
  if (!hasCol) {
    db.run("ALTER TABLE conversations ADD COLUMN system_prompt_id TEXT");
  }
}
```

- [ ] **Step 3: Update `addConversation` to accept `systemPromptId`**

```typescript
export function addConversation(id: string, agentType: string, systemPromptId?: string): void {
  if (!db) return;
  const now = new Date().toISOString();
  db.run(
    "INSERT OR IGNORE INTO conversations (id, title, agent_type, system_prompt_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    [id, "New Conversation", agentType, systemPromptId ?? null, now, now],
  );
  schedulePersist();
}
```

- [ ] **Step 4: Update `updateConversation` to support `systemPromptId`**

```typescript
export function updateConversation(id: string, fields: Partial<Pick<ConvMeta, "title" | "agentType" | "systemPromptId">>): void {
  if (!db) return;
  const sets: string[] = ["updated_at = ?"];
  const vals: (string | number | null)[] = [new Date().toISOString()];
  if (fields.title !== undefined) { sets.push("title = ?"); vals.push(fields.title); }
  if (fields.agentType !== undefined) { sets.push("agent_type = ?"); vals.push(fields.agentType); }
  if (fields.systemPromptId !== undefined) { sets.push("system_prompt_id = ?"); vals.push(fields.systemPromptId); }
  vals.push(id);
  db.run(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`, vals);
  schedulePersist();
}
```

- [ ] **Step 5: Update `listConversations` to read `system_prompt_id`**

```typescript
export function listConversations(): ConvMeta[] {
  if (!db) return [];
  const rows = db.exec("SELECT id, title, agent_type, system_prompt_id, created_at, updated_at FROM conversations ORDER BY updated_at DESC");
  if (!rows.length) return [];
  return rows[0].values.map((r) => ({
    id: String(r[0]),
    title: r[1] as string,
    agentType: r[2] as string,
    systemPromptId: (r[3] as string) ?? null,
    createdAt: r[4] as string,
    updatedAt: r[5] as string,
  }));
}
```

- [ ] **Step 6: Update `conversationListStore` types**

In `src/stores/conversationListStore.ts`, update the `update` method signature to include `systemPromptId`:

```typescript
interface ConversationListStore {
  conversations: ConvMeta[];

  load: () => void;
  add: (id: string, agentType: string, systemPromptId?: string) => void;
  update: (id: string, fields: Partial<Pick<ConvMeta, "title" | "agentType" | "systemPromptId">>) => void;
  remove: (id: string) => void;
}
```

Update the `add` method implementation:

```typescript
  add: (id, agentType, systemPromptId) => {
    dbAdd(id, agentType, systemPromptId);
    set({ conversations: dbList() });
  },
```

- [ ] **Step 7: Verify compilation**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/db/index.ts src/stores/conversationListStore.ts
git commit -m "feat: add system_prompt_id to conversation schema"
```

---

### Task 4: System Prompt Management Page

**Files:**
- Create: `src/pages/PromptManagementPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Create the management page component**

Create `src/pages/PromptManagementPage.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useSystemPromptStore } from "@/stores/systemPromptStore";
import type { SystemPromptInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

function PromptModal({
  prompt,
  onClose,
}: {
  prompt: SystemPromptInfo | null; // null = create mode
  onClose: () => void;
}) {
  const { create, update, remove } = useSystemPromptStore();
  const [name, setName] = useState(prompt?.name ?? "");
  const [content, setContent] = useState(prompt?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isEdit = prompt !== null;
  const canSave = name.trim() && content.trim();

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (isEdit) {
        await update(prompt.id, { name: name.trim(), content: content.trim() });
      } else {
        await create(name.trim(), content.trim());
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || saving) return;
    setSaving(true);
    try {
      await remove(prompt.id);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-surface rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="px-6 pt-5 pb-3">
          <h3 className="text-base font-semibold text-text-primary">
            {isEdit ? "Edit Prompt" : "New Prompt"}
          </h3>
        </div>

        <div className="px-6 flex-1 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Customer Support Agent"
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface
                         focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="You are a helpful assistant that..."
              rows={10}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-surface resize-y
                         focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div className="px-6 py-4 flex items-center gap-3 border-t border-border-light">
          {isEdit && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-error font-medium">Delete?</span>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-xs font-medium text-white bg-error px-3 py-1 rounded-lg hover:bg-error/80 transition-colors disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-text-tertiary hover:text-error transition-colors"
              >
                Delete
              </button>
            )
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-text-secondary border border-border rounded-lg
                         hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                         hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PromptManagementPage() {
  const { prompts, loading, load } = useSystemPromptStore();
  const [modalPrompt, setModalPrompt] = useState<SystemPromptInfo | null | undefined>(undefined);
  // undefined = modal closed, null = create mode, SystemPromptInfo = edit mode

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-alt">
        <h2 className="text-base font-semibold text-text-primary">System Prompts</h2>
        <button
          onClick={() => setModalPrompt(null)}
          className="px-4 py-1.5 text-sm font-medium text-white bg-accent rounded-lg
                     hover:bg-accent-hover active:scale-[0.98] transition-all"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && prompts.length === 0 ? (
          <div className="text-sm text-text-tertiary text-center mt-12">Loading...</div>
        ) : prompts.length === 0 ? (
          <div className="text-center mt-12">
            <p className="text-sm text-text-tertiary">No system prompts yet.</p>
            <p className="text-xs text-text-tertiary mt-1">Create one to customize how Agnes responds.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
            {prompts.map((p) => (
              <button
                key={String(p.id)}
                onClick={() => setModalPrompt(p)}
                className="text-left p-4 border border-border rounded-xl hover:border-accent/40
                           hover:shadow-sm transition-all bg-surface"
              >
                <div className="text-sm font-semibold text-text-primary mb-1 truncate">{p.name}</div>
                <div className="text-xs text-text-tertiary line-clamp-2 leading-relaxed">{p.content}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modalPrompt !== undefined && (
        <PromptModal prompt={modalPrompt} onClose={() => setModalPrompt(undefined)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add `/prompts` route in `App.tsx`**

In `src/App.tsx`, add the import and route:

Import at the top (after existing imports):
```typescript
import { PromptManagementPage } from "@/pages/PromptManagementPage";
```

Add the route inside `<Routes>`, after the `/pixa` route (line 74):
```tsx
<Route path="/prompts" element={<ErrorBoundary><PromptManagementPage /></ErrorBoundary>} />
```

- [ ] **Step 3: Add Prompts nav link to Sidebar**

In `src/components/Sidebar.tsx`, add `useNavigate` and `useLocation` imports. Change the import line:

```typescript
import { useNavigate, useLocation } from "react-router";
```

Inside the `Sidebar` function body, add:
```typescript
const navigate = useNavigate();
const location = useLocation();
const isPromptsActive = location.pathname === "/prompts";
```

Then, between the "New Chat button" `</div>` (line 107) and the "Conversation list" `<div>` (line 110), add a nav link:

```tsx
      {/* Prompts link */}
      <div className={`px-2 pb-2 ${collapsed ? "px-1.5" : ""}`}>
        <button
          onClick={() => navigate("/prompts")}
          className={`w-full rounded-lg text-sm font-medium transition-all
                     ${collapsed ? "p-2 flex items-center justify-center" : "px-3 py-2 flex items-center gap-2"}
                     ${isPromptsActive
                       ? "bg-accent/10 text-accent"
                       : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                     }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          {!collapsed && <span>Prompts</span>}
        </button>
      </div>
```

- [ ] **Step 4: Verify page renders**

Run the dev server:
```bash
npm run dev
```

Open http://localhost:5173/prompts. Expected: the page shows "System Prompts" heading with empty state text and a "+ New" button.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PromptManagementPage.tsx src/App.tsx src/components/Sidebar.tsx
git commit -m "feat: add system prompt management page with card grid and modal"
```

---

### Task 5: System Prompt Selector Component

**Files:**
- Create: `src/components/SystemPromptSelector.tsx`

- [ ] **Step 1: Create the selector component**

Create `src/components/SystemPromptSelector.tsx`:

```tsx
import { useState, useEffect, useRef } from "react";
import { useSystemPromptStore } from "@/stores/systemPromptStore";

interface Props {
  selectedId: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean; // true after first message sent
}

export function SystemPromptSelector({ selectedId, onChange, disabled }: Props) {
  const { prompts, loaded, load } = useSystemPromptStore();
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Close dropdown on outside click
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

  const selected = prompts.find((p) => String(p.id) === selectedId);

  if (prompts.length === 0 && loaded) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => !disabled && setOpen(!open)}
        onMouseEnter={() => disabled && selected && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-all max-w-[180px]
          ${disabled
            ? "cursor-default opacity-70"
            : "cursor-pointer hover:bg-surface-hover"
          }
          ${selected
            ? "text-accent font-medium"
            : "text-text-tertiary"
          }`}
      >
        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <span className="truncate">{selected ? selected.name : "Prompt"}</span>
        {!disabled && (
          <svg className="w-2.5 h-2.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </button>

      {/* Hover tooltip for frozen state */}
      {showTooltip && disabled && selected && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 p-3 bg-surface border border-border
                        rounded-xl shadow-lg text-xs text-text-secondary leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          <div className="font-medium text-text-primary mb-1">{selected.name}</div>
          {selected.content}
        </div>
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-surface border border-border
                        rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto">
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs transition-colors
              ${!selectedId ? "text-accent bg-accent/5" : "text-text-secondary hover:bg-surface-hover"}`}
          >
            No prompt
          </button>
          {prompts.map((p) => (
            <button
              key={String(p.id)}
              onClick={() => { onChange(String(p.id)); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors
                ${String(p.id) === selectedId ? "text-accent bg-accent/5" : "text-text-secondary hover:bg-surface-hover"}`}
            >
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-text-tertiary truncate mt-0.5">{p.content.slice(0, 60)}...</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/SystemPromptSelector.tsx
git commit -m "feat: add SystemPromptSelector dropdown component"
```

---

### Task 6: Integrate Selector into ChatPanel & Wire Up Message Sending

**Files:**
- Modify: `src/panels/ChatPanel.tsx:1-10, 124-127, 229-247`
- Modify: `src/hooks/useChat.ts:165-193`
- Modify: `src/stores/conversationStore.ts` (add systemPromptId to state)

- [ ] **Step 1: Add `systemPromptId` to conversation store**

In `src/stores/conversationStore.ts`, find the state interface and `create` call. Add `systemPromptId` field to the store state. Find the existing state properties (around where `conversationId`, `agentType` are defined) and add:

In the state type/initial state, add:
```typescript
systemPromptId: null as string | null,
```

In the `reset` method, add:
```typescript
systemPromptId: null,
```

Add a setter:
```typescript
setSystemPromptId: (id: string | null) => set({ systemPromptId: id }),
```

- [ ] **Step 2: Integrate the selector in ChatPanel**

In `src/panels/ChatPanel.tsx`, add the import:
```typescript
import { SystemPromptSelector } from "@/components/SystemPromptSelector";
```

In the `ChatPanel` function, destructure the new state from the store (line 125):
```typescript
const { conversationId, agentType, messages, isStreaming, isLoadingHistory, error, setAgentType, systemPromptId, setSystemPromptId } =
    useConversationStore();
```

Determine if the selector should be frozen (conversation has user messages):
```typescript
const hasUserMessages = messages.some((m) => m.role === "user");
```

In the `inputArea` JSX, replace the Agent Type selector `<div>` (lines 230-247) with a flex row that has agent types on the left and the prompt selector on the right:

```tsx
      {/* Agent mode selector + Prompt selector */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-0">
        <div className="flex items-center gap-1">
          {AGENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => {
                setAgentType(t);
                if (conversationId) useConversationListStore.getState().update(conversationId, { agentType: t });
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all capitalize ${
                agentType === t
                  ? "bg-accent/10 text-accent"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
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
      </div>
```

- [ ] **Step 3: Restore `systemPromptId` when switching conversations**

In `src/hooks/useChat.ts`, in the `selectConversation` callback (around line 278-279), after restoring `agentType`, also restore `systemPromptId`:

```typescript
    if (conv) {
      s.setAgentType(conv.agentType);
      s.setSystemPromptId(conv.systemPromptId ?? null);
    }
```

- [ ] **Step 4: Pass `systemPromptId` in `sendMessage`**

In `src/hooks/useChat.ts`, in the `sendMessage` callback (around line 189-192), add `systemPromptId` to the chatStream request:

```typescript
    const stream = agentClient.chatStream(
      {
        conversationId: BigInt(convId),
        query,
        agentType: s.agentType,
        systemPromptId: s.systemPromptId ? BigInt(s.systemPromptId) : 0n,
      },
      { signal },
    );
```

- [ ] **Step 5: Persist `systemPromptId` when creating a conversation**

In `src/hooks/useChat.ts`, in `createConversation` (around line 170), pass `systemPromptId`:

```typescript
    useConversationListStore.getState().add(id, getState().agentType, getState().systemPromptId ?? undefined);
```

- [ ] **Step 6: Verify full integration**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors

Start the dev server and test:
1. Open http://localhost:5173/chat
2. The prompt selector should appear to the right of agent type buttons
3. Select a prompt — it persists when you switch conversations
4. After sending a message, the selector should be dimmed and non-clickable
5. Hovering over the frozen selector shows the prompt content tooltip

- [ ] **Step 7: Commit**

```bash
git add src/stores/conversationStore.ts src/panels/ChatPanel.tsx src/hooks/useChat.ts
git commit -m "feat: integrate system prompt selector into chat and wire up message sending"
```

---

### Task 7: Final Verification & Cleanup

- [ ] **Step 1: Type check the entire project**

Run:
```bash
npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 2: Start dev server and test full flow**

```bash
npm run dev
```

Test checklist:
1. `/prompts` page: create a new prompt, verify it appears as a card
2. Edit the prompt via card click, verify changes save
3. Delete a prompt, verify it disappears
4. `/chat`: selector shows the created prompt in dropdown
5. Select a prompt, send a message — verify prompt selector becomes frozen
6. Hover frozen selector — tooltip shows full prompt content
7. Create a new conversation — selector resets to "No prompt"
8. Switch back to the previous conversation — selector shows the frozen prompt

- [ ] **Step 3: Commit any fixes**

If any issues were found and fixed:
```bash
git add -u
git commit -m "fix: address issues found during system prompt integration testing"
```
