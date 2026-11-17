import * as SQLite from 'expo-sqlite';

/**
 * Local database (SQLite): chats and messages are cached so screens open instantly and work offline;
 * the network layer keeps it in sync. Settings live in a small key/value table.
 */
export const db = SQLite.openDatabaseSync('recidivist.db');
db.execSync(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY, json TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, chat_id INTEGER NOT NULL, json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT, t INTEGER);
`);

export const kv = {
  get<T>(k: string, d: T): T {
    const r = db.getFirstSync<{ v: string }>('SELECT v FROM kv WHERE k = ?', [k]);
    try { return r ? (JSON.parse(r.v) as T) : d; } catch { return d; }
  },
  set(k: string, v: unknown) { db.runSync('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', [k, JSON.stringify(v)]); },
};

export const cache = {
  get<T>(k: string): T | undefined {
    const r = db.getFirstSync<{ v: string }>('SELECT v FROM cache WHERE k = ?', [k]);
    try { return r ? (JSON.parse(r.v) as T) : undefined; } catch { return undefined; }
  },
  set(k: string, v: unknown) { db.runSync('INSERT OR REPLACE INTO cache (k, v, t) VALUES (?, ?, ?)', [k, JSON.stringify(v), Date.now()]); },
};

export function saveChats(chats: any[]) {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM chats');
    chats.forEach((c, i) => db.runSync('INSERT INTO chats (id, json, sort) VALUES (?, ?, ?)', [c.id, JSON.stringify(c), i]));
  });
}
export const loadChats = (): any[] => db.getAllSync<{ json: string }>('SELECT json FROM chats ORDER BY sort').map((r) => JSON.parse(r.json));

export function saveMessages(list: any[]) {
  db.withTransactionSync(() => {
    for (const m of list) db.runSync('INSERT OR REPLACE INTO messages (id, chat_id, json) VALUES (?, ?, ?)', [m.id, m.chatId, JSON.stringify(m)]);
  });
}
export const loadMessages = (chatId: number, limit = 60): any[] =>
  db.getAllSync<{ json: string }>('SELECT json FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?', [chatId, limit]).map((r) => JSON.parse(r.json)).reverse();

export function wipe() {
  db.execSync('DELETE FROM chats; DELETE FROM messages; DELETE FROM cache;');
}
