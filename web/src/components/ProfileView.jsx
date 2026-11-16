import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Pencil, Shield, MessageCircle, Gift, Send, Pin, Eye, CalendarDays, Hash, Filter, Play, Pause, ChevronRight, Music2, Megaphone, Check, Phone,
  MoreHorizontal, UserPlus, UserMinus, UserCheck, Star, Ban, Link2, MapPin, Coins,
} from 'lucide-react';
import { useStore } from '../store.js';
import { api, mediaUrl } from '../api.js';
import { Avatar, Verified, Modal, useAsync, Spinner, WornGift, Spark, PremiumStar, nameStyleCss, useAction } from './common.jsx';
import { PostList } from './Feed.jsx';
import { profileBgCss } from './SettingsPages.jsx';
import { useT } from '../i18n.js';
import { GiftArt, GiftModel, emoji3d } from './GiftArt.jsx';
import { usePlayer, fmtTime } from '../player.js';
import { Cover } from './Music.jsx';
import { lastSeen, fmtNum, plural, colorFor } from '../util.js';
import { BannerMedia, ProfileLinks } from './ProfileExtras.jsx';

// ---------------- gift tiles ----------------
export function GiftTile({ ug, onClick, index = 0, canPin, onPin }) {
  const col = ug.collectible;
  const ref = useRef();
  // 3D tilt + glare that follow the finger / cursor
  const move = (e) => {
    const el = ref.current;
    if (!el || e.pointerType === 'mouse' && e.buttons === 0 && !matchMedia('(hover: hover)').matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.classList.add('tilting');
    el.style.transform = `perspective(600px) rotateY(${(x - 0.5) * 16}deg) rotateX(${(0.5 - y) * 14}deg) scale(1.03)`;
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('tilting');
    el.style.transform = '';
  };
  return (
    <div ref={ref} className={`gift-card ${col ? 'is-col' : ''}`} onClick={onClick} onPointerMove={move} onPointerLeave={leave} onPointerUp={leave} onPointerCancel={leave}
      style={{ animationDelay: `${Math.min(index, 20) * 45}ms`, opacity: ug.hidden ? 0.45 : undefined }}>
      <span className="glare" />
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
    <div className="gift-cards pv-grid">
      {gifts.map((ug, i) => (
        <GiftTile key={ug.id} ug={ug} index={i} canPin={userId === me.id} onPin={pin} onClick={() => openModal('giftDetails', { userGiftId: ug.id, list: gifts.map((g) => g.id) })} />
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

/** Gifts scattered around the avatar (like the reference): they fly out of the avatar and gently bob. */
const SPOTS = [
  [16, 22, -12], [84, 20, 10], [6, 52, 8], [94, 50, -8], [18, 82, 14], [82, 84, -14],
  [36, 6, 6], [64, 7, -6], [30, 96, -10], [70, 96, 10], [2, 30, 0], [98, 72, 0],
];
function Orbit({ gifts, onOpen }) {
  const items = gifts.slice(0, SPOTS.length);
  if (!items.length) return null;
  return (
    <div className="pv-scatter">
      {items.map((ug, i) => {
        const [x, y, rot] = SPOTS[i];
        const m = ug.collectible?.model;
        return (
          <button
            key={ug.id}
            className="pv-scatter-item"
            style={{ left: `${x}%`, top: `${y}%`, '--fx': `${(50 - x) * 2.9}px`, '--fy': `${(50 - y) * 2.4}px`, '--rot': `${rot}deg`, animationDelay: `${0.25 + i * 0.07}s` }}
            onClick={() => onOpen(ug, items)}
          >
            <span style={{ animationDelay: `${i * 0.37}s`, animationDuration: `${3.4 + (i % 4) * 0.5}s` }}>
              <GiftModel emoji={m?.emoji || ug.gift.emoji} image={m?.image || ug.gift.image} filter={m?.filter} size={i < 6 ? 42 : 32} />
            </span>
          </button>
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

/** Open the in-app bot that issues anonymous numbers. */
export async function openNumbersBot() {
  const st = useStore.getState();
  try {
    const r = await api('/resolve/numbers');
    st.closeAllModals();
    st.setTab('chats');
    await st.openPrivate(r.user.id);
  } catch (e) {
    st.toast(e.message, 'error');
  }
}

// ---------------- the profile ----------------
export function ProfileView({ userId, onClose }) {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const openPrivate = useStore((s) => s.openPrivate);
  const upsertChat = useStore((s) => s.upsertChat);
  const openChat = useStore((s) => s.openChat);
  const closeAll = useStore((s) => s.closeAllModals);
  const { data, setData } = useAsync(() => api(`/users/${userId}`), [userId]);
  const t = useT();
  const [menu, setMenu] = useState(false);
  const [run] = useAction();
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
  const patchU = (patch) => setData({ user: { ...u, ...patch } });
  const follow = () => run(async () => { const r = await api(`/users/${u.id}/follow`, { body: {} }); patchU({ isFollowing: r.following, followers: r.followers }); });
  const toggleContact = () => run(async () => { const r = await api(`/contacts/${u.id}`, { body: {} }); patchU({ isContact: r.contact }); }, u.isContact ? 'Удалено из контактов' : 'Добавлено в контакты');
  const toggleBlock = () => {
    if (!u.isBlocked && !confirm(`Заблокировать ${u.displayName}? Он(а) не сможет писать вам и комментировать посты.`)) return;
    run(async () => { const r = await api(`/users/${u.id}/block`, { body: {} }); patchU({ isBlocked: r.blocked, isFollowing: r.blocked ? false : u.isFollowing }); }, u.isBlocked ? 'Разблокирован(а)' : 'Заблокирован(а)');
  };
  const act = (fn) => () => { setMenu(false); fn(); };
  const tabs = [['gifts', `Подарки${u.giftsCount ? ` · ${u.giftsCount}` : ''}`], ['posts', `${t('Посты')}${u.postsCount ? ` · ${u.postsCount}` : ''}`], ['stories', `Истории${u.storiesCount ? ` · ${u.storiesCount}` : ''}`]];
  const tabIdx = tabs.findIndex((x) => x[0] === tab);
  const heroBg = !u.banner && u.profileBg ? profileBgCss(u.profileBg) : null;

  const blur = u.blurBg || { mode: 'avatar' };
  let blurSrc = null;
  if (blur.mode === 'custom' && blur.url) blurSrc = { type: 'image', url: blur.url };
  else if (blur.mode === 'banner' && u.banner) blurSrc = u.banner;
  else if (blur.mode !== 'off' && u.avatar) blurSrc = { type: 'image', url: u.avatar };
  const blurOn = blur.mode !== 'off';

  return (
    <div className={`pv ${blurOn ? 'blurred' : ''}`}>
      {blurOn && (
        <div className="pv-blurbg" aria-hidden>
          <div className="pv-blur-inner" key={blurSrc?.url || u.id}>
            {blurSrc?.type === 'video' ? <video src={mediaUrl(blurSrc.url)} autoPlay muted loop playsInline />
              : blurSrc ? <img src={mediaUrl(blurSrc.url)} alt="" />
                : <div style={{ width: '100%', height: '100%', background: `radial-gradient(circle at 50% 30%, ${colorFor(u.id)}, #000 75%)` }} />}
          </div>
          <i className="pv-blur-shade" />
        </div>
      )}
      <div className={`pv-hero ${u.banner ? 'has-banner' : ''}`} style={{ '--glow': glow }}>
        {u.banner && <div className="pv-banner"><BannerMedia banner={u.banner} /></div>}
        {heroBg && <div className="pv-banner pv-prembg" style={{ background: heroBg }} />}
        <div className="pv-top">
          <span className="spacer" />
          {isMe && <button className="glass-icon" onClick={() => openModal('settings', { tab: 'privacy' })} title="Безопасность"><Shield size={17} /></button>}
          {isMe && <button className="glass-icon" onClick={() => openModal('settings', { tab: 'profile' })} title="Редактировать"><Pencil size={17} /></button>}
          {onClose && <button className="glass-icon" onClick={onClose}><X size={18} /></button>}
        </div>
        <div className="pv-stage">
          <Sparkles />
          <Orbit gifts={orbit} onOpen={(ug, items) => openModal('giftDetails', { userGiftId: ug.id, list: items.map((g) => g.id) })} />
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
          <span className="ellipsis" style={nameStyleCss(u.nameStyle)}>{u.displayName}</span>
          {u.verified && <Verified size={20} />}
          {u.premium && <PremiumStar size={20} />}
          {worn ? <WornGift gift={worn} size={24} /> : u.emojiStatus && <span>{u.emojiStatus}</span>}
        </h2>
        <div className="pv-pills">
          <span className={`pill ${u.online ? 'on' : ''}`}>{isMe ? 'в сети' : lastSeen(u)}</span>
          {!isMe && u.publicBalance != null && <span className="pill">Баланс: <Spark /> <b>{fmtNum(u.publicBalance)}</b></span>}
          {isMe && (
            <button className="pill" onClick={() => openModal('wallet')}>
              Баланс: <Spark /> <b><CountUp value={balance} /></b> <ChevronRight size={14} />
            </button>
          )}
        </div>
        {!u.isBot && (
          <div className="pv-counts">
            <button onClick={() => openModal('userList', { title: 'Подписчики', url: `/users/${u.id}/followers` })}><b>{fmtNum(u.followers || 0)}</b><span>{t('подписчиков')}</span></button>
            <button onClick={() => openModal('userList', { title: 'Подписки', url: `/users/${u.id}/following` })}><b>{fmtNum(u.following || 0)}</b><span>{t('подписок')}</span></button>
            <button onClick={() => setTab('posts')}><b>{fmtNum(u.postsCount || 0)}</b><span>{t('Посты').toLowerCase()}</span></button>
          </div>
        )}
        <ProfileLinks links={u.links} />
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
        <>
          {(u.isBlocked || u.blockedMe) && (
            <div className="pv-blocked">{u.isBlocked ? <>Вы заблокировали этого пользователя. <button onClick={toggleBlock}>Разблокировать</button></> : 'Пользователь ограничил вам доступ к профилю и сообщениям.'}</div>
          )}
          <div className="pv-bar">
            <button className="btn pv-bar-main" onClick={() => openPrivate(u.id)}><MessageCircle size={18} />{t('Написать')}</button>
            <button className={`btn secondary pv-bar-follow ${u.isFollowing ? 'on' : ''}`} onClick={follow} disabled={u.isBlocked || u.blockedMe}>{u.isFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}{u.isFollowing ? t('Вы подписаны') : t('Подписаться')}</button>
            <button className="glass-icon pv-bar-ico" onClick={() => openModal('giftShop', { toUser: u })} title={t('Подарить')} aria-label={t('Подарить')}><Gift size={19} /></button>
            <div style={{ position: 'relative', display: 'flex' }}>
              <button className="glass-icon pv-bar-ico" onClick={() => setMenu(!menu)} title="Ещё" aria-label="Ещё"><MoreHorizontal size={19} /></button>
              {menu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setMenu(false)} />
                  <div className="ctx-menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', left: 'auto', zIndex: 10, minWidth: 240, '--origin': 'top right' }}>
                    <button className="menu-item" onClick={act(toggleContact)}>{u.isContact ? <UserMinus size={18} /> : <UserPlus size={18} />} {u.isContact ? t('Удалить из контактов') : t('Добавить в контакты')}</button>
                    <button className="menu-item" onClick={act(() => openModal('transfer', { toUser: u }))}><Coins size={18} /> {t('Отправить искры')}</button>
                    <button className="menu-item" onClick={act(() => openModal('giftShop', { toUser: u }))}><Gift size={18} /> {t('Отправить подарок')}</button>
                    <button className="menu-item" onClick={act(() => openModal('giftPremium', { toUser: u }))}><Star size={18} /> {t('Подарить Premium')}</button>
                    <button className="menu-item" onClick={act(() => { navigator.clipboard?.writeText(`${location.origin}/${u.username ? `@${u.username}` : ''}`); useStore.getState().toast('Ссылка скопирована'); })}><Link2 size={18} /> {t('Скопировать ссылку')}</button>
                    <button className="menu-item danger" onClick={act(toggleBlock)}><Ban size={18} className="danger" /> {u.isBlocked ? t('Разблокировать') : t('Заблокировать')}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <div className="pv-info">
        {u.anonNumber ? (
          <div className="pv-row">
            <div className="pv-value pv-number" onClick={() => { navigator.clipboard?.writeText(u.anonNumber.replace(/\s/g, '')); useStore.getState().toast('Номер скопирован'); }}>{u.anonNumber}</div>
            <div className="pv-label">Анонимный номер</div>
          </div>
        ) : isMe ? (
          <button className="pv-track empty" style={{ marginBottom: 0 }} onClick={() => openNumbersBot()}>
            <Phone size={18} /> <span className="grow">Получить анонимный номер +888</span> <ChevronRight size={16} />
          </button>
        ) : null}
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
        {u.location && <div className="pv-row inline"><MapPin size={16} /> {u.location}</div>}
        <div className="pv-row inline"><CalendarDays size={16} /> На Recidivist с {new Date(u.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
        <div className="pv-row">
          <div className="pv-value row" style={{ gap: 6 }}><Hash size={15} className="muted" /> ID: {u.code}</div>
          <div className="pv-label">Идентификатор</div>
        </div>
        <div className="pv-row inline muted"><Eye size={16} /> {fmtNum(u.profileViews)}</div>
      </div>

      <div className="pv-tabs">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        <span className="pv-tab-line three" style={{ transform: `translateX(${tabIdx * 100}%)` }} />
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
        ) : tab === 'posts' ? (
          <PostList source={`/users/${u.id}/posts`} emptyText={isMe ? 'Вы ещё ничего не публиковали — откройте «Ленту»' : 'Постов пока нет'} />
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

export function UserListModal({ title, url }) {
  const openModal = useStore((s) => s.openModal);
  const { data } = useAsync(() => api(url), [url]);
  return (
    <Modal title={title}>
      {!data ? <div className="center" style={{ padding: 30 }}><Spinner /></div> : !data.users.length ? <div className="muted center small" style={{ padding: 30 }}>Пока никого</div> : data.users.map((u) => (
        <div key={u.id} className="list-item" onClick={() => openModal('userProfile', { userId: u.id })}>
          <Avatar src={u.avatar} name={u.displayName} id={u.id} size={44} online={u.online} />
          <div className="grow">
            <div className="row bold" style={{ gap: 4 }}><span className="ellipsis" style={nameStyleCss(u.nameStyle)}>{u.displayName}</span>{u.verified && <Verified size={14} />}{u.premium && <PremiumStar size={14} />}</div>
            <div className="small muted">{u.username ? `@${u.username}` : lastSeen(u)}</div>
          </div>
        </div>
      ))}
    </Modal>
  );
}

export function GiftPremiumModal({ toUser }) {
  const closeAll = useStore((s) => s.closeAllModals);
  const setMe = useStore((s) => s.setMe);
  const { data } = useAsync(() => api('/premium'), []);
  const [months, setMonths] = useState(1);
  const [run, busy] = useAction();
  const price = (data?.price || 0) * months;
  return (
    <Modal title="Подарить Premium" footer={<button className="btn block prem-btn" disabled={busy || !data} onClick={() => run(async () => { setMe((await api('/premium/buy', { body: { months, toUserId: toUser.id } })).user); closeAll(); }, `Premium подарен ${toUser.displayName} ⭐`)}>Подарить за <Spark amount={price} /></button>}>
      <div className="col" style={{ alignItems: 'center', gap: 12 }}>
        <div className="prem-star" style={{ background: 'linear-gradient(135deg,#5b2bff,#ff4f7b)' }}><Star size={40} fill="#fff" color="#fff" /></div>
        <div className="bold">{toUser.displayName}</div>
        <div className="small muted center" style={{ textAlign: 'center' }}>Получатель получит звезду, своё оформление имени и профиля, особые шрифты и расширенные лимиты.</div>
        <div className="seg" style={{ width: '100%' }}>
          <span className="seg-ind" style={{ transform: `translateX(${[1, 3, 12].indexOf(months) * 100}%)` }} />
          {[1, 3, 12].map((m) => <button key={m} className={months === m ? 'on' : ''} onClick={() => setMonths(m)}>{m} мес.</button>)}
        </div>
      </div>
    </Modal>
  );
}
