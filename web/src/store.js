import { loadTheme } from './theme.js';
import { create } from 'zustand';
import { stripFormatting } from './richtext.jsx';
import { io } from 'socket.io-client';
import { api, setToken, getToken, API_ORIGIN } from './api.js';

let socket = null;
export const getSocket = () => socket;
const socketListeners = [];
/** Lets other modules (calls) subscribe to socket events, also across reconnects. */
export const onSocket = (ev, fn) => { socketListeners.push([ev, fn]); socket?.on(ev, fn); return () => socket?.off(ev, fn); };
const sortChats = (list) =>
  [...list].sort((a, b) => (b.pinned - a.pinned) || ((b.lastMessage?.id || 0) - (a.lastMessage?.id || 0)) || (b.id - a.id));

export const useStore = create((set, get) => ({
  me: null,
  booted: false,
  currency: { name: 'Искры', symbol: '✦' },
  chats: [],
  messages: {}, // chatId -> Message[]
  hasMore: {},
  activeChatId: null,
  typing: {}, // chatId -> { userId: {name, until} }
  stories: [],
  modals: [],
  toasts: [],
  rightPanel: false,
  tab: 'chats', // chats | gifts | profile | music | market | settings

  // ---------- session ----------
  async boot() {
    if (!getToken()) return set({ booted: true });
    try {
      const { user } = await api('/auth/me');
      set({ me: user });
      get().afterLogin();
    } catch {
      setToken(null);
    }
    set({ booted: true });
  },
  login(token, user) {
    setToken(token);
    set({ me: user });
    get().afterLogin();
  },
  logout() {
    import('./components/common.jsx').then((m) => m.clearAsyncCache());
    setToken(null);
    socket?.disconnect();
    socket = null;
    set({ me: null, chats: [], messages: {}, activeChatId: null, stories: [], modals: [], tab: 'chats' });
  },
  afterLogin() {
    get().loadChats();
    get().loadStories();
    api('/config/public').then((c) => set({ currency: c.currency })).catch(() => {});
    get().connect();
  },
  setMe(user) {
    set({ me: { ...get().me, ...user } });
  },

  // ---------- realtime ----------
  connect() {
    socket?.disconnect();
    socket = io(API_ORIGIN || undefined, { auth: { token: getToken() }, transports: ['websocket', 'polling'] });
    for (const [ev, fn] of socketListeners) socket.on(ev, fn);
    const s = socket;
    s.on('connect', () => get().loadChats());
    s.on('toast', ({ text }) => text && get().toast(text, 'error'));
    s.on('message:new', ({ message, chat }) => {
      get().upsertChat(chat);
      const list = get().messages[message.chatId];
      if (list && !list.some((m) => m.id === message.id)) {
        set({ messages: { ...get().messages, [message.chatId]: [...list, message] } });
      }
      // forum groups: the open topic gets it too, and «General» shows the newest line
      if (chat?.forum) {
        const tk = `${message.chatId}:${message.topicId || 0}`;
        const tl = get().messages[tk];
        if (tl && !tl.some((m) => m.id === message.id)) set({ messages: { ...get().messages, [tk]: [...tl, message] } });
        if (!message.topicId) get().patchTopic(message.chatId, { id: 0, lastMessage: { id: message.id, text: message.text || 'Вложение', senderName: message.sender?.displayName, createdAt: message.createdAt } });
      }
      if (message.sender) get().clearTyping(message.chatId, message.sender.id);
      const me = get().me;
      if (message.sender?.id !== me?.id && !chat.muted && !message.silent) {
        if (document.hidden || get().activeChatId !== message.chatId) notifyBrowser(chat, message);
      }
      if (get().activeChatId === message.chatId && !document.hidden) get().markRead(message.chatId);
    });
    s.on('message:update', ({ message }) => get().patchMessage(message));
    s.on('message:delete', ({ chatId, messageId }) => {
      const all = { ...get().messages };
      for (const k of Object.keys(all)) if (k === String(chatId) || k.startsWith(`${chatId}:`)) all[k] = all[k].map((m) => (m.id === messageId ? { ...m, deleted: true, text: '', media: null } : m));
      set({ messages: all });
      get().refreshChat(chatId);
    });
    s.on('chat:update', ({ chat }) => get().upsertChat(chat));
    s.on('topic:update', ({ topic }) => get().patchTopic(topic.chatId, topic, true));
    s.on('topic:delete', ({ chatId, topicId }) => {
      set({ topics: { ...get().topics, [chatId]: (get().topics[chatId] || []).filter((t) => t.id !== topicId) } });
      if (get().topicOf[chatId] === topicId) get().openTopic(chatId, undefined);
    });
    s.on('chat:removed', ({ chatId }) => get().removeChat(chatId));
    s.on('read', ({ chatId, messageId }) => {
      const c = get().chats.find((x) => x.id === chatId);
      if (c && messageId > c.peerReadId) get().upsertChat({ ...c, peerReadId: messageId });
    });
    s.on('typing', ({ chatId, userId, name, action }) => {
      const t = { ...get().typing };
      t[chatId] = { ...(t[chatId] || {}), [userId]: { name, action, until: Date.now() + 5000 } };
      set({ typing: t });
      setTimeout(() => get().clearTyping(chatId, userId, true), 5200);
    });
    s.on('presence', ({ userId, online, lastSeen }) => {
      set({
        chats: get().chats.map((c) => (c.peer?.id === userId ? { ...c, peer: { ...c.peer, online, lastSeen } } : c)),
      });
    });
    s.on('balance', ({ balance }) => get().setMe({ balance }));
    s.on('gift:received', () => get().toast('🎁 Вы получили подарок!'));
    s.on('story:new', () => get().loadStories());
    s.on('force-logout', () => get().logout());
  },
  emitTyping(chatId) {
    socket?.emit('typing', { chatId });
  },
  clearTyping(chatId, userId, onlyExpired) {
    const t = { ...get().typing };
    const entry = t[chatId]?.[userId];
    if (!entry || (onlyExpired && entry.until > Date.now())) return;
    const c = { ...t[chatId] };
    delete c[userId];
    t[chatId] = c;
    set({ typing: t });
  },

  // ---------- chats ----------
  async loadChats() {
    const { chats } = await api('/chats');
    set({ chats: sortChats(chats) });
  },
  upsertChat(chat) {
    if (!chat) return;
    const exists = get().chats.some((c) => c.id === chat.id);
    const chats = exists ? get().chats.map((c) => (c.id === chat.id ? { ...c, ...chat } : c)) : [chat, ...get().chats];
    set({ chats: sortChats(chats) });
  },
  removeChat(chatId) {
    set({ chats: get().chats.filter((c) => c.id !== chatId), activeChatId: get().activeChatId === chatId ? null : get().activeChatId });
  },
  async refreshChat(chatId) {
    try {
      const { chat } = await api(`/chats/${chatId}`);
      get().upsertChat(chat);
    } catch {}
  },
  async openChat(chatId) {
    set({ activeChatId: chatId, rightPanel: false });
    if (!chatId) return;
    if (!get().chats.some((c) => c.id === chatId)) await get().refreshChat(chatId);
    if (!get().messages[chatId]) await get().loadMessages(chatId);
    get().markRead(chatId);
  },
  async openPrivate(userId) {
    const { chat } = await api('/chats/private', { body: { userId } });
    get().upsertChat(chat);
    await get().openChat(chat.id);
    set({ modals: [] });
  },
  async loadMessages(chatId, before, topic) {
    const q = new URLSearchParams();
    if (before) q.set('before', before);
    if (topic !== undefined && topic !== null) q.set('topic', topic);
    const key = topic !== undefined && topic !== null ? `${chatId}:${topic}` : chatId;
    const { messages, hasMore } = await api(`/chats/${chatId}/messages${q.toString() ? `?${q}` : ''}`);
    const prev = before ? get().messages[key] || [] : [];
    set({ messages: { ...get().messages, [key]: [...messages, ...prev] }, hasMore: { ...get().hasMore, [key]: hasMore } });
  },
  // ---------- forum topics ----------
  topics: {},
  topicOf: {},
  async loadTopics(chatId) {
    try { const { topics } = await api(`/chats/${chatId}/topics`); set({ topics: { ...get().topics, [chatId]: topics } }); } catch {}
  },
  patchTopic(chatId, topic, add) {
    const list = get().topics[chatId];
    if (!list) return;
    const has = list.some((t) => t.id === topic.id);
    if (!has && !add) return;
    const next = has ? list.map((t) => (t.id === topic.id ? { ...t, ...topic } : t)) : [list[0], topic, ...list.slice(1)];
    const [general, ...rest] = next;
    rest.sort((a, b) => (b.pinned - a.pinned) || ((b.lastMessage?.id || 0) - (a.lastMessage?.id || 0)) || b.id - a.id);
    set({ topics: { ...get().topics, [chatId]: [general, ...rest] } });
  },
  async openTopic(chatId, topicId) {
    set({ topicOf: { ...get().topicOf, [chatId]: topicId } });
    if (topicId === undefined) return get().loadTopics(chatId);
    if (!get().messages[`${chatId}:${topicId}`]) await get().loadMessages(chatId, undefined, topicId);
  },
  markRead(chatId) {
    const c = get().chats.find((x) => x.id === chatId);
    if (!c || !c.isMember) return;
    const last = c.lastMessage?.id || 0;
    if (c.unread || last > c.lastReadId) {
      get().upsertChat({ ...c, unread: 0, lastReadId: last });
      api(`/chats/${chatId}/read`, { body: { messageId: last } }).catch(() => {});
    }
  },
  patchMessage(message) {
    const list = get().messages[message.chatId];
    if (list) set({ messages: { ...get().messages, [message.chatId]: list.map((m) => (m.id === message.id ? message : m)) } });
    const tk = `${message.chatId}:${message.topicId || 0}`;
    const tl = get().messages[tk];
    if (tl) set({ messages: { ...get().messages, [tk]: tl.map((m) => (m.id === message.id ? message : m)) } });
  },
  async sendMessage(chatId, payload) {
    const chat = get().chats.find((c) => c.id === chatId);
    const topic = chat?.forum ? get().topicOf[chatId] : undefined;
    const { message } = await api(`/chats/${chatId}/messages`, { body: topic ? { ...payload, topicId: topic } : payload });
    const key = topic !== undefined ? `${chatId}:${topic}` : chatId;
    const list = get().messages[key] || [];
    if (!list.some((m) => m.id === message.id)) set({ messages: { ...get().messages, [key]: [...list, message] } });
    return message;
  },

  // ---------- stories ----------
  async loadStories() {
    try {
      const { feed } = await api('/stories');
      set({ stories: feed });
    } catch {}
  },

  // ---------- ui ----------
  openModal(type, props = {}) {
    set({ modals: [...get().modals, { type, props, key: Math.random() }] });
  },
  closeModal() {
    // macOS / iOS-like dismissal: let the top sheet animate out, then unmount it
    const ovs = typeof document !== 'undefined' ? document.querySelectorAll('.modal-overlay') : [];
    const top = ovs[ovs.length - 1];
    if (top?.classList.contains('closing')) return;
    const calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (top && !calm && !document.documentElement.classList.contains('perf')) {
      top.classList.add('closing');
      setTimeout(() => set({ modals: get().modals.slice(0, -1) }), 230);
      return;
    }
    set({ modals: get().modals.slice(0, -1) });
  },
  closeAllModals() {
    set({ modals: [] });
  },
  setTab(tab) {
    set({ tab, modals: [] });
  },
  setRightPanel(v) {
    set({ rightPanel: v });
  },
  toast(text, kind = 'info') {
    const id = Math.random();
    const ttl = kind === 'error' ? 5000 : 3500;
    // keep at most 3 on screen
    set({ toasts: [...get().toasts.slice(-2), { id, text, kind, ttl }] });
    setTimeout(() => get().dismissToast(id), ttl);
    return id;
  },
  dismissToast(id) {
    const t = get().toasts.find((x) => x.id === id);
    if (!t || t.leaving) return;
    set({ toasts: get().toasts.map((x) => (x.id === id ? { ...x, leaving: true } : x)) });
    setTimeout(() => set({ toasts: get().toasts.filter((x) => x.id !== id) }), 220);
  },
}));

