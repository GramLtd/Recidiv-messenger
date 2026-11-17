import { create } from 'zustand';
import { api, loadToken, saveToken, setUnauthorizedHandler } from './api';
import { connect, disconnect, on, emit } from './socket';
import { loadChats, saveChats, loadMessages, saveMessages, wipe } from './db';
import { notifyMessage } from './notify';
import { initE2E, encryptFor } from './e2e';
import { deriveKeys } from './seed';
import { secret } from './kv';
import { initFont } from './fonts';
import { Image } from 'expo-image';
import { cache } from './db';
import { mediaUrl } from './config';

export type Msg = any;
export type Chat = any;

type State = {
  booted: boolean;
  me: any | null;
  chats: Chat[];
  messages: Record<number, Msg[]>;
  hasMore: Record<number, boolean>;
  activeChatId: number | null;
  typing: Record<number, number>;
  boot: () => Promise<void>;
  login: (mnemonic: string) => Promise<void>;
  finishAuth: (token: string, user: any, e2eSecret?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshChats: () => Promise<void>;
  openChat: (id: number | null) => void;
  loadMessages: (chatId: number, older?: boolean) => Promise<void>;
  send: (chat: Chat, payload: { text?: string; replyTo?: number; media?: any; secret?: boolean }) => Promise<void>;
  upsertMessage: (m: Msg) => void;
  setMe: (u: any) => void;
  upsertChat: (c: Chat) => void;
  ensureChat: (id: number) => Promise<void>;
};

const sortChats = (list: Chat[]) => [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));

export const useStore = create<State>((set, get) => ({
  booted: false,
  me: null,
  chats: loadChats(),
  messages: {},
  hasMore: {},
  activeChatId: null,
  typing: {},

  async boot() {
    setUnauthorizedHandler(() => get().logout());
    await initFont().catch(() => {});
    const t = await loadToken();
    if (!t) return set({ booted: true });
    try {
      const { user } = await api('/auth/me');
      set({ me: user, booted: true });
      afterLogin();
    } catch {
      // offline: keep the cached session usable
      set({ booted: true, me: (await secret.get('me')) ? JSON.parse((await secret.get('me'))!) : null });
    }
  },
  async login(mnemonic) {
    const { authKey, e2eSecret } = await deriveKeys(mnemonic);
    const r = await api('/auth/login', { body: { authKey } });
    await get().finishAuth(r.token, r.user, e2eSecret);
  },
  async finishAuth(token, user, e2eSecret) {
    await saveToken(token);
    await secret.set('me', JSON.stringify(user));
    if (e2eSecret) await initE2E(e2eSecret);
    set({ me: user });
    afterLogin();
  },
  async logout() {
    api('/sessions/logout', { body: {} }).catch(() => {});
    disconnect();
    await saveToken(null);
    await secret.del('me');
    await secret.del('e2e');
    wipe();
    set({ me: null, chats: [], messages: {}, activeChatId: null });
  },
  async refreshChats() {
    const { chats } = await api('/chats');
    saveChats(chats);
    set({ chats: sortChats(chats) });
    chats.forEach((c: any) => { if (c.avatar) Image.prefetch(mediaUrl(c.avatar)!, 'memory-disk').catch(() => {}); });
  },
  openChat(id) {
    set({ activeChatId: id });
    if (id) {
      const c = get().chats.find((x) => x.id === id);
      if (c?.unread) set({ chats: get().chats.map((x) => (x.id === id ? { ...x, unread: 0 } : x)) });
    }
  },
  async loadMessages(chatId, older) {
    if (!older && !get().messages[chatId]) set({ messages: { ...get().messages, [chatId]: loadMessages(chatId) } });
    const cur = get().messages[chatId] || [];
    const before = older && cur.length ? cur[0].id : undefined;
    const r = await api(`/chats/${chatId}/messages${before ? `?before=${before}` : ''}`);
    saveMessages(r.messages);
    const merged = older ? [...r.messages, ...cur] : mergeById(cur, r.messages);
    set({ messages: { ...get().messages, [chatId]: merged }, hasMore: { ...get().hasMore, [chatId]: r.hasMore } });
    const last = merged[merged.length - 1];
    if (last && !older) api(`/chats/${chatId}/read`, { body: { messageId: last.id } }).catch(() => {});
  },
  async send(chat, p) {
    let body: any = { text: p.text, replyTo: p.replyTo, media: p.media };
    if (p.secret && chat.type === 'private' && chat.peer) body = { e2e: await encryptFor(chat.peer.id, p.text || ''), replyTo: p.replyTo };
    const { message } = await api(`/chats/${chat.id}/messages`, { body });
    get().upsertMessage(message);
  },
  upsertMessage(m) {
    const list = get().messages[m.chatId];
    if (list) set({ messages: { ...get().messages, [m.chatId]: mergeById(list, [m]) } });
    saveMessages([m]);
  },
  setMe(u) { set({ me: { ...get().me, ...u } }); },
  upsertChat(c) {
    const list = get().chats;
    set({ chats: list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? { ...x, ...c } : x)) : [...list, c] });
  },
  async ensureChat(id) {
    if (get().chats.some((x) => x.id === id)) return;
    const r = await api(`/chats/${id}`);
    if (r.chat) get().upsertChat(r.chat);
  },
}));

