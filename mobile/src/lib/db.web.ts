/** Web build (design previews): the same API as db.ts, kept in memory + localStorage. */
const mem = { chats: [] as any[], messages: new Map<number, any>(), cache: new Map<string, string>() };
const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const db: any = {
  getFirstSync: (sql: string) => (sql.includes('FROM messages') ? { c: JSON.stringify([...mem.messages.values()]).length } : { c: [...mem.cache.values()].join('').length }),
  execSync: (sql: string) => { if (sql.includes('cache')) mem.cache.clear(); },
};
export const kv = {
  get<T>(k: string, d: T): T { const v = ls(`kv.${k}`); try { return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(`kv.${k}`, JSON.stringify(v)); } catch {} },
};
export const cache = {
  get<T>(k: string): T | undefined { const v = mem.cache.get(k); return v ? (JSON.parse(v) as T) : undefined; },
  set(k: string, v: unknown) { mem.cache.set(k, JSON.stringify(v)); },
};
export function saveChats(chats: any[]) { mem.chats = chats; }
export const loadChats = (): any[] => mem.chats;
export function saveMessages(list: any[]) { for (const m of list) mem.messages.set(m.id, m); }
export const loadMessages = (chatId: number, limit = 60): any[] => [...mem.messages.values()].filter((m) => m.chatId === chatId).sort((a, b) => a.id - b.id).slice(-limit);
export function wipe() { mem.chats = []; mem.messages.clear(); mem.cache.clear(); }
