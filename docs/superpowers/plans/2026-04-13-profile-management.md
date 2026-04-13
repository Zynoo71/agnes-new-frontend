# Profile Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a profile management page where users can view and edit their Soul (behavioral preferences) and Identity (personal facts) profile facts via gRPC CRUD.

**Architecture:** A Zustand store wraps the 4 profile gRPC RPCs (list/create/update/delete), parameterized by `field` ("soul"/"identity"). A new `/profile` page shows two columns — one per field — each with an inline fact list and add/edit/delete controls. The `user_id` is read from `VITE_DEV_USER_ID`.

**Tech Stack:** React 19, TypeScript, Zustand, @connectrpc/connect-web, Tailwind CSS

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/stores/profileStore.ts` | Create | Zustand store wrapping profile gRPC CRUD |
| `src/pages/ProfilePage.tsx` | Create | Two-column page (Soul / Identity) with fact list + inline editing |
| `src/App.tsx` | Modify | Add `/profile` route |
| `src/components/Sidebar.tsx` | Modify | Add "Profile" nav link below "Prompts" |

---

### Task 1: Profile Zustand Store

**Files:**
- Create: `src/stores/profileStore.ts`

- [ ] **Step 1: Create the store**

Create `src/stores/profileStore.ts`:

```typescript
import { create } from "zustand";
import { agentClient } from "@/grpc/client";
import type { ProfileFactInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID ?? "";

type Field = "soul" | "identity";

interface ProfileStore {
  soul: ProfileFactInfo[];
  identity: ProfileFactInfo[];
  loading: boolean;
  loaded: boolean;

  load: () => Promise<void>;
  createFact: (field: Field, content: string) => Promise<void>;
  updateFact: (field: Field, factId: number, content: string) => Promise<void>;
  removeFact: (field: Field, factId: number) => Promise<void>;
}

export const useProfileStore = create<ProfileStore>((set, get) => ({
  soul: [],
  identity: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [soulResp, identityResp] = await Promise.all([
        agentClient.listProfileFacts({ userId: DEV_USER_ID, field: "soul" }),
        agentClient.listProfileFacts({ userId: DEV_USER_ID, field: "identity" }),
      ]);
      set({ soul: soulResp.facts, identity: identityResp.facts, loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  createFact: async (field, content) => {
    const fact = await agentClient.createProfileFact({ userId: DEV_USER_ID, field, content });
    set((s) => ({ [field]: [...s[field], fact] }));
  },

  updateFact: async (field, factId, content) => {
    const updated = await agentClient.updateProfileFact({ userId: DEV_USER_ID, field, factId, content });
    set((s) => ({
      [field]: s[field].map((f) => (f.id === factId ? updated : f)),
    }));
  },

  removeFact: async (field, factId) => {
    await agentClient.deleteProfileFact({ userId: DEV_USER_ID, field, factId });
    set((s) => ({
      [field]: s[field].filter((f) => f.id !== factId),
    }));
  },
}));
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/stores/profileStore.ts
git commit -m "feat: add profile Zustand store for soul/identity facts"
```

---

### Task 2: Profile Management Page

**Files:**
- Create: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: Create the page component**

Create `src/pages/ProfilePage.tsx`:

```tsx
import { useState, useEffect } from "react";
import { useProfileStore } from "@/stores/profileStore";
import type { ProfileFactInfo } from "@/gen/kw_agent_service/v1/kw_agent_service_pb";

type Field = "soul" | "identity";

const FIELD_CONFIG = {
  soul: {
    title: "Soul",
    description: "How Agnes should respond to you — behavioral preferences and communication style.",
    placeholder: "e.g. Always reply in Chinese",
  },
  identity: {
    title: "Identity",
    description: "Who you are — personal facts that help Agnes understand your context.",
    placeholder: "e.g. Works as a designer at a game studio",
  },
} as const;

function FactItem({
  fact,
  field,
}: {
  fact: ProfileFactInfo;
  field: Field;
}) {
  const { updateFact, removeFact } = useProfileStore();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(fact.content);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    const trimmed = editContent.trim();
    if (!trimmed || trimmed === fact.content || saving) return;
    setSaving(true);
    try {
      await updateFact(field, fact.id, trimmed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await removeFact(field, fact.id);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="border border-accent/40 rounded-lg p-3 bg-accent/5">
        <textarea
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          rows={2}
          className="w-full text-sm bg-transparent border-none resize-none focus:outline-none"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={() => { setEditing(false); setEditContent(fact.content); }}
            className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!editContent.trim() || editContent.trim() === fact.content || saving}
            className="text-xs font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors">
      <span className="text-text-tertiary mt-0.5 text-xs">•</span>
      <div className="flex-1 text-sm text-text-primary leading-relaxed">{fact.content}</div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="p-1 rounded text-text-tertiary hover:text-text-secondary transition-colors"
          title="Edit"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={saving}
              className="text-[10px] font-medium text-white bg-error px-1.5 py-0.5 rounded hover:bg-error/80 transition-colors disabled:opacity-50"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded text-text-tertiary hover:text-error transition-colors"
            title="Delete"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function AddFactInput({ field }: { field: Field }) {
  const { createFact } = useProfileStore();
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    const trimmed = content.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await createFact(field, trimmed);
      setContent("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 pt-2">
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) handleAdd(); }}
        placeholder={FIELD_CONFIG[field].placeholder}
        className="flex-1 text-sm bg-transparent border-none focus:outline-none placeholder:text-text-tertiary"
      />
      <button
        onClick={handleAdd}
        disabled={!content.trim() || saving}
        className="text-xs font-medium text-accent hover:text-accent-hover transition-colors disabled:opacity-50 shrink-0"
      >
        {saving ? "Adding..." : "+ Add"}
      </button>
    </div>
  );
}

function FieldColumn({ field }: { field: Field }) {
  const facts = useProfileStore((s) => s[field]);
  const config = FIELD_CONFIG[field];

  return (
    <div className="flex-1 min-w-0">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-text-primary">{config.title}</h3>
        <p className="text-xs text-text-tertiary mt-0.5">{config.description}</p>
      </div>
      <div className="border border-border rounded-xl bg-surface">
        <div className="divide-y divide-border-light">
          {facts.length === 0 ? (
            <div className="px-3 py-4 text-xs text-text-tertiary text-center">No facts yet</div>
          ) : (
            facts.map((fact) => (
              <FactItem key={fact.id} fact={fact} field={field} />
            ))
          )}
        </div>
        <div className="border-t border-border-light">
          <AddFactInput field={field} />
        </div>
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { loading, loaded, load } = useProfileStore();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-border-light bg-surface-alt">
        <h2 className="text-base font-semibold text-text-primary">Profile</h2>
        <p className="text-xs text-text-tertiary mt-0.5">Personalize how Agnes interacts with you.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && !loaded ? (
          <div className="text-sm text-text-tertiary text-center mt-12">Loading...</div>
        ) : (
          <div className="flex gap-6 max-w-4xl">
            <FieldColumn field="soul" />
            <FieldColumn field="identity" />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "feat: add profile management page with soul/identity columns"
```

---

### Task 3: Route & Sidebar Navigation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add `/profile` route**

In `src/App.tsx`, add the import at the top (after the PromptManagementPage import):
```typescript
import { ProfilePage } from "@/pages/ProfilePage";
```

Add the route inside `<Routes>`, after the `/prompts` route (line 76):
```tsx
<Route path="/profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
```

- [ ] **Step 2: Add Profile nav link to Sidebar**

In `src/components/Sidebar.tsx`, find the `isPromptsActive` line and add below it:
```typescript
const isProfileActive = location.pathname === "/profile";
```

After the Prompts link `</div>` (line 123), add:

```tsx
      {/* Profile link */}
      <div className={`px-2 pb-2 ${collapsed ? "px-1.5" : ""}`}>
        <button
          onClick={() => navigate("/profile")}
          className={`w-full rounded-lg text-sm font-medium transition-all
                     ${collapsed ? "p-2 flex items-center justify-center" : "px-3 py-2 flex items-center gap-2"}
                     ${isProfileActive
                       ? "bg-accent/10 text-accent"
                       : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                     }`}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {!collapsed && <span>Profile</span>}
        </button>
      </div>
```

- [ ] **Step 3: Verify compilation**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Verify page renders**

Open http://localhost:5174/profile. Expected: two-column layout with "Soul" and "Identity" sections, each with empty state and an add input at the bottom.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx
git commit -m "feat: add /profile route and sidebar navigation"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 2: Test full flow**

Open http://localhost:5174/profile (with backend running):
1. Add a soul fact → appears in the soul list
2. Edit the fact → content updates
3. Delete the fact → disappears
4. Same for identity facts
5. Sidebar "Profile" link highlights when active
6. Verify other pages (chat, prompts) still work

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: address issues found during profile management testing"
```
