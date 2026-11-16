import { useRef, useState } from 'react';
import { MessageCircle, Gift, Music2, Store, Settings, Wallet, Pencil, Share2, AtSign, Sparkles } from 'lucide-react';
import { useStore } from '../store.js';
import { Avatar, Verified, Spark, InlinePage, WornGift } from './common.jsx';
import { GiftsGrid } from './Profile.jsx';
import { GiftShopModal } from './Gifts.jsx';
import { MarketModal } from './Market.jsx';
import { SettingsModal } from './Settings.jsx';
import { MusicPage, MiniPlayer } from './Music.jsx';
import { usePlayer } from '../player.js';

const TABS = [
  { id: 'chats', icon: MessageCircle, label: 'Чаты' },
  { id: 'gifts', icon: Gift, label: 'Подарки' },
  { id: 'profile', label: 'Профиль' },
  { id: 'music', icon: Music2, label: 'Музыка' },
  { id: 'market', icon: Store, label: 'Маркет' },
  { id: 'settings', icon: Settings, label: 'Настройки' },
];

/** Floating glass tab bar (like the reference design). */
export function BottomNav() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const me = useStore((s) => s.me);
  const unread = useStore((s) => s.chats.reduce((n, c) => n + (c.muted ? 0 : c.unread || 0), 0));
  const playing = usePlayer((s) => s.playing);
  const idx = TABS.findIndex((t) => t.id === tab);
  return (
    <nav className="bottom-nav">
      <div className="nav-indicator" style={{ transform: `translateX(${idx * 100}%)`, width: `${100 / TABS.length}%` }} />
      {TABS.map((t) => {
        const Icon = t.icon;
        const on = t.id === tab;
        return (
          <button key={t.id} className={`nav-btn ${on ? 'on' : ''}`} onClick={() => setTab(t.id)} aria-label={t.label}>
            {t.id === 'profile' ? (
              <span className={`nav-avatar ${on ? 'on' : ''}`}><Avatar src={me.avatar} name={me.displayName} id={me.id} size={34} /></span>
            ) : (
              <span className="nav-icon">
                <Icon size={24} strokeWidth={on ? 2.3 : 1.8} />
                {t.id === 'chats' && unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
                {t.id === 'music' && playing && <span className="nav-dot" />}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function ProfilePage() {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState('gifts');
  const share = () => {
    const link = me.username ? `${location.origin}/@${me.username}` : location.origin;
    if (navigator.share) navigator.share({ title: me.displayName, url: link }).catch(() => {});
    else { navigator.clipboard?.writeText(link); toast('Ссылка на профиль скопирована'); }
  };
  return (
    <div className="page">
      <div className="page-head">
        <button className="chip" onClick={() => openModal('wallet')}><Wallet size={15} /> <Spark amount={me.balance} /></button>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => openModal('settings')}><Pencil size={20} /></button>
      </div>
      <div className="page-body" style={{ paddingTop: 0 }}>
        <div className="profile-hero hero-glow">
          <div className="avatar-glow"><Avatar src={me.avatar} name={me.displayName} id={me.id} size={104} /></div>
          <h2>{me.displayName}{me.verified && <Verified size={20} />}{me.wornGift ? <WornGift gift={me.wornGift} size={26} /> : me.emojiStatus && <span>{me.emojiStatus}</span>}</h2>
          <div className="muted small">{me.username ? `@${me.username}` : me.email}</div>
        </div>
        <div className="action-grid" style={{ padding: '0 0 14px' }}>
          <button onClick={() => openModal('wallet')}><Wallet size={22} />Кошелёк</button>
          <button onClick={() => openModal('giftShop', { toUser: me })}><Sparkles size={22} />Подарок</button>
          <button onClick={share}><Share2 size={22} />Поделиться</button>
          <button onClick={() => openModal('settings', { tab: 'usernames' })}><AtSign size={22} />Юзернеймы</button>
        </div>
        <div className="tabs">
          <button className={tab === 'gifts' ? 'on' : ''} onClick={() => setTab('gifts')}>Подарки</button>
          <button className={tab === 'collectible' ? 'on' : ''} onClick={() => setTab('collectible')}>Коллекционные</button>
        </div>
        <GiftsGrid userId={me.id} onlyCollectible={tab === 'collectible'} />
      </div>
    </div>
  );
}

const inline = (C, props = {}) => (
  <InlinePage.Provider value>
    <C {...props} />
  </InlinePage.Provider>
);

/** Content of the left column for every tab except chats. */
export function TabPage({ tab }) {
  const scroller = useRef();
  let page = null;
  if (tab === 'profile') page = <ProfilePage />;
  else if (tab === 'gifts') page = inline(GiftShopModal);
  else if (tab === 'market') page = inline(MarketModal);
  else if (tab === 'settings') page = inline(SettingsModal);
  else if (tab === 'music') page = <MusicPage />;
  return (
    <div className="tab-page" key={tab} ref={scroller}>
      {page}
    </div>
  );
}

export function MiniPlayerSlot({ onOpen }) {
  return <div className="mini-slot"><MiniPlayer onOpen={onOpen} /></div>;
}
