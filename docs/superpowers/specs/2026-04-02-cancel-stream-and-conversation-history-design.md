# Cancel Stream, Edit/Resend, Regenerate & Conversation History Design

## Overview

Four features for the agnes frontend:

1. **Cancel Stream** — Stop an in-flight agent stream mid-execution
2. **Edit & Resend** — Edit last user message and resend
3. **Regenerate** — Re-generate last assistant response
4. **Conversation History Sidebar** — Left sidebar with locally persisted conversation list (sql.js + IndexedDB), messages loaded from server on demand

---

## Feature 1: Cancel Stream

### Backend RPC (already exists)

```proto
rpc CancelStream (CancelRequest) returns (CancelReply);

message CancelRequest {
  int64 conversation_id = 1;
}
message CancelReply {}
```

### Frontend Changes

#### 1.1 Regenerate Proto TypeScript

Run `npm run proto:gen` to pick up `CancelStream`, `EditResendStream`, `RegenerateStream` RPCs that are missing from the current generated code.

#### 1.2 AbortController in useChat

Add an `AbortController` to the streaming call so we can abort the local `for await` loop:

- Store an AbortController ref in useChat
- Pass signal to agentClient streaming calls via CallOptions
- On cancel: call `agentClient.cancelStream({ conversationId })` then abort the controller
- Reset AbortController on each new stream

The cancel flow:
1. User clicks "Stop" button
2. `cancelStream()` is called in useChat
3. Sends `CancelStream` RPC to backend (tells server to stop generating)
4. Aborts local AbortController (breaks `for await` loop)
5. `setStreaming(false)` in finally block

#### 1.3 ChatPanel UI

- When `isStreaming === true`, replace the send button with a "Stop" button (square icon)
- Clicking "Stop" calls `cancelStream()` from useChat
- The partial response already rendered stays visible

---

## Feature 2: Edit & Resend

### Backend RPC (already exists)

```proto
// Invalidate last round, resend with edited query
rpc EditResendStream (EditResendRequest) returns (stream common.v1.AgentStreamEvent);

message EditResendRequest {
  int64 conversation_id = 1;   // conversation ID
  string query = 2;            // edited user input
}
```

The backend invalidates the last user+assistant message pair, then streams a new response using the edited query.

### Frontend Changes

#### 2.1 useChat hook: `editResend(newQuery: string)`

- Remove the last user message + assistant response from local `messages` state
- Call `agentClient.editResendStream({ conversationId, query: newQuery })`
- Add the edited user message to UI, then stream the new response (same `for await` pattern as `sendMessage`)
- Supports AbortController for cancellation

#### 2.2 MessageBubble UI: Edit button on user messages

- Hover on the last user message shows an "Edit" icon button
- Only the **last** user message is editable (backend only supports invalidating the last round)
- Clicking "Edit" enters inline edit mode:
  - The message text becomes an editable textarea (pre-filled with original text)
  - "Save & Resend" and "Cancel" buttons below
- "Save & Resend" calls `editResend(newQuery)` from useChat
- "Cancel" exits edit mode, restores original text

---

## Feature 3: Regenerate

### Backend RPC (already exists)

```proto
// Invalidate last assistant response, regenerate with original input
rpc RegenerateStream (RegenerateRequest) returns (stream common.v1.AgentStreamEvent);

message RegenerateRequest {
  int64 conversation_id = 1;
  google.protobuf.Struct extra_params = 2;  // optional
}
```

The backend invalidates the last assistant response and regenerates using the original user input.

### Frontend Changes

#### 3.1 useChat hook: `regenerate()`

- Remove the last assistant message from local `messages` state
- Call `agentClient.regenerateStream({ conversationId })`
- Stream the new response (same pattern)
- Supports AbortController for cancellation

#### 3.2 MessageBubble UI: Regenerate button on assistant messages

- Below the **last** assistant message (when not streaming), show a "Regenerate" icon button
- Only visible on the last assistant message
- Clicking calls `regenerate()` from useChat

---

## Feature 4: Conversation History Sidebar

### Architecture

```
+------------------+  +----------------------------------+
|   Sidebar        |  |   Main Content                   |
|                  |  |                                  |
|  [+ New Chat]    |  |   ChatPanel / PixaPanel / etc    |
|                  |  |                                  |
|  Today           |  |                                  |
|   > Conv title   |  |                                  |
|   > Conv title   |  |                                  |
|  Yesterday       |  |                                  |
|   > Conv title   |  |                                  |
|                  |  |                                  |
+------------------+  +----------------------------------+
```