function mergeById(a: Msg[], b: Msg[]) {
  const map = new Map<number, Msg>();
  for (const m of a) map.set(m.id, m);
  for (const m of b) map.set(m.id, m);
  return [...map.values()].sort((x, y) => x.id - y.id);
}

let wired = false;
/** Warm the on-device image cache: my avatar, banner and gifts load instantly everywhere. */
function prefetchMine() {
  const me = useStore.getState().me;
  if (!me) return;
  const gifts: any[] = cache.get<any[]>(`gifts:${me.id}`) || [];
  const urls = [me.avatar, me.banner?.url, ...gifts.slice(0, 40).map((g) => g.collectible?.model?.image || g.gift?.image)]
    .filter(Boolean).map((u) => mediaUrl(u)!) as string[];
  if (urls.length) Image.prefetch(urls, 'memory-disk').catch(() => {});
  useStore.getState().chats.slice(0, 40).forEach((c) => { if (c.avatar) Image.prefetch(mediaUrl(c.avatar)!, 'memory-disk').catch(() => {}); });
}

function afterLogin() {
  const st = useStore.getState;
  setTimeout(prefetchMine, 300);
  initE2E().catch(() => {});
  st().refreshChats().catch(() => {});
  connect();
  if (wired) return;
  wired = true;
  on('connect', () => st().refreshChats().catch(() => {}));
  on('message:new', ({ message, chat }) => {
    const s = st();
    const chats = s.chats.some((c) => c.id === chat.id) ? s.chats.map((c) => (c.id === chat.id ? chat : c)) : [chat, ...s.chats];
    useStore.setState({ chats: sortChats(chats) });
    s.upsertMessage(message);
    if (message.sender?.id !== s.me?.id && !chat.muted) {
      if (s.activeChatId === message.chatId) api(`/chats/${chat.id}/read`, { body: { messageId: message.id } }).catch(() => {});
      notifyMessage(chat.title, message.type === 'secret' ? '🔒 Зашифрованное сообщение' : message.text || 'Новое сообщение', chat.id);
    }
  });
  on('message:update', ({ message }) => st().upsertMessage(message));
  on('message:delete', ({ chatId, messageId }) => {
    const list = st().messages[chatId];
    if (list) useStore.setState({ messages: { ...st().messages, [chatId]: list.map((m) => (m.id === messageId ? { ...m, deleted: true, text: '', media: null } : m)) } });
    if (st().chats.find((c) => c.id === chatId)?.lastMessage?.id === messageId) st().refreshChats().catch(() => {});
  });
  on('typing', ({ chatId }) => useStore.setState({ typing: { ...st().typing, [chatId]: Date.now() + 4000 } }));
  on('balance', ({ balance }) => st().setMe({ balance }));
}
export const sendTyping = (chatId: number) => emit('typing', { chatId });
