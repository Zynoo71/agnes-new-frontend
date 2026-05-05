import initSqlJs, { type Database } from "sql.js";

export interface ConvMeta {
  id: string;  // stored as TEXT to preserve BigInt precision
  title: string;
  agentType: string;
  systemPromptId: string | null;
  llmAlias: string | null;
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

function hasColumn(name: string): boolean {
  if (!db) return false;
  const cols = db.exec("PRAGMA table_info(conversations)");
  return cols[0]?.values.some((row) => row[1] === name) ?? false;
}

// ── Public API ──

export async function initDb(): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => "/sql-wasm.wasm" });
  const saved = await loadFromIDB();
  db = saved ? new SQL.Database(saved) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL DEFAULT '',
      title             TEXT NOT NULL DEFAULT 'New Conversation',
      agent_type        TEXT NOT NULL,
      system_prompt_id  TEXT,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    )
  `);

  // Migrations for existing databases. Each guarded by a column check so
  // they're idempotent across reloads.
  if (!hasColumn("system_prompt_id")) {
    db.run("ALTER TABLE conversations ADD COLUMN system_prompt_id TEXT");
  }
  if (!hasColumn("user_id")) {
    // Pre-existing rows stay associated with '' (orphaned). Real users never
    // see them because list() filters by exact match.
    db.run("ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn("llm_alias")) {
    db.run("ALTER TABLE conversations ADD COLUMN llm_alias TEXT");
  }
}

export function addConversation(userId: string, id: string, agentType: string, systemPromptId?: string, llmAlias?: string): void {
  if (!db) return;
  const now = new Date().toISOString();
  db.run(
    "INSERT OR IGNORE INTO conversations (id, user_id, title, agent_type, system_prompt_id, llm_alias, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, userId, "New Conversation", agentType, systemPromptId ?? null, llmAlias ?? null, now, now],
  );
  schedulePersist();
}

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

// Must match userStore's USER_ID_PATTERN exactly — kept duplicated to avoid a
// circular dependency between the store and the db layer.
const SAFE_USER_ID = /^[A-Za-z0-9._-]+$/;

export function listConversations(userId: string): ConvMeta[] {
  if (!db) return [];
  // sql.js exec() has no params overload in its type defs; inline userId
  // after re-validating so this stays injection-proof even if an unvalidated
  // caller slips through.
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

export function deleteConversation(userId: string, id: string): void {
  if (!db) return;
  db.run("DELETE FROM conversations WHERE id = ? AND user_id = ?", [id, userId]);
  schedulePersist();
}