### Storage: sql.js + IndexedDB

**Why sql.js:**
- Only storing conversation metadata (not messages), data is tiny
- Zero config, no special HTTP headers needed
- Synchronous API, simple to use
- Persist by exporting db bytes to IndexedDB on write

**Schema:**

```sql
CREATE TABLE conversations (
  id           INTEGER PRIMARY KEY,  -- conversation_id from backend
  title        TEXT NOT NULL DEFAULT 'New Conversation',
  agent_type   TEXT NOT NULL,
  created_at   TEXT NOT NULL,        -- ISO 8601
  updated_at   TEXT NOT NULL         -- ISO 8601
);
```

**Persistence strategy:**
- On app load: read db bytes from IndexedDB, initialize sql.js Database
- On write (insert/update): run SQL, then debounced (300ms) export db bytes to IndexedDB
- Lightweight — the entire db will be a few KB at most

### 4.1 Database Layer: `src/db/index.ts`

A thin wrapper over sql.js:

```
- initDb(): Promise<void>         — load WASM, restore from IndexedDB or create fresh
- addConversation(conv): void     — INSERT into conversations
- updateConversation(id, fields)  — UPDATE partial fields
- listConversations(): Conv[]     — SELECT all, ORDER BY updated_at DESC
- deleteConversation(id): void    — DELETE by id
- persistToIndexedDB(): void      — debounced, export + store bytes
```

### 4.2 Conversation Store Changes

Current `conversationStore` manages a single active conversation. Changes:

- Add `conversations: ConvMeta[]` — list from local db, for sidebar rendering
- Add `loadConversations()` — read from sql.js db
- Add `selectConversation(id)` — set active conversation, call `GetConversationHistory` to load messages
- On `createConversation` success: also insert into local db
- On `sendMessage` first response: derive title from first user message, update local db

### 4.3 Sidebar Component: `src/components/Sidebar.tsx`

- Fixed left panel (~260px)
- "New Chat" button at top
- Conversation list grouped by date (Today / Yesterday / Earlier)
- Each item shows: title (truncated), agent type badge, relative time
- Active conversation highlighted
- Click to switch conversations (loads messages from server)
- Optional: delete conversation from local history

### 4.4 Layout Changes: `App.tsx`

Current layout: header + mode dropdown + single panel. Change to:

```
<div class="flex h-screen">
  <Sidebar />                    <!-- fixed left -->
  <main class="flex-1">
    <Header />                   <!-- mode selector, settings -->
    <ActivePanel />              <!-- ChatPanel, PixaPanel, etc -->
  </main>
</div>
```

The mode dropdown (chat/pixa/history/etc.) stays in the header, but the sidebar is always visible.

### 4.5 Title Generation

- When creating a conversation: title defaults to "New Conversation"
- After the first user message is sent: update title to the truncated first message (first 50 chars)
- Store title update in local SQLite

---

## Shared: Stream Helper Refactor

All four streaming operations (chatStream, hitlResumeStream, editResendStream, regenerateStream) share the same pattern:

1. Set streaming state
2. Create AbortController
3. `for await` over events, call `processEvent()`
4. Handle errors
5. Set streaming false in finally

Extract a `runStream(streamIterable, signal)` helper in useChat to avoid duplicating this logic across sendMessage, hitlResume, editResend, and regenerate.

---

## Scope Exclusions

- No full message persistence locally (messages fetched from server)
- No search across conversations
- No conversation sharing/export
- No offline message viewing (requires server connection for message content)
- `extra_params` for RegenerateStream not exposed in UI (can add later)

---

## Dependencies

- `sql.js` — SQLite WASM library
- Proto regeneration for new RPCs

## File Changes Summary

| File | Change |
|------|--------|
| `src/gen/` | Regenerated proto (new RPCs) |
| `src/db/index.ts` | **New** — sql.js wrapper |
| `src/hooks/useChat.ts` | Add cancelStream, editResend, regenerate, runStream helper, AbortController |
| `src/stores/conversationStore.ts` | Add conversation list state, selectConversation, message removal helpers |
| `src/components/Sidebar.tsx` | **New** — conversation history sidebar |
| `src/components/MessageBubble.tsx` | Edit button on last user msg, regenerate button on last assistant msg |
| `src/App.tsx` | Layout change: sidebar + main content |
| `src/panels/ChatPanel.tsx` | Stop button during streaming, pass edit/regenerate callbacks |