function notifyBrowser(chat, message) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const th = loadTheme();
  if ((chat.type === 'group' && th.notifyGroups === false) || (chat.type === 'channel' && th.notifyChannels === false) || (chat.type === 'private' && th.notifyPrivate === false)) return;
  try {
    const body = th.notifyPreview === false ? 'Новое сообщение' : stripFormatting(message.text) || 'Новое сообщение';
    const n = new Notification(chat.title, { body, icon: '/icon-192.png', tag: `chat-${chat.id}` });
    n.onclick = () => {
      window.focus();
      useStore.getState().openChat(chat.id);
    };
  } catch {}
}

export const useCurrency = () => useStore((s) => s.currency);

// unread counter on the app icon: desktop app (taskbar / dock badge) and installed PWA
if (typeof window !== 'undefined') {
  let lastBadge = -1;
  useStore.subscribe((s) => {
    const n = (s.chats || []).reduce((a, c) => a + (c.muted ? 0 : c.unread || 0), 0);
    if (n === lastBadge) return;
    lastBadge = n;
    try { window.recidivist?.setBadge?.(n); } catch {}
    try { if (navigator.setAppBadge) (n ? navigator.setAppBadge(n) : navigator.clearAppBadge?.()).catch?.(() => {}); } catch {}
  });
}
