import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store.js';
import { api } from '../api.js';
import Sidebar from '../components/Sidebar.jsx';
import ChatView from '../components/ChatView.jsx';
import { RightPanel, UserProfileModal, EditChatModal } from '../components/Profile.jsx';
import { NewChatModal, ForwardModal, TransferModal } from '../components/NewChat.jsx';
import { GiftShopModal, GiftDetailsModal, TransferGiftModal, SellModal } from '../components/Gifts.jsx';
import { WalletModal } from '../components/Wallet.jsx';
import { MarketModal } from '../components/Market.jsx';
import { SettingsModal } from '../components/Settings.jsx';
import { StoryCreateModal, StoryViewer } from '../components/Stories.jsx';

const MODALS = {
  userProfile: UserProfileModal,
  editChat: EditChatModal,
  newChat: NewChatModal,
  forward: ForwardModal,
  transfer: TransferModal,
  giftShop: GiftShopModal,
  giftDetails: GiftDetailsModal,
  transferGift: TransferGiftModal,
  sell: SellModal,
  wallet: WalletModal,
  market: MarketModal,
  settings: SettingsModal,
  storyCreate: StoryCreateModal,
  storyViewer: StoryViewer,
};

export function ModalHost() {
  const modals = useStore((s) => s.modals);
  // Only the top-most modal is rendered (simple stack navigation).
  const top = modals[modals.length - 1];
  if (!top) return null;
  const C = MODALS[top.type];
  return C ? <C key={top.key} {...top.props} /> : null;
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

/** Handles /@username and /join/:code deep links. */
function useDeepLinks() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const st = useStore.getState();
    const m = location.pathname.match(/^\/@([a-zA-Z0-9_]+)$/);
    const j = location.pathname.match(/^\/join\/([a-f0-9]+)$/);
    const g = location.pathname.match(/^\/gift\/(.+)$/);
    if (g) {
      const slug = decodeURIComponent(g[1]);
      (/^\d+$/.test(slug) ? Promise.resolve({ userGift: { id: Number(slug) } }) : api(`/collectibles/${encodeURIComponent(slug)}`))
        .then((r) => st.openModal('giftDetails', { userGiftId: r.userGift.id }))
        .catch((e) => st.toast(e.message, 'error'))
        .finally(() => navigate('/', { replace: true }));
    } else if (m) {
      api(`/resolve/${m[1]}`)
        .then((r) => {
          if (r.user) st.openPrivate(r.user.id);
          else { st.upsertChat(r.chat); st.openChat(r.chat.id); }
        })
        .catch((e) => st.toast(e.message, 'error'))
        .finally(() => navigate('/', { replace: true }));
    } else if (j) {
      api(`/join/${j[1]}`, { body: {} })
        .then((r) => { st.upsertChat(r.chat); st.openChat(r.chat.id); })
        .catch((e) => st.toast(e.message, 'error'))
        .finally(() => navigate('/', { replace: true }));
    }
  }, [location.pathname, navigate]);
}

export default function Main() {
  const activeChatId = useStore((s) => s.activeChatId);
  const rightPanel = useStore((s) => s.rightPanel);
  useDeepLinks();
  useEffect(() => {
    const onVis = () => !document.hidden && activeChatId && useStore.getState().markRead(activeChatId);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [activeChatId]);
  return (
    <div className={`app ${activeChatId ? 'has-chat' : ''}`}>
      <Sidebar />
      <main className="chat-pane">
        <ChatView />
        {rightPanel && activeChatId && <RightPanel />}
      </main>
      <ModalHost />
      <Toasts />
    </div>
  );
}
