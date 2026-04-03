# Cancel Stream, Edit/Resend, Regenerate & Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cancel stream, edit/resend, regenerate capabilities to chat, plus a left sidebar with locally persisted conversation history (sql.js + IndexedDB).

**Architecture:** Regenerate proto TS to get new RPCs. Extract a shared `runStream` helper in useChat. Add sql.js for local conversation metadata persistence. Restructure App layout with a left sidebar.

**Tech Stack:** ConnectRPC (gRPC-web), Zustand, sql.js (WASM SQLite), React, Tailwind CSS

---

### Task 1: Regenerate Proto TypeScript

**Files:**
- Modify: `src/gen/` (auto-generated, full replacement)

- [ ] **Step 1: Run proto generation**

```bash
cd /Users/zealyoung/Code/agnes-new-frontend && npm run proto:gen
```

- [ ] **Step 2: Verify new RPCs exist in generated code**

Check that `src/gen/kw_agent_service/v1/kw_agent_service_pb.ts` now contains:
- `cancelStream` method with `CancelRequest` / `CancelReply`
- `editResendStream` method with `EditResendRequest`
- `regenerateStream` method with `RegenerateRequest`

```bash
grep -E "cancelStream|editResendStream|regenerateStream" src/gen/kw_agent_service/v1/kw_agent_service_pb.ts
```

Expected: 3+ matches showing the new RPC definitions.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/gen/
git commit -m "chore: regenerate proto TS with CancelStream, EditResend, Regenerate RPCs"
```

---

### Task 2: Extract `runStream` helper & add Cancel Stream to useChat

**Files:**
- Modify: `src/hooks/useChat.ts`

- [ ] **Step 1: Rewrite useChat with `runStream` helper and `cancelStream`**

Replace the entire content of `src/hooks/useChat.ts` with:

```typescript
import { useCallback, useRef } from "react";
import { agentClient } from "@/grpc/client";
import { useConversationStore } from "@/stores/conversationStore";
import type { AgentStreamEvent } from "@/gen/common/v1/agent_stream_pb";

const getState = () => useConversationStore.getState();

export function useChat() {
  const abortRef = useRef<AbortController | null>(null);

  /** Shared streaming loop — iterates events, handles errors, resets streaming flag. */
  const runStream = async (
    iter: AsyncIterable<AgentStreamEvent>,
    signal: AbortSignal,
  ) => {
    try {
      for await (const event of iter) {
        if (signal.aborted) break;
        getState().processEvent(event);
      }
    } catch (err) {
      if (signal.aborted) return; // user-initiated cancel, not an error
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Stream error:", err);
      getState().setError(msg);
    } finally {
      getState().setStreaming(false);
    }
  };

  /** Prepare state for a new streaming call and return an AbortSignal. */
  const beginStream = (): AbortSignal => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    getState().setStreaming(true);
    getState().setError(null);
    return ac.signal;
  };

  const createConversation = useCallback(async () => {
    getState().reset();
    const reply = await agentClient.createConversation({});
    getState().setConversationId(reply.conversationId);
    return reply.conversationId;
  }, []);

  const sendMessage = useCallback(async (query: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.addUserMessage(query);
    s.startAssistantMessage();
    const signal = beginStream();

    const stream = agentClient.chatStream(
      { conversationId: s.conversationId, query, agentType: s.agentType },
      { signal },
    );
    await runStream(stream, signal);
  }, []);

  const hitlResume = useCallback(async (action: "approve" | "modify", feedback?: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.resolveHumanReview();
    s.startAssistantMessage();
    const signal = beginStream();

    const resumePayload: Record<string, unknown> = { action };
    if (action === "modify" && feedback) resumePayload.feedback = feedback;

    const stream = agentClient.hitlResumeStream(
      {
        conversationId: s.conversationId,
        resumeData: new TextEncoder().encode(JSON.stringify(resumePayload)),
      },
      { signal },
    );
    await runStream(stream, signal);
  }, []);

  const editResend = useCallback(async (newQuery: string) => {
    const s = getState();
    if (!s.conversationId) return;

    s.removeLastRound();
    s.addUserMessage(newQuery);
    s.startAssistantMessage();
    const signal = beginStream();

    const stream = agentClient.editResendStream(
      { conversationId: s.conversationId, query: newQuery },
      { signal },
    );
    await runStream(stream, signal);
  }, []);

  const regenerate = useCallback(async () => {
    const s = getState();
    if (!s.conversationId) return;

    s.removeLastAssistantMessage();
    s.startAssistantMessage();
    const signal = beginStream();

    const stream = agentClient.regenerateStream(
      { conversationId: s.conversationId },
      { signal },
    );
    await runStream(stream, signal);
  }, []);

  const cancelStream = useCallback(async () => {
    const s = getState();
    abortRef.current?.abort();
    abortRef.current = null;
    if (s.conversationId) {
      try {
        await agentClient.cancelStream({ conversationId: s.conversationId });
      } catch (err) {
        console.error("CancelStream RPC error:", err);
      }
    }
  }, []);

  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream };
}
```

- [ ] **Step 2: Verify TypeScript compiles (will fail — store methods not yet added)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: errors about `removeLastRound` and `removeLastAssistantMessage` not existing on store. This is expected — we add them in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat: extract runStream helper, add cancelStream/editResend/regenerate to useChat"
```

