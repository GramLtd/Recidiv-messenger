import { useRef } from 'react';
import { MessageCircle, Music2, Settings, Newspaper } from 'lucide-react';
import { useStore } from '../store.js';
import { Avatar, InlinePage } from './common.jsx';
import { ProfileView } from './ProfileView.jsx';
import { GiftShopModal } from './Gifts.jsx';
import { FeedPage } from './Feed.jsx';
import { useT } from '../i18n.js';
import { MarketModal } from './Market.jsx';
import { SettingsModal } from './Settings.jsx';
import { MusicPage, MiniPlayer } from './Music.jsx';
import { usePlayer } from '../player.js';

const TABS = [
  { id: 'feed', icon: Newspaper, label: 'Лента' },
  { id: 'chats', icon: MessageCircle, label: 'Чаты' },
  { id: 'music', icon: Music2, label: 'Музыка' },
  { id: 'profile', label: 'Профиль' },
  { id: 'settings', icon: Settings, label: 'Настройки' },
];

/** Floating glass tab bar (like the reference design). */
export function BottomNav() {
  const t = useT();
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const me = useStore((s) => s.me);
  const unread = useStore((s) => s.chats.reduce((n, c) => n + (c.muted ? 0 : c.unread || 0), 0));
  const playing = usePlayer((s) => s.playing);
  const idx = TABS.findIndex((t) => t.id === tab);
  return (
    <nav className="bottom-nav">
      <div className="nav-indicator" style={{ transform: `translateX(${idx * 100}%)`, width: `${100 / TABS.length}%` }} />
      {TABS.map((tb) => {
        const Icon = tb.icon;
        const on = tb.id === tab;
        return (
          <button key={tb.id} className={`nav-btn ${on ? 'on' : ''}`} onClick={() => setTab(tb.id)} aria-label={t(tb.label)}>
            {tb.id === 'profile' ? (
              <span className={`nav-avatar ${on ? 'on' : ''}`}><Avatar src={me.avatar} name={me.displayName} id={me.id} size={26} /></span>
            ) : (
              <span className="nav-icon">
                <Icon size={23} strokeWidth={on ? 2.3 : 1.8} />
                {tb.id === 'chats' && unread > 0 && <span className="nav-badge">{unread > 99 ? '99+' : unread}</span>}
                {tb.id === 'music' && playing && <span className="nav-dot" />}
              </span>
            )}
            <span className="nav-label">{t(tb.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}

function ProfilePage() {
  const me = useStore((s) => s.me);
  return (
    <div className="page">
      <div className="page-body pv-page">
        <ProfileView userId={me.id} />
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
  else if (tab === 'feed') page = <FeedPage />;
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
