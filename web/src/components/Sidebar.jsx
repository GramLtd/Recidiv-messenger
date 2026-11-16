import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, Search, Pencil, Users, Megaphone, User, Wallet, Gift, Store, Settings, Shield, Bookmark, LogOut, Plus, Pin, VolumeX,
  CheckCheck, Check, X, Moon, Sun,
} from 'lucide-react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Avatar, Verified, Spark } from './common.jsx';
import { chatTime } from '../util.js';
import { loadTheme, saveTheme } from '../theme.js';

function StoriesBar() {
  const stories = useStore((s) => s.stories);
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const mine = stories.find((x) => x.isMe);
  const others = stories.filter((x) => !x.isMe);
  return (
    <div className="stories-bar">
      <div className="story-chip" onClick={() => (mine ? openModal('storyViewer', { startUserId: me.id }) : openModal('storyCreate'))}>
        <div style={{ position: 'relative' }}>
          <Avatar src={me.avatar} name={me.displayName} id={me.id} size={58} ring={mine ? (mine.allViewed ? 'seen' : 'new') : null} />
          <span className="story-add" onClick={(e) => { e.stopPropagation(); openModal('storyCreate'); }}><Plus size={12} strokeWidth={3} /></span>
        </div>
        <span>Моя история</span>
      </div>
      {others.map((f) => (
        <div className="story-chip" key={f.user.id} onClick={() => openModal('storyViewer', { startUserId: f.user.id })}>
          <Avatar src={f.user.avatar} name={f.user.displayName} id={f.user.id} size={58} ring={f.allViewed ? 'seen' : 'new'} />
          <span>{f.user.displayName.split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}

function Drawer({ onClose }) {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const logout = useStore((s) => s.logout);
  const chats = useStore((s) => s.chats);
  const openChat = useStore((s) => s.openChat);
  const navigate = useNavigate();
  const [theme, setTheme] = useState(loadTheme());
  const go = (fn) => () => { onClose(); fn(); };
  const toggleLight = () => {
    const t = { ...theme, bg: theme.bg === 'light' ? 'oled' : 'light' };
    setTheme(t);
    saveTheme(t);
  };
  const saved = chats.find((c) => c.type === 'saved');
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Avatar src={me.avatar} name={me.displayName} id={me.id} size={64} onClick={go(() => openModal('settings'))} />
            <div className="spacer" />
            <button className="icon-btn" onClick={toggleLight}>{theme.bg === 'light' ? <Moon size={20} /> : <Sun size={20} />}</button>
          </div>
          <div style={{ marginTop: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>{me.displayName}{me.verified && <Verified />}</div>
          <div className="muted small">{me.username ? `@${me.username}` : me.email}</div>
        </div>
        <div style={{ padding: 6, overflowY: 'auto', flex: 1 }}>
          <button className="menu-item" onClick={go(() => openModal('userProfile', { userId: me.id }))}><User size={22} /> Мой профиль</button>
          <button className="menu-item" onClick={go(() => openModal('wallet'))}><Wallet size={22} /> Кошелёк <span className="right"><Spark amount={me.balance} /></span></button>
          <button className="menu-item" onClick={go(() => openModal('giftShop'))}><Gift size={22} /> Подарки</button>
          <button className="menu-item" onClick={go(() => openModal('market'))}><Store size={22} /> Маркет</button>
          <div className="divider" />
          <button className="menu-item" onClick={go(() => openModal('newChat', { type: 'group' }))}><Users size={22} /> Создать группу</button>
          <button className="menu-item" onClick={go(() => openModal('newChat', { type: 'channel' }))}><Megaphone size={22} /> Создать канал</button>
          {saved && <button className="menu-item" onClick={go(() => openChat(saved.id))}><Bookmark size={22} /> Избранное</button>}
          <button className="menu-item" onClick={go(() => openModal('settings'))}><Settings size={22} /> Настройки</button>
          {me.isAdmin && <button className="menu-item" onClick={go(() => navigate('/admin'))}><Shield size={22} /> Админ-панель</button>}
          <div className="divider" />
          <button className="menu-item danger" onClick={go(() => confirm('Выйти из аккаунта? Для входа понадобится сид-фраза.') && logout())}><LogOut size={22} className="danger" /> Выйти</button>
        </div>
        <div className="tiny muted" style={{ padding: 16 }}>Recidivist Web · v0.1</div>
      </div>
    </>
  );
}

export function ChatRow({ chat, active, onClick, onContext }) {
  const me = useStore((s) => s.me);
  const typing = useStore((s) => s.typing[chat.id]);
  const typers = typing ? Object.values(typing).filter((t) => t.until > Date.now()) : [];
  const lm = chat.lastMessage;
  const own = lm && lm.senderId === me.id;
  const read = own && chat.peerReadId >= lm.id;
  return (
    <div className={`chat-item ${active ? 'active' : ''}`} onClick={onClick} onContextMenu={onContext}>
      <Avatar src={chat.avatar} name={chat.title} id={chat.peer?.id || chat.id} size={54} online={chat.peer?.online} saved={chat.type === 'saved'} />
      <div className="grow">
        <div className="top">
          <div className="name">
            {chat.type === 'group' && <Users size={15} className="muted" />}
            {chat.type === 'channel' && <Megaphone size={15} className="muted" />}
            <span className="ellipsis">{chat.title}</span>
            {chat.peer?.verified && <Verified size={15} />}
            {chat.muted && <VolumeX size={14} className="muted" />}
          </div>
          <span className="time">
            {own && chat.type !== 'saved' && chat.type !== 'channel' && (read ? <CheckCheck size={16} className="accent" /> : <Check size={16} className="accent" />)}
            {lm && chatTime(lm.createdAt)}
          </span>
        </div>
        <div className="bottom">
          <div className="preview ellipsis">
            {typers.length ? (
              <span className="accent">{chat.type === 'private' ? 'печатает…' : `${typers[0].name} печатает…`}</span>
            ) : lm ? (
              <>
                {chat.type === 'group' && lm.senderName && lm.type !== 'system' && <span className="who">{own ? 'Вы' : lm.senderName.split(' ')[0]}: </span>}
                {lm.text}
              </>
            ) : (
              <span>{chat.type === 'saved' ? 'Сохраняйте сюда сообщения' : 'Нет сообщений'}</span>
            )}
          </div>
          {chat.unread > 0 ? <span className={`badge ${chat.muted ? 'muted-badge' : ''}`}>{chat.unread}</span> : chat.pinned && <Pin size={15} className="muted" style={{ transform: 'rotate(45deg)' }} />}
        </div>
      </div>
    </div>
  );
}

function ChatContextMenu({ chat, x, y, onClose }) {
  const upsertChat = useStore((s) => s.upsertChat);
  const removeChat = useStore((s) => s.removeChat);
  const set = async (body) => {
    onClose();
    const { chat: c } = await api(`/chats/${chat.id}/settings`, { body });
    upsertChat(c);
  };
  const leave = async () => {
    onClose();
    const label = chat.type === 'private' ? 'Удалить чат для обоих?' : chat.type === 'channel' ? 'Покинуть канал?' : 'Покинуть группу?';
    if (!confirm(label)) return;
    await api(`/chats/${chat.id}/leave`, { body: {} });
    removeChat(chat.id);
  };
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 59 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="ctx-menu" style={{ left: Math.min(x, innerWidth - 220), top: Math.min(y, innerHeight - 180) }}>
        <button className="menu-item" onClick={() => set({ pinned: !chat.pinned })}><Pin size={18} /> {chat.pinned ? 'Открепить' : 'Закрепить'}</button>
        <button className="menu-item" onClick={() => set({ muted: !chat.muted })}><VolumeX size={18} /> {chat.muted ? 'Включить звук' : 'Без звука'}</button>
        {chat.type !== 'saved' && chat.peer?.isBot !== true && (
          <button className="menu-item danger" onClick={leave}><LogOut size={18} className="danger" /> {chat.type === 'private' ? 'Удалить чат' : 'Покинуть'}</button>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const chats = useStore((s) => s.chats);
  const activeChatId = useStore((s) => s.activeChatId);
  const openChat = useStore((s) => s.openChat);
  const openPrivate = useStore((s) => s.openPrivate);
  const openModal = useStore((s) => s.openModal);
  const upsertChat = useStore((s) => s.upsertChat);
  const [drawer, setDrawer] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [fab, setFab] = useState(false);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => api(`/users/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then(setResults).catch(() => {}), 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const ql = q.trim().toLowerCase();
  const localMatches = ql ? chats.filter((c) => c.title?.toLowerCase().includes(ql) || c.username?.toLowerCase().includes(ql.replace('@', ''))) : [];
  const resetSearch = () => { setQ(''); setResults(null); };

  return (
    <aside className="sidebar">
      <div className="side-header">
        {q ? (
          <button className="icon-btn" onClick={resetSearch}><X size={22} /></button>
        ) : (
          <button className="icon-btn" onClick={() => setDrawer(true)}><Menu size={22} /></button>
        )}
        <div className="search-box">
          <Search size={18} />
          <input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="chat-list">
        {!q && <StoriesBar />}
        {q ? (
          <>
            {localMatches.length > 0 && <div className="section-title">Чаты</div>}
            {localMatches.map((c) => <ChatRow key={c.id} chat={c} active={c.id === activeChatId} onClick={() => { openChat(c.id); resetSearch(); }} />)}
            {results?.users?.length > 0 && <div className="section-title">Глобальный поиск</div>}
            {results?.users?.map((u) => (
              <div key={`u${u.id}`} className="chat-item" onClick={() => { openPrivate(u.id); resetSearch(); }}>
                <Avatar src={u.avatar} name={u.displayName} id={u.id} size={48} online={u.online} />
                <div className="grow">
                  <div className="name row" style={{ gap: 4, fontWeight: 600 }}><span className="ellipsis">{u.displayName}</span>{u.verified && <Verified size={15} />}</div>
                  <div className="muted small">{u.username ? `@${u.username}` : ''}</div>
                </div>
              </div>
            ))}
            {results?.chats?.map((c) => (
              <div key={`c${c.id}`} className="chat-item" onClick={() => { upsertChat(c); openChat(c.id); resetSearch(); }}>
                <Avatar src={c.avatar} name={c.title} id={c.id} size={48} />
                <div className="grow">
                  <div className="bold ellipsis">{c.title}</div>
                  <div className="muted small">@{c.username} · {c.memberCount} {c.type === 'channel' ? 'подписчиков' : 'участников'}</div>
                </div>
              </div>
            ))}
            {results && !results.users.length && !results.chats.length && !localMatches.length && <div className="muted center" style={{ padding: 30 }}>Ничего не найдено</div>}
          </>
        ) : (
          chats.map((c) => (
            <ChatRow
              key={c.id}
              chat={c}
              active={c.id === activeChatId}
              onClick={() => openChat(c.id)}
              onContext={(e) => { e.preventDefault(); setCtx({ chat: c, x: e.clientX, y: e.clientY }); }}
            />
          ))
        )}
      </div>

      {fab && (
        <>
          <div style={{ position: 'absolute', inset: 0, zIndex: 5 }} onClick={() => setFab(false)} />
          <div className="fab-menu">
            <button className="menu-item" onClick={() => { setFab(false); openModal('newChat', { type: 'private' }); }}><User size={20} /> Новое сообщение</button>
            <button className="menu-item" onClick={() => { setFab(false); openModal('newChat', { type: 'group' }); }}><Users size={20} /> Новая группа</button>
            <button className="menu-item" onClick={() => { setFab(false); openModal('newChat', { type: 'channel' }); }}><Megaphone size={20} /> Новый канал</button>
          </div>
        </>
      )}
      <button className="fab" onClick={() => setFab(!fab)}>{fab ? <X size={24} /> : <Pencil size={24} />}</button>

      {drawer && <Drawer onClose={() => setDrawer(false)} />}
      {ctx && <ChatContextMenu {...ctx} onClose={() => setCtx(null)} />}
    </aside>
  );
}