---

### Task 3: Add store methods for message removal

**Files:**
- Modify: `src/stores/conversationStore.ts`

- [ ] **Step 1: Add `removeLastRound` and `removeLastAssistantMessage` to the store interface and implementation**

In `src/stores/conversationStore.ts`, add to the `ConversationState` interface (after `resolveHumanReview`):

```typescript
  removeLastRound: () => void;
  removeLastAssistantMessage: () => void;
```

Add the implementations inside the `create(...)` call, after the `resolveHumanReview` implementation (line 230):

```typescript
  removeLastRound: () =>
    set((s) => {
      const messages = [...s.messages];
      // Remove last assistant message, then last user message
      if (messages.length > 0 && messages[messages.length - 1].role === "assistant") messages.pop();
      if (messages.length > 0 && messages[messages.length - 1].role === "user") messages.pop();
      return { messages };
    }),

  removeLastAssistantMessage: () =>
    set((s) => {
      const messages = [...s.messages];
      if (messages.length > 0 && messages[messages.length - 1].role === "assistant") messages.pop();
      return { messages };
    }),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/conversationStore.ts
git commit -m "feat: add removeLastRound and removeLastAssistantMessage to conversation store"
```

---

### Task 4: Add Stop button to ChatPanel

**Files:**
- Modify: `src/panels/ChatPanel.tsx`

- [ ] **Step 1: Import `cancelStream` from useChat and add Stop button**

In `src/panels/ChatPanel.tsx`, update the useChat destructuring (line 12):

```typescript
  const { createConversation, sendMessage, hitlResume, cancelStream } = useChat();
```

Replace the send button section (lines 149-159) — the `<button>` inside the input area — with a conditional that shows a Stop button when streaming:

```tsx
              {isStreaming ? (
                <button
                  onClick={cancelStream}
                  className="absolute right-2 bottom-2 rounded-xl bg-error text-white p-2
                             hover:bg-error/80 active:scale-95 transition-all"
                  title="Stop generating"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!conversationId || !input.trim()}
                  className="absolute right-2 bottom-2 rounded-xl bg-text-primary text-white p-2
                             hover:bg-text-secondary disabled:opacity-20 disabled:hover:bg-text-primary
                             active:scale-95 transition-all"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                </button>
              )}
```

Also update the textarea `disabled` prop (line 144) — allow typing while streaming is cancelled, but keep disabled logic for no-conversation state:

```tsx
                disabled={!conversationId}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/panels/ChatPanel.tsx
git commit -m "feat: add Stop button to ChatPanel for cancelling active streams"
```

---

### Task 5: Add Edit & Regenerate buttons to MessageBubble

**Files:**
- Modify: `src/components/MessageBubble.tsx`

- [ ] **Step 1: Add `onEditResend` and `onRegenerate` props, and `isLast` flag**

Update the `MessageBubbleProps` interface and component:

```typescript
interface MessageBubbleProps {
  message: Message;
  isLast?: boolean;
  onHitlResume?: (action: "approve" | "modify", feedback?: string) => void;
  onEditResend?: (newQuery: string) => void;
  onRegenerate?: () => void;
  isStreaming?: boolean;
}
```

- [ ] **Step 2: Add inline edit mode for user messages**

In the `MessageBubble` component, add local state for edit mode and the edit UI for user messages. Replace the component body with:

