import { useEffect, useRef, useState } from 'react';
import {
  Search, Users, Megaphone, User, Bookmark, LogOut, Plus, Pin, VolumeX, Volume2, CheckCheck, Check, X, SquarePen, Trash2,
} from 'lucide-react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Avatar, Verified, WornGift, PremiumStar, StyledName } from './common.jsx';
import { useT } from '../i18n.js';
import { chatTime } from '../util.js';
import { BottomNav, TabPage, MiniPlayerSlot } from './Tabs.jsx';

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
        <span>Моя</span>
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

export function ChatRow({ chat, active, onClick, onContext, index = 0, editing, onAction }) {
  const me = useStore((s) => s.me);
  const typing = useStore((s) => s.typing[chat.id]);
  const typers = typing ? Object.values(typing).filter((t) => t.until > Date.now()) : [];
  const lm = chat.lastMessage;
  const own = lm && lm.senderId === me.id;
  const read = own && chat.peerReadId >= lm.id;
  return (
    <div className={`chat-item ${active ? 'active' : ''}`} style={{ animationDelay: `${Math.min(index, 14) * 28}ms` }} onClick={onClick} onContextMenu={onContext}>
      <Avatar src={chat.avatar} name={chat.title} id={chat.peer?.id || chat.id} size={54} online={chat.peer?.online} saved={chat.type === 'saved'} />
      <div className="grow">
        <div className="top">
          <div className="name">
            {chat.type === 'group' && <Users size={15} className="muted" />}
            {chat.type === 'channel' && <Megaphone size={15} className="muted" />}
            {chat.peer ? <StyledName user={{ ...chat.peer, displayName: chat.title }} /> : <span className="ellipsis">{chat.title}</span>}
            {chat.peer?.verified && <Verified size={15} />}
            {chat.peer?.premium && <PremiumStar size={14} />}
            {chat.peer?.wornGift && <WornGift gift={chat.peer.wornGift} size={18} />}
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
      {editing && (
        <div className="chat-edit-actions" onClick={(e) => e.stopPropagation()}>
          <button className="lg" title={chat.pinned ? 'Открепить' : 'Закрепить'} onClick={() => onAction('pin')}><Pin size={17} /></button>
          <button className="lg" title={chat.muted ? 'Включить звук' : 'Без звука'} onClick={() => onAction('mute')}>{chat.muted ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
          {chat.type !== 'saved' && chat.peer?.isBot !== true && <button className="lg danger-lg" title="Удалить" onClick={() => onAction('leave')}><Trash2 size={17} /></button>}
        </div>
      )}
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

const TAB_ORDER = ['feed', 'chats', 'music', 'profile', 'settings'];

export default function Sidebar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const prev = useRef(tab);
  const dir = TAB_ORDER.indexOf(tab) >= TAB_ORDER.indexOf(prev.current) ? 'fwd' : 'back';
  useEffect(() => { prev.current = tab; }, [tab]);
  return (
    <aside className={`sidebar dir-${dir}`}>
      {tab === 'chats' ? <ChatsPage key="chats" /> : <TabPage tab={tab} />}
      {tab !== 'music' && <MiniPlayerSlot onOpen={() => setTab('music')} />}
      <BottomNav />
    </aside>
  );
}

function ChatsPage() {
  const t = useT();
  const me = useStore((s) => s.me);
  const chats = useStore((s) => s.chats);
  const activeChatId = useStore((s) => s.activeChatId);
  const openChat = useStore((s) => s.openChat);
  const openPrivate = useStore((s) => s.openPrivate);
  const openModal = useStore((s) => s.openModal);
  const upsertChat = useStore((s) => s.upsertChat);
  const removeChat = useStore((s) => s.removeChat);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [compose, setCompose] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ctx, setCtx] = useState(null);

  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    const ctrl = new AbortController();
    const tm = setTimeout(() => api(`/users/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal }).then(setResults).catch(() => {}), 250);
    return () => { clearTimeout(tm); ctrl.abort(); };
  }, [q]);

  const ql = q.trim().toLowerCase();
  const localMatches = ql ? chats.filter((c) => c.title?.toLowerCase().includes(ql) || c.username?.toLowerCase().includes(ql.replace('@', ''))) : [];
  const resetSearch = () => { setQ(''); setResults(null); setSearching(false); };
  const saved = chats.find((c) => c.type === 'saved');

  const action = async (chat, kind) => {
    if (kind === 'leave') {
      const label = chat.type === 'private' ? 'Удалить чат для обоих?' : chat.type === 'channel' ? 'Покинуть канал?' : 'Покинуть группу?';
      if (!confirm(label)) return;
      await api(`/chats/${chat.id}/leave`, { body: {} });
      removeChat(chat.id);
      return;
    }
    const body = kind === 'pin' ? { pinned: !chat.pinned } : { muted: !chat.muted };
    const { chat: c } = await api(`/chats/${chat.id}/settings`, { body });
    upsertChat(c);
  };

  return (
    <div className="tab-page chats-page">
      <div className="ios-head">
        <button className={`lg ios-pill ${editing ? 'on' : ''}`} onClick={() => setEditing(!editing)}>{editing ? t('Готово') : t('Изм.')}</button>
        <div className="ios-title"><Avatar src={me.avatar} name={me.displayName} id={me.id} size={30} /><span>{t('Чаты')}</span></div>
        <div className="ios-right">
          <div style={{ position: 'relative' }}>
            <button className="lg ios-round" onClick={() => setCompose(!compose)} aria-label={t('Новое сообщение')}><SquarePen size={20} /></button>
            {compose && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setCompose(false)} />
                <div className="ctx-menu" style={{ position: 'absolute', right: 0, top: 50, left: 'auto', zIndex: 10, '--origin': 'top right' }}>
                  <button className="menu-item" onClick={() => { setCompose(false); openModal('newChat', { type: 'private' }); }}><User size={18} /> {t('Новое сообщение')}</button>
                  <button className="menu-item" onClick={() => { setCompose(false); openModal('newChat', { type: 'group' }); }}><Users size={18} /> {t('Новая группа')}</button>
                  <button className="menu-item" onClick={() => { setCompose(false); openModal('newChat', { type: 'channel' }); }}><Megaphone size={18} /> {t('Новый канал')}</button>
                  {saved && <button className="menu-item" onClick={() => { setCompose(false); openChat(saved.id); }}><Bookmark size={18} /> {t('Избранное')}</button>}
                </div>
              </>
            )}
          </div>
          <button className={`lg ios-round ${searching ? 'on' : ''}`} onClick={() => (searching ? resetSearch() : setSearching(true))} aria-label={t('Поиск')}>{searching ? <X size={20} /> : <Search size={20} />}</button>
        </div>
      </div>
      {searching && (
        <div className="ios-search">
          <div className="search-box">
            <Search size={18} />
            <input autoFocus placeholder={t('Поиск')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      )}

      <div className="chat-list">
        {!q && <StoriesBar />}
        {q ? (
          <>
            {localMatches.length > 0 && <div className="section-title">{t('Чаты')}</div>}
            {localMatches.map((c) => <ChatRow key={c.id} chat={c} active={c.id === activeChatId} onClick={() => { openChat(c.id); resetSearch(); }} />)}
            {results?.users?.length > 0 && <div className="section-title">{t('Глобальный поиск')}</div>}
            {results?.users?.map((u) => (
              <div key={`u${u.id}`} className="chat-item" onClick={() => { openPrivate(u.id); resetSearch(); }}>
                <Avatar src={u.avatar} name={u.displayName} id={u.id} size={48} online={u.online} />
                <div className="grow">
                  <div className="name row" style={{ gap: 4, fontWeight: 600 }}><StyledName user={u} />{u.verified && <Verified size={15} />}{u.premium && <PremiumStar size={14} />}</div>
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
            {results && !results.users.length && !results.chats.length && !localMatches.length && <div className="muted center" style={{ padding: 30 }}>{t('Ничего не найдено')}</div>}
          </>
        ) : (
          chats.map((c, i) => (
            <ChatRow
              key={c.id}
              index={i}
              chat={c}
              editing={editing}
              onAction={(kind) => action(c, kind).catch((e) => useStore.getState().toast(e.message, 'error'))}
              active={c.id === activeChatId}
              onClick={() => (editing ? null : openChat(c.id))}
              onContext={(e) => { e.preventDefault(); setCtx({ chat: c, x: e.clientX, y: e.clientY }); }}
            />
          ))
        )}
      </div>

      {ctx && <ChatContextMenu {...ctx} onClose={() => setCtx(null)} />}
    </div>
  );
}
