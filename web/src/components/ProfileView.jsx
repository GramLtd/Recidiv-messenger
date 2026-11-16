import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Pencil, Shield, MessageCircle, Gift, Send, Pin, Eye, CalendarDays, Hash, Filter, Play, Pause, ChevronRight, Music2, Megaphone, Check,
} from 'lucide-react';
import { useStore } from '../store.js';
import { api, mediaUrl } from '../api.js';
import { Avatar, Verified, Modal, useAsync, Spinner, WornGift, Spark } from './common.jsx';
import { GiftArt, GiftModel, emoji3d } from './GiftArt.jsx';
import { usePlayer, fmtTime } from '../player.js';
import { Cover } from './Music.jsx';
import { lastSeen, fmtNum, plural } from '../util.js';

// ---------------- gift tiles ----------------
export function GiftTile({ ug, onClick, index = 0, canPin, onPin }) {
  const col = ug.collectible;
  return (
    <div className={`gift-card ${col ? 'is-col' : ''}`} onClick={onClick} style={{ animationDelay: `${Math.min(index, 20) * 35}ms`, opacity: ug.hidden ? 0.45 : undefined }}>
      {col ? (
        <GiftArt userGift={ug} size="100%" height="100%" rounded={0} style={{ position: 'absolute', inset: 0 }} />
      ) : (
        <div className="gift-card-art"><GiftArt userGift={ug} size="78%" height="78%" /></div>
      )}
      {col && <span className="gift-num">#{col.number}</span>}
      {ug.listing && <span className="gift-sale">продаётся</span>}
      {(canPin || ug.pinned) && (
        <button
          className={`gift-pin-btn ${ug.pinned ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (canPin) onPin?.(ug); }}
          title={ug.pinned ? 'Открепить' : 'Закрепить в профиле'}
        >
          <Pin size={13} />
        </button>
      )}
      {!col && <div className="gift-card-name ellipsis">{ug.gift.name}</div>}
    </div>
  );
}

const FILTERS = [
  ['all', 'Все подарки'],
  ['collectible', 'Коллекционные'],
  ['pinned', 'Закреплённые'],
  ['regular', 'Обычные'],
];

export function GiftsGrid({ userId, onlyCollectible, filter = onlyCollectible ? 'collectible' : 'all', gifts: given, onChange }) {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const own = useAsync(() => (given ? Promise.resolve({ gifts: given }) : api(`/users/${userId}/gifts`)), [userId, given]);
  const list = given || own.data?.gifts;
  if (!list) return <div className="center" style={{ padding: 20 }}><Spinner /></div>;
  const gifts = list.filter((g) => filter === 'all' || (filter === 'collectible' ? g.collectible : filter === 'pinned' ? g.pinned : !g.collectible));
  const pin = async (ug) => {
    const r = await api(`/user-gifts/${ug.id}/visibility`, { body: { pinned: !ug.pinned } });
    const next = list.map((x) => (x.id === ug.id ? r.userGift : x)).sort((a, b) => b.pinned - a.pinned || !!b.collectible - !!a.collectible || b.id - a.id);
    if (onChange) onChange(next);
    else own.setData({ gifts: next });
  };
  if (!gifts.length) {
    return (
      <div className="muted center small" style={{ padding: 30, flexDirection: 'column', gap: 8 }}>
        <img src={emoji3d('🎁')} alt="" width={64} height={64} className="floaty" />
        {filter === 'all' ? 'Подарков пока нет' : 'Здесь пусто'}
      </div>
    );
  }
  return (
    <div className="gift-cards">
      {gifts.map((ug, i) => (
        <GiftTile key={ug.id} ug={ug} index={i} canPin={userId === me.id} onPin={pin} onClick={() => openModal('giftDetails', { userGiftId: ug.id })} />
      ))}
    </div>
  );
}

// ---------------- hero decorations ----------------
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i * 137.5 * Math.PI) / 180;
  const r = 38 + ((i * 29) % 14);
  return { x: 50 + Math.cos(a) * r, y: 48 + Math.sin(a) * r * 0.85, s: 7 + ((i * 7) % 8), d: (i * 0.37) % 3 };
});

function Sparkles() {
  return (
    <div className="pv-sparks">
      {SPARKS.map((p, i) => (
        <svg key={i} viewBox="0 0 10 10" style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, animationDelay: `${p.d}s` }}>
          <path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill="currentColor" />
        </svg>
      ))}
    </div>
  );
}

/** Gifts slowly orbiting around the avatar (pinned first, then collectibles). */
function Orbit({ gifts, onOpen }) {
  const items = gifts.slice(0, 8);
  if (!items.length) return null;
  return (
    <div className="pv-orbit">
      {items.map((ug, i) => {
        const a = (i / items.length) * 360 - 90;
        const m = ug.collectible?.model;
        return (
          <div key={ug.id} className="pv-orbit-arm" style={{ transform: `rotate(${a}deg)` }}>
            <button className="pv-orbit-item" style={{ transform: `rotate(${-a}deg)`, animationDelay: `${i * 0.4}s` }} onClick={() => onOpen(ug)}>
              <span className="pv-orbit-counter">
                <GiftModel emoji={m?.emoji || ug.gift.emoji} image={m?.image || ug.gift.image} filter={m?.filter} size={40} />
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CountUp({ value }) {
  const [v, setV] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const to = Number(value) || 0;
    const t0 = performance.now();
    let raf;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - (1 - k) ** 3;
      setV(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else prev.current = to;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtNum(v)}</>;
}

function ProfileTrack({ track }) {
  const cur = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const playTrack = usePlayer((s) => s.playTrack);
  const active = cur?.url === track.url;
  return (
    <div className={`pv-track ${active ? 'active' : ''}`} onClick={() => playTrack(track)}>
      <Cover track={track} size={44} radius={10} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis bold">{track.title}</div>
        <div className="ellipsis small muted">{track.artist || 'Неизвестный исполнитель'}</div>
      </div>
      <span className="small muted">{fmtTime(active ? time : track.duration)}</span>
      <span className="pv-track-play">{active && playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" style={{ marginLeft: 2 }} />}</span>
      {active && <i className="pv-track-progress" style={{ width: `${track.duration ? (time / track.duration) * 100 : 0}%` }} />}
    </div>
  );
}

function ChannelCard({ chat, onOpen }) {
  return (
    <div className="pv-channel" onClick={onOpen}>
      <Avatar src={chat.avatar} name={chat.title} id={chat.id} size={46} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 5 }}><Megaphone size={14} className="muted" /><span className="bold ellipsis">{chat.title}</span></div>
        <div className="small muted ellipsis">{chat.description || (chat.username ? `@${chat.username}` : 'Канал')}</div>
      </div>
      <span className="pill">{fmtNum(chat.memberCount)} {plural(chat.memberCount, ['подписчик', 'подписчика', 'подписчиков'])}</span>
    </div>
  );
}

function Badges({ list }) {
  const [tip, setTip] = useState(null);
  if (!list?.length) return null;
  return (
    <div className="pv-row">
      <div className="pv-badges">
        {list.map((b, i) => (
          <button key={b.id} className="pv-badge" style={{ animationDelay: `${i * 60}ms` }} onClick={() => setTip(tip === b.id ? null : b.id)} title={b.title}>
            <img src={emoji3d(b.emoji)} alt={b.title} />
          </button>
        ))}
      </div>
      <div className="pv-label">{tip ? list.find((b) => b.id === tip)?.title : 'Значки'}</div>
    </div>
  );
}

function StoriesGrid({ userId }) {
  const feed = useStore((s) => s.stories);
  const openModal = useStore((s) => s.openModal);
  const { data } = useAsync(() => api(`/users/${userId}/stories`), [userId]);
  const [light, setLight] = useState(null);
  if (!data) return <div className="center" style={{ padding: 20 }}><Spinner /></div>;
  if (!data.stories.length) return <div className="muted center small" style={{ padding: 30 }}>Активных историй нет</div>;
  const inFeed = feed.some((f) => f.user.id === userId);
  return (
    <>
      <div className="pv-stories">
        {data.stories.map((s, i) => (
          <button key={s.id} className="pv-story" style={{ animationDelay: `${i * 40}ms`, background: s.mediaType === 'text' ? s.bg : '#111' }} onClick={() => (inFeed ? openModal('storyViewer', { startUserId: userId }) : setLight(s))}>
            {s.mediaType === 'image' && <img src={mediaUrl(s.media)} alt="" />}
            {s.mediaType === 'video' && <video src={mediaUrl(s.media)} muted playsInline />}
            {s.mediaType === 'text' && <span>{s.media}</span>}
          </button>
        ))}
      </div>
      {light && (
        <div className="lightbox" onClick={() => setLight(null)}>
          {light.mediaType === 'video' ? <video src={mediaUrl(light.media)} autoPlay controls /> : light.mediaType === 'image' ? <img src={mediaUrl(light.media)} alt="" /> : <div className="story-text-bg" style={{ background: light.bg, width: 320, height: 560, borderRadius: 16 }}>{light.media}</div>}
        </div>
      )}
    </>
  );
}

// ---------------- the profile ----------------
export function ProfileView({ userId, onClose }) {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const openPrivate = useStore((s) => s.openPrivate);
  const upsertChat = useStore((s) => s.upsertChat);
  const openChat = useStore((s) => s.openChat);
  const closeAll = useStore((s) => s.closeAllModals);
  const { data } = useAsync(() => api(`/users/${userId}`), [userId]);
  const giftsReq = useAsync(() => api(`/users/${userId}/gifts`), [userId]);
  const [tab, setTab] = useState('gifts');
  const [filter, setFilter] = useState('all');
  const [filterMenu, setFilterMenu] = useState(false);
  const gifts = giftsReq.data?.gifts;
  const orbit = useMemo(() => {
    if (!gifts) return [];
    const pinned = gifts.filter((g) => g.pinned);
    const rest = gifts.filter((g) => !g.pinned && g.collectible);
    return [...pinned, ...rest];
  }, [gifts]);

  if (!data) return <div className="center" style={{ padding: 60 }}><Spinner /></div>;
  const u = data.user;
  const isMe = u.id === me.id;
  const worn = u.wornGift;
  const glow = worn?.center || 'var(--accent)';
  const balance = isMe ? me.balance : null;

  return (
    <div className="pv">
      <div className="pv-hero" style={{ '--glow': glow }}>
        <div className="pv-top">
          <span className="spacer" />
          {isMe && <button className="glass-icon" onClick={() => openModal('settings', { tab: 'privacy' })} title="Безопасность"><Shield size={17} /></button>}
          {isMe && <button className="glass-icon" onClick={() => openModal('settings', { tab: 'profile' })} title="Редактировать"><Pencil size={17} /></button>}
          {onClose && <button className="glass-icon" onClick={onClose}><X size={18} /></button>}
        </div>
        <div className="pv-stage">
          <Sparkles />
          <Orbit gifts={orbit} onOpen={(ug) => openModal('giftDetails', { userGiftId: ug.id })} />
          <div className="pv-avatar">
            <span className="pv-ring" />
            <Avatar src={u.avatar} name={u.displayName} id={u.id} size={118} />
            {u.online && <span className="pv-online" />}
          </div>
          {worn && (
            <button className="pv-worn-label" onClick={() => openModal('giftDetails', { userGiftId: worn.id })}>
              {worn.name} #{worn.number}
            </button>
          )}
        </div>
        <h2 className="pv-name">
          <span className="ellipsis">{u.displayName}</span>
          {u.verified && <Verified size={20} />}
          {worn ? <WornGift gift={worn} size={24} /> : u.emojiStatus && <span>{u.emojiStatus}</span>}
        </h2>
        <div className="pv-pills">
          <span className={`pill ${u.online ? 'on' : ''}`}>{isMe ? 'в сети' : lastSeen(u)}</span>
          {isMe && (
            <button className="pill" onClick={() => openModal('wallet')}>
              Баланс: <Spark /> <b><CountUp value={balance} /></b> <ChevronRight size={14} />
            </button>
          )}
        </div>
        {u.profileTrack ? (
          <ProfileTrack track={u.profileTrack} />
        ) : isMe ? (
          <button className="pv-track empty" onClick={() => useStore.getState().setTab('music')}>
            <Music2 size={18} /> <span className="grow">Добавить музыку в профиль</span> <ChevronRight size={16} />
          </button>
        ) : null}
        {u.personalChannel && (
          <ChannelCard chat={u.personalChannel} onOpen={() => { upsertChat(u.personalChannel); openChat(u.personalChannel.id); closeAll(); onClose?.(); }} />
        )}
      </div>

      {!isMe && !u.isBot && (
        <div className="pv-actions">
          <button onClick={() => openPrivate(u.id)}><MessageCircle size={20} />Написать</button>
          <button onClick={() => openModal('giftShop', { toUser: u })}><Gift size={20} />Подарить</button>
          <button onClick={() => openModal('transfer', { toUser: u })}><Send size={20} />Перевод</button>
        </div>
      )}

      <div className="pv-info">
        {u.username && (
          <div className="pv-row">
            <div className="pv-value accent">@{u.username}</div>
            {u.otherUsernames?.length > 0 && <div className="pv-also">а также {u.otherUsernames.map((n) => `@${n}`).join(', ')}</div>}
            <div className="pv-label">Имя пользователя</div>
          </div>
        )}
        {u.bio && (
          <div className="pv-row">
            <div className="pv-value" style={{ whiteSpace: 'pre-wrap' }}>{u.bio}</div>
            <div className="pv-label">Описание</div>
          </div>
        )}
        <Badges list={u.badges} />
        <div className="pv-row inline"><CalendarDays size={16} /> На Recidivist с {new Date(u.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div className="pv-row">
          <div className="pv-value row" style={{ gap: 6 }}><Hash size={15} className="muted" /> ID: {u.code}</div>
          <div className="pv-label">Идентификатор</div>
        </div>
        <div className="pv-row inline muted"><Eye size={16} /> {fmtNum(u.profileViews)}</div>
      </div>

      <div className="pv-tabs">
        <button className={tab === 'gifts' ? 'on' : ''} onClick={() => setTab('gifts')}>Подарки{u.giftsCount ? ` · ${u.giftsCount}` : ''}</button>
        <button className={tab === 'stories' ? 'on' : ''} onClick={() => setTab('stories')}>Истории{u.storiesCount ? ` · ${u.storiesCount}` : ''}</button>
        <span className="pv-tab-line" style={{ transform: `translateX(${tab === 'gifts' ? 0 : 100}%)` }} />
        {tab === 'gifts' && (
          <div style={{ position: 'relative' }}>
            <button className={`icon-btn ${filter !== 'all' ? 'active' : ''}`} onClick={() => setFilterMenu(!filterMenu)}><Filter size={18} /></button>
            {filterMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setFilterMenu(false)} />
                <div className="ctx-menu" style={{ position: 'absolute', right: 0, top: 44, left: 'auto', zIndex: 10 }}>
                  {FILTERS.map(([k, l]) => (
                    <button key={k} className="menu-item" onClick={() => { setFilter(k); setFilterMenu(false); }}>
                      {l} {filter === k && <Check size={16} className="accent" style={{ marginLeft: 'auto' }} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <div className="pv-content" key={tab}>
        {tab === 'gifts' ? (
          <GiftsGrid userId={u.id} filter={filter} gifts={gifts} onChange={(next) => giftsReq.setData({ gifts: next })} />
        ) : (
          <StoriesGrid userId={u.id} />
        )}
      </div>
    </div>
  );
}

export function UserProfileModal({ userId }) {
  const close = useStore((s) => s.closeModal);
  return (
    <Modal title={null} className="pv-modal">
      <div style={{ margin: '0 -18px' }}>
        <ProfileView userId={userId} onClose={close} />
      </div>
    </Modal>
  );
}