```tsx
export function MessageBubble({ message, isLast, onHitlResume, onEditResend, onRegenerate, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");

  const canEdit = isUser && isLast && onEditResend && !isStreaming;
  const canRegenerate = !isUser && isLast && onRegenerate && !isStreaming;

  const handleStartEdit = () => {
    // Extract text content from blocks for editing
    const text = message.blocks
      .filter((b): b is { type: "text"; content: string } => b.type === "text")
      .map((b) => b.content)
      .join("\n");
    setEditText(text);
    setEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && onEditResend) {
      onEditResend(trimmed);
      setEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setEditText("");
  };

  return (
    <div className={`group flex ${isUser ? "justify-end" : "justify-start"} mb-5`}>
      <div
        className={`rounded-2xl ${
          isUser
            ? "bg-user-bubble text-text-primary max-w-[70%] px-4 py-2.5"
            : "text-text-primary max-w-[85%] py-1"
        }`}
      >
        {message.nodes.length > 0 && <NodeSteps nodes={message.nodes} />}

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full min-w-[300px] rounded-lg border border-border bg-surface px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/30"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={!editText.trim()}
                className="rounded-lg bg-accent text-white px-3 py-1.5 text-xs font-medium
                           hover:bg-accent-hover active:scale-[0.97] disabled:opacity-40 transition-all"
              >
                Save & Resend
              </button>
              <button
                onClick={handleCancelEdit}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-tertiary
                           hover:text-text-secondary hover:bg-surface-hover transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          message.blocks.map((block, i) => (
            <BlockRenderer
              key={i}
              block={block}
              onHitlResume={onHitlResume}
              isStreaming={isStreaming}
            />
          ))
        )}

        {message.error && (
          <div className="mt-3 flex items-start gap-2 p-3 bg-error-light rounded-xl text-xs">
            <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-error/10 flex items-center justify-center">
              <span className="text-error text-[10px]">!</span>
            </span>
            <div>
              <p className="font-medium text-error">{message.error.errorType}</p>
              <p className="text-text-secondary mt-0.5">{message.error.message}</p>
              {message.error.recoverable && (
                <span className="text-text-tertiary mt-1 inline-block">Recoverable</span>
              )}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {canEdit && !editing && (
          <button
            onClick={handleStartEdit}
            className="mt-1.5 text-[11px] text-text-tertiary hover:text-text-secondary
                       opacity-0 group-hover:opacity-100 transition-opacity"
          >
            Edit
          </button>
        )}
        {canRegenerate && (
          <button
            onClick={onRegenerate}
            className="mt-1.5 text-[11px] text-text-tertiary hover:text-text-secondary
                       opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            Regenerate
          </button>
        )}
      </div>
    </div>
  );
}
```

