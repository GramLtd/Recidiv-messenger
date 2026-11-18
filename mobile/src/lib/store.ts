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
  login: (mnemonic: string) => Promise<void | { needPassword: true; hint: string | null; finish: (password: string) => Promise<void> }>;
  finishAuth: (token: string, user: any, e2eSecret?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshChats: () => Promise<void>;
  openChat: (id: number | null) => void;
  loadMessages: (chatId: number, older?: boolean, topic?: number | null) => Promise<void>;
  activeTopic: number | null;
  topics: Record<number, any[]>;
  hasMoreTopic: Record<string, boolean>;
  loadTopics: (chatId: number) => Promise<void>;
  patchTopic: (chatId: number, topic: any, add?: boolean) => void;
  send: (chat: Chat, payload: { text?: string; replyTo?: number; media?: any; secret?: boolean; silent?: boolean; ttl?: number }) => Promise<void>;
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
  activeTopic: null,
  topics: {},
  hasMoreTopic: {},
  async loadTopics(chatId) {
    try { const r = await api(`/chats/${chatId}/topics`); set({ topics: { ...get().topics, [chatId]: r.topics } }); } catch {}
  },
  patchTopic(chatId, topic, add) {
    const list = get().topics[chatId];
    if (!list) return;
    const has = list.some((t) => t.id === topic.id);
    if (!has && !add) return;
    const next = has ? list.map((t) => (t.id === topic.id ? { ...t, ...topic } : t)) : [list[0], topic, ...list.slice(1)];
    const [general, ...rest] = next;
    rest.sort((a: any, b: any) => (b.pinned - a.pinned) || ((b.lastMessage?.id || 0) - (a.lastMessage?.id || 0)) || b.id - a.id);
    set({ topics: { ...get().topics, [chatId]: [general, ...rest] } });
  },
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
    if (r.needPassword) {
      return { needPassword: true, hint: r.hint, finish: async (password: string) => {
        const x = await api('/auth/login/password', { body: { ticket: r.ticket, password } });
        await get().finishAuth(x.token, x.user, e2eSecret);
      } };
    }
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
  async loadMessages(chatId, older, topic) {
    if (topic !== undefined && topic !== null) {
      // forum topic: fetch only that topic; merged into the chat's cache, the screen filters by topicId
      const cur = get().messages[chatId] || [];
      const mine = cur.filter((m: any) => (m.topicId || 0) === topic);
      const before = older && mine.length ? mine[0].id : undefined;
      const r = await api(`/chats/${chatId}/messages?topic=${topic}${before ? `&before=${before}` : ''}`);
      set({ messages: { ...get().messages, [chatId]: mergeById(get().messages[chatId] || [], r.messages) }, hasMoreTopic: { ...get().hasMoreTopic, [`${chatId}:${topic}`]: r.hasMore } });
      const last = r.messages[r.messages.length - 1];
      if (last && !older) api(`/chats/${chatId}/read`, { body: { messageId: Math.max(last.id, get().chats.find((c) => c.id === chatId)?.lastMessage?.id || 0) } }).catch(() => {});
      return;
    }
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
    let body: any = { text: p.text, replyTo: p.replyTo, media: p.media, silent: p.silent || undefined, ttl: p.ttl || undefined };
    if (p.secret && chat.type === 'private' && chat.peer) body = { e2e: await encryptFor(chat.peer.id, p.text || ''), replyTo: p.replyTo };
    if ((chat as any).forum && get().activeTopic) body.topicId = get().activeTopic;
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
    if (chat.forum && !message.topicId) s.patchTopic(chat.id, { id: 0, lastMessage: { id: message.id, text: message.text || 'Вложение', senderName: message.sender?.displayName, createdAt: message.createdAt } });
    if (message.sender?.id !== s.me?.id && !chat.muted) {
      if (s.activeChatId === message.chatId) api(`/chats/${chat.id}/read`, { body: { messageId: message.id } }).catch(() => {});
      if (!message.silent) notifyMessage(chat.title, message.type === 'secret' ? '🔒 Зашифрованное сообщение' : message.text || 'Новое сообщение', chat.id);
    }
  });
  on('message:update', ({ message }) => st().upsertMessage(message));
  on('message:delete', ({ chatId, messageId }) => {
    const list = st().messages[chatId];
    if (list) useStore.setState({ messages: { ...st().messages, [chatId]: list.map((m) => (m.id === messageId ? { ...m, deleted: true, text: '', media: null } : m)) } });
    if (st().chats.find((c) => c.id === chatId)?.lastMessage?.id === messageId) st().refreshChats().catch(() => {});
  });
  on('chat:update', ({ chat }) => st().upsertChat(chat));
  on('topic:update', ({ topic }) => st().patchTopic(topic.chatId, topic, true));
  on('topic:delete', ({ chatId, topicId }) => useStore.setState({ topics: { ...st().topics, [chatId]: (st().topics[chatId] || []).filter((t) => t.id !== topicId) } }));
  on('chat:removed', ({ chatId }) => useStore.setState({ chats: st().chats.filter((c) => c.id !== chatId) }));
  on('typing', ({ chatId }) => useStore.setState({ typing: { ...st().typing, [chatId]: Date.now() + 4000 } }));
  on('balance', ({ balance }) => st().setMe({ balance }));
}
export const sendTyping = (chatId: number) => emit('typing', { chatId });
