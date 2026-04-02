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