Note: add `useState` to the existing import from `react` at the top of the file (it's already imported).

- [ ] **Step 3: Update ChatPanel to pass new props**

In `src/panels/ChatPanel.tsx`, update the useChat destructuring:

```typescript
  const { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream } = useChat();
```

Update the `MessageBubble` rendering (around line 107-114) to pass `isLast`, `onEditResend`, and `onRegenerate`:

```tsx
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                isLast={i === messages.length - 1}
                onHitlResume={hitlResume}
                onEditResend={editResend}
                onRegenerate={regenerate}
                isStreaming={isStreaming}
              />
            ))}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/MessageBubble.tsx src/panels/ChatPanel.tsx
git commit -m "feat: add Edit & Resend button on user messages, Regenerate button on assistant messages"
```

---

### Task 6: Install sql.js and create database layer

**Files:**
- Create: `src/db/index.ts`

- [ ] **Step 1: Install sql.js**

```bash
cd /Users/zealyoung/Code/agnes-new-frontend && npm install sql.js
```

- [ ] **Step 2: Copy sql.js WASM file to public directory**

sql.js needs its WASM binary served from a URL. Copy it to `public/`:

```bash
cp node_modules/sql.js/dist/sql-wasm.wasm public/sql-wasm.wasm
```

- [ ] **Step 3: Create `src/db/index.ts`**

```typescript
import initSqlJs, { type Database } from "sql.js";

export interface ConvMeta {
  id: number;
  title: string;
  agentType: string;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = "agnes-conversations";
const STORE_NAME = "db";
const KEY = "main";

let db: Database | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

// ── IndexedDB helpers ──

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Debounced persist ──

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (db) saveToIDB(db.export()).catch(console.error);
  }, 300);
}

// ── Public API ──

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const saved = await loadFromIDB();
  db = saved ? new SQL.Database(saved) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         INTEGER PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT 'New Conversation',
      agent_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  schedulePersist();
}

export function addConversation(id: number, agentType: string): void {
  if (!db) return;
  const now = new Date().toISOString();
  db.run(
    "INSERT OR IGNORE INTO conversations (id, title, agent_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [id, "New Conversation", agentType, now, now],
  );
  schedulePersist();
}

export function updateConversation(id: number, fields: Partial<Pick<ConvMeta, "title" | "agentType">>): void {
  if (!db) return;
  const sets: string[] = ["updated_at = ?"];
  const vals: (string | number)[] = [new Date().toISOString()];
  if (fields.title !== undefined) { sets.push("title = ?"); vals.push(fields.title); }
  if (fields.agentType !== undefined) { sets.push("agent_type = ?"); vals.push(fields.agentType); }
  vals.push(id);
  db.run(`UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`, vals);
  schedulePersist();
}

export function listConversations(): ConvMeta[] {
  if (!db) return [];
  const rows = db.exec("SELECT id, title, agent_type, created_at, updated_at FROM conversations ORDER BY updated_at DESC");
  if (!rows.length) return [];
  return rows[0].values.map((r) => ({
    id: r[0] as number,
    title: r[1] as string,
    agentType: r[2] as string,
    createdAt: r[3] as string,
    updatedAt: r[4] as string,
  }));
}

export function deleteConversation(id: number): void {
  if (!db) return;
  db.run("DELETE FROM conversations WHERE id = ?", [id]);
  schedulePersist();
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (sql.js ships its own types).

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts public/sql-wasm.wasm package.json package-lock.json
git commit -m "feat: add sql.js database layer for local conversation metadata persistence"
```

---

### Task 7: Add conversation list state to store + integrate db with useChat

**Files:**
- Modify: `src/stores/conversationStore.ts`
- Modify: `src/hooks/useChat.ts`

- [ ] **Step 1: Add conversation list state and methods to the store**

In `src/stores/conversationStore.ts`, add import at top:

```typescript
import { listConversations as dbList, addConversation as dbAdd, updateConversation as dbUpdate, deleteConversation as dbDelete, type ConvMeta } from "@/db";
```

Add to the `ConversationState` interface:

```typescript
  conversations: ConvMeta[];
  loadConversations: () => void;
  setMessages: (messages: Message[]) => void;
```

Add to the initial state (after `error: null`):

```typescript
  conversations: [],
```

Add implementations (after `reset`):

```typescript
  loadConversations: () => set({ conversations: dbList() }),

  setMessages: (messages) => set({ messages }),
```

- [ ] **Step 2: Integrate db with useChat**

In `src/hooks/useChat.ts`, add imports:

```typescript
import { addConversation as dbAdd, updateConversation as dbUpdate } from "@/db";
```

In `createConversation`, after `getState().setConversationId(reply.conversationId)`, add:

```typescript
    const idNum = Number(reply.conversationId);
    dbAdd(idNum, getState().agentType);
    getState().loadConversations();
```

In `sendMessage`, after the `await runStream(stream, signal)` call, add title generation logic:

```typescript
    // Update title from first user message
    const msgs = getState().messages;
    const userMsgs = msgs.filter((m) => m.role === "user");
    if (userMsgs.length === 1 && s.conversationId) {
      const title = query.length > 50 ? query.slice(0, 50) + "..." : query;
      dbUpdate(Number(s.conversationId), { title });
      getState().loadConversations();
    }
```

- [ ] **Step 3: Add `selectConversation` to useChat**

Add a new method in useChat that loads messages from the server for a given conversation:

```typescript
  const selectConversation = useCallback(async (id: bigint) => {
    const s = getState();
    if (s.isStreaming) return;
    s.reset();
    s.setConversationId(id);

    try {
      const resp = await agentClient.getConversationHistory({ conversationId: id });
      const messages: Message[] = [];
      for (const turn of resp.turns) {
        // User message
        const userText = turn.user
          .filter((b) => b.type === "text")
          .map((b) => (b.data as Record<string, unknown>)?.content ?? JSON.stringify(b.data))
          .join("\n");
        if (userText) {
          messages.push({ role: "user", blocks: [{ type: "text", content: userText }], reasoningContent: "", nodes: [] });
        }
        // Assistant message
        const assistantBlocks: ContentBlock[] = [];
        for (const block of turn.assistant) {
          if (block.type === "text") {
            const content = (block.data as Record<string, unknown>)?.content as string ?? JSON.stringify(block.data);
            assistantBlocks.push({ type: "text", content });
          } else if (block.type === "tool_call") {
            const data = block.data as Record<string, unknown>;
            assistantBlocks.push({
              type: "tool_call",
              data: {
                toolCallId: block.toolCallId || "",
                toolName: (data?.name as string) ?? "",
                toolInput: (data?.args as Record<string, unknown>) ?? {},
              },
            });
          } else if (block.type === "tool_result") {
            // Find matching tool_call and attach result
            const data = block.data as Record<string, unknown>;
            const existing = assistantBlocks.find(
              (b) => b.type === "tool_call" && b.data.toolCallId === block.toolCallId,
            );
            if (existing && existing.type === "tool_call") {
              existing.data.toolResult = (data?.content as Record<string, unknown>) ?? data ?? {};
            }
          }
        }
        if (assistantBlocks.length > 0) {
          messages.push({ role: "assistant", blocks: assistantBlocks, reasoningContent: "", nodes: [] });
        }
      }
      getState().setMessages(messages);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      getState().setError(`Load history: ${msg}`);
    }
  }, []);
```

Add `ContentBlock` type import from store:

```typescript
import { useConversationStore, type ContentBlock } from "@/stores/conversationStore";
```

Update the return statement:

```typescript
  return { createConversation, sendMessage, hitlResume, editResend, regenerate, cancelStream, selectConversation };
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/stores/conversationStore.ts src/hooks/useChat.ts
git commit -m "feat: integrate sql.js db with store and useChat for conversation list management"
```

---

### Task 8: Create Sidebar component

**Files:**
- Create: `src/components/Sidebar.tsx`

- [ ] **Step 1: Create `src/components/Sidebar.tsx`**

```tsx
import { useConversationStore } from "@/stores/conversationStore";
import type { ConvMeta } from "@/db";

interface SidebarProps {
  onNewChat: () => void;
  onSelectConversation: (id: bigint) => void;
}

function groupByDate(conversations: ConvMeta[]): { label: string; items: ConvMeta[] }[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const groups: Record<string, ConvMeta[]> = {};
  for (const conv of conversations) {
    const dateStr = new Date(conv.updatedAt).toDateString();
    let label: string;
    if (dateStr === todayStr) label = "Today";
    else if (dateStr === yesterdayStr) label = "Yesterday";
    else label = "Earlier";
    (groups[label] ??= []).push(conv);
  }

  const order = ["Today", "Yesterday", "Earlier"];
  return order.filter((l) => groups[l]?.length).map((label) => ({ label, items: groups[label] }));
}

const AGENT_BADGE_COLORS: Record<string, string> = {
  search: "bg-blue-100 text-blue-700",
  super: "bg-purple-100 text-purple-700",
  research: "bg-green-100 text-green-700",
  pixa: "bg-orange-100 text-orange-700",
};

export function Sidebar({ onNewChat, onSelectConversation }: SidebarProps) {
  const { conversations, conversationId } = useConversationStore();
  const groups = groupByDate(conversations);

  return (
    <aside className="w-[260px] shrink-0 bg-surface border-r border-border-light flex flex-col h-full">
      {/* New Chat button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full rounded-xl bg-accent text-white px-4 py-2 text-sm font-medium
                     hover:bg-accent-hover active:scale-[0.98] transition-all shadow-sm"
        >
          + New Chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 && (
          <p className="text-xs text-text-tertiary text-center mt-8">No conversations yet</p>
        )}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-2 py-1.5">
              {group.label}
            </div>
            {group.items.map((conv) => {
              const isActive = conversationId !== null && Number(conversationId) === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(BigInt(conv.id))}
                  className={`w-full text-left rounded-lg px-3 py-2 mb-0.5 transition-all text-sm
                    ${isActive
                      ? "bg-accent/10 text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                    }`}
                >
                  <div className="truncate text-[13px] font-medium leading-snug">{conv.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full capitalize
                      ${AGENT_BADGE_COLORS[conv.agentType] ?? "bg-surface-hover text-text-tertiary"}`}>
                      {conv.agentType}
                    </span>
                    <span className="text-[10px] text-text-tertiary">
                      {new Date(conv.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: create Sidebar component for conversation history navigation"
```

---

### Task 9: Restructure App layout with sidebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/main.tsx` (add db init)

- [ ] **Step 1: Add db initialization to `src/main.tsx`**

Read the current `src/main.tsx` first. Then wrap the app render with db init. Replace its content:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initDb } from "./db";
import "./index.css";

initDb().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
```

- [ ] **Step 2: Restructure `src/App.tsx` with sidebar**

Replace `src/App.tsx` with:

```tsx
import { useState, useEffect } from "react";
import { useConversationStore } from "@/stores/conversationStore";
import { useChat } from "@/hooks/useChat";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel } from "@/panels/ChatPanel";
import { PixaPanel } from "@/panels/PixaPanel";
import { HistoryPanel } from "@/panels/HistoryPanel";
import { HITLPanel } from "@/panels/HITLPanel";
import { ResumePanel } from "@/panels/ResumePanel";
import { PingPanel } from "@/panels/PingPanel";

const MODES = [
  { value: "chat", label: "Chat", desc: "Stream conversations" },
  { value: "pixa", label: "Pixa", desc: "Image & video generation" },
  { value: "history", label: "History", desc: "Browse conversations" },
  { value: "hitl", label: "HITL", desc: "Human-in-the-loop" },
  { value: "resume", label: "Resume", desc: "Reconnect streams" },
  { value: "ping", label: "Ping", desc: "Health check" },
] as const;

type Mode = (typeof MODES)[number]["value"];

const PANELS: Record<Mode, React.FC> = {
  chat: ChatPanel,
  pixa: PixaPanel,
  history: HistoryPanel,
  hitl: HITLPanel,
  resume: ResumePanel,
  ping: PingPanel,
};

export default function App() {
  const [mode, setMode] = useState<Mode>("chat");
  const Panel = PANELS[mode];
  const currentMode = MODES.find((m) => m.value === mode)!;
  const { createConversation, selectConversation } = useChat();
  const loadConversations = useConversationStore((s) => s.loadConversations);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleNewChat = async () => {
    setMode("chat");
    await createConversation();
  };

  const handleSelectConversation = async (id: bigint) => {
    setMode("chat");
    await selectConversation(id);
  };

  return (
    <div className="h-screen flex bg-background">
      <Sidebar onNewChat={handleNewChat} onSelectConversation={handleSelectConversation} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-5 px-6 py-3.5 bg-surface border-b border-border-light shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">A</span>
            </div>
            <span className="text-sm font-semibold text-text-primary tracking-tight">
              Agent Debug
            </span>
          </div>

          <div className="h-4 w-px bg-border" />

          <div className="relative">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="appearance-none rounded-lg bg-surface-hover pl-3 pr-8 py-1.5 text-sm font-medium
                         text-text-primary cursor-pointer border-none
                         hover:bg-border-light focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          <span className="text-xs text-text-tertiary">{currentMode.desc}</span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-hidden">
          <Panel />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Remove the "New Conversation" button from ChatPanel**

In `src/panels/ChatPanel.tsx`, remove the "New Conversation" button from the top controls section (lines 49-55) since this is now handled by the sidebar. The top controls bar becomes:

```tsx
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-light bg-surface-alt">
          {conversationId && (
            <code className="text-[11px] text-text-tertiary bg-surface-hover px-2 py-0.5 rounded-md">
              #{conversationId.toString()}
            </code>
          )}

          <div className="ml-auto flex items-center gap-2">
```

(The rest of the top controls — agent type selector and events toggle — remains the same.)

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Manual test**

```bash
npm run dev
```

Verify:
- Sidebar renders on the left
- "New Chat" creates a conversation and shows it in the sidebar
- Clicking a sidebar item loads its messages from the server
- Conversation title updates after first message
- Stop button appears during streaming and cancels the stream
- Edit button appears on hover over last user message
- Regenerate button appears on hover over last assistant message

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx src/App.tsx src/panels/ChatPanel.tsx
git commit -m "feat: restructure layout with sidebar, integrate conversation history + db init"
```
