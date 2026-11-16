import { useState } from 'react';
import {
  Camera, Check, Plus, Tag, Bell, LogOut, ShieldCheck, Phone, User as UserIcon, AtSign, Bookmark, Gift, Star, CreditCard, Wallet as WalletIcon,
  Globe, Hand, MonitorSmartphone, Contrast, Type, HardDrive, Shield, MapPin,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Group, Row, NotificationsPage, PremiumPage, WalletCardPage, LanguagePage, PrivacyPage, DevicesPage, SecurityPage, FontsPage, StoragePage } from './SettingsPages.jsx';
import { useT, useLang, LANGS } from '../i18n.js';
import { useStore } from '../store.js';
import { api, upload } from '../api.js';
import { Avatar, Modal, Spark, Switch, useAsync, useAction, PremiumStar, nameStyleCss, StyledName } from './common.jsx';
import { AvatarCropper, BannerEditor, LinksEditor, WallpaperPicker, BlurBgEditor } from './ProfileExtras.jsx';
import { WalletsSection } from './Wallets.jsx';
import { ACCENTS, BACKGROUNDS, FONTS, loadTheme, saveTheme } from '../theme.js';


function ProfileTab() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const [name, setName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio || '');
  const [avatar, setAvatar] = useState(me.avatar);
  const [cropFile, setCropFile] = useState(null);
  const [run, busy] = useAction();
  const save = () => run(async () => setMe((await api.patch('/me', { displayName: name, bio, avatar, emojiStatus: null })).user), 'Профиль сохранён');
  return (
    <div className="col" style={{ gap: 14 }}>
      <label style={{ cursor: 'pointer', position: 'relative', alignSelf: 'center' }}>
        <Avatar src={avatar} name={name} id={me.id} size={100} />
        <span className="story-add" style={{ width: 32, height: 32 }}><Camera size={16} /></span>
        <input type="file" accept="image/*" hidden onChange={async (e) => {
          const f = e.target.files[0];
          e.target.value = '';
          if (!f) return;
          if (f.type === 'image/gif' && me.premium) {
            try { const url = (await upload(f)).url; setAvatar(url); setMe((await api.patch('/me', { avatar: url })).user); useStore.getState().toast('Живая аватарка установлена'); } catch (er) { useStore.getState().toast(er.message, 'error'); }
            return;
          }
          setCropFile(f);
        }} />
      </label>
      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onDone={async (f) => {
            try {
              const url = (await upload(f)).url;
              setAvatar(url);
              setMe((await api.patch('/me', { avatar: url })).user);
              setCropFile(null);
              useStore.getState().toast('Аватарка обновлена');
            } catch (e) {
              useStore.getState().toast(e.message, 'error');
            }
          }}
        />
      )}
      <BannerEditor />
      <BlurBgEditor />
      <LocationField />
      <div className="field"><label>Имя</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} /></div>
      <div className="field"><label>О себе</label><textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} /><span className="hint">{bio.length}/200</span></div>
      <LinksEditor />
      <ProfileExtras />
      <button className="list-item" style={{ background: 'var(--bg-2)' }} onClick={() => import('./ProfileView.jsx').then((m) => m.openNumbersBot())}>
        <Phone size={20} className="accent" />
        <div className="grow" style={{ textAlign: 'left' }}><div className="bold">Анонимный номер</div><div className="tiny muted">{me.anonNumber || 'Создать номер +888 через бота'}</div></div>
      </button>
      <div className="small muted">Email: {me.email}</div>
      <button className="btn" disabled={busy} onClick={save}>Сохранить</button>
    </div>
  );
}

function ProfileExtras() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const chats = useStore((s) => s.chats);
  const toast = useStore((s) => s.toast);
  const { data } = useAsync(() => api('/music'), []);
  const channels = chats.filter((c) => c.type === 'channel' && c.role === 'owner');
  const set = async (path, body, patch) => {
    try {
      await api(path, { body });
      setMe(patch);
      toast('Сохранено');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <>
      <div className="field">
        <label>Музыка в профиле</label>
        <select className="input" value={me.profileTrackId || ''} onChange={(e) => set('/me/profile-track', { trackId: e.target.value || null }, { profileTrackId: Number(e.target.value) || null })}>
          <option value="">— не показывать —</option>
          {data?.tracks.map((t) => <option key={t.id} value={t.id}>{t.artist ? `${t.artist} — ` : ''}{t.title}</option>)}
        </select>
        <span className="hint">Или нажмите ❤️ в плеере на нужном треке.</span>
      </div>
      <div className="field">
        <label>Личный канал</label>
        <select className="input" value={me.personalChannelId || ''} onChange={(e) => set('/me/personal-channel', { chatId: e.target.value || null }, { personalChannelId: Number(e.target.value) || null })}>
          <option value="">— не показывать —</option>
          {channels.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {!channels.length && <span className="hint">Создайте канал, чтобы показать его в профиле.</span>}
      </div>
    </>
  );
}

function UsernamesTab() {
  const setMe = useStore((s) => s.setMe);
  const openModal = useStore((s) => s.openModal);
  const { data, reload } = useAsync(() => api('/me/usernames'), []);
  const [name, setName] = useState('');
  const [run, busy] = useAction();
  const claim = () => run(async () => { setMe((await api('/me/usernames', { body: { name } })).user); setName(''); reload(); }, `@${name} теперь ваш`);
  const activate = (n) => run(async () => { setMe((await api('/me/usernames/active', { body: { name: n } })).user); reload(); });
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="small muted">В Recidivist юзернеймы коллекционные: у вас может быть несколько, один из них — основной. Лишние можно продать на маркете.</div>
      {data?.usernames.map((u) => (
        <div key={u.name} className="list-item" style={{ background: 'var(--bg-2)' }}>
          <div className="grow">
            <div className="bold">@{u.name}</div>
            <div className="tiny muted">{u.active ? 'основной' : u.listed ? 'выставлен на продажу' : 'дополнительный'}</div>
          </div>
          {!u.active && !u.listed && <button className="btn sm secondary" onClick={() => activate(u.name)}><Check size={15} /> Основной</button>}
          {!u.listed && <button className="btn sm ghost" onClick={() => openModal('sell', { username: u.name, onDone: reload })}><Tag size={15} /> Продать</button>}
        </div>
      ))}
      <div className="row">
        <input className="input grow" placeholder="новый_юзернейм" value={name} onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
        <button className="btn" disabled={busy || name.length < 4} onClick={claim}><Plus size={18} /></button>
      </div>
      {data?.claimPrice > 0 && <div className="hint">Регистрация нового юзернейма стоит <Spark amount={data.claimPrice} /></div>}
    </div>
  );
}

function AppearanceTab() {
  const [theme, setTheme] = useState(loadTheme());
  const update = (patch) => {
    const t = { ...theme, ...patch };
    setTheme(t);
    saveTheme(t);
  };
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="field">
        <label>Фон интерфейса</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {BACKGROUNDS.map((b) => <button key={b.id} className={`chip ${theme.bg === b.id ? 'on' : ''}`} onClick={() => update({ bg: b.id })}>{b.name}</button>)}
        </div>
      </div>
      <div className="field">
        <label>Акцентный цвет</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {ACCENTS.map((a) => (
            <button key={a.id} title={a.name} onClick={() => update({ accent: a.color })} style={{ width: 38, height: 38, borderRadius: 19, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: theme.accent === a.color ? `0 0 0 3px var(--bg), 0 0 0 5px ${a.color}` : 'none' }}>
              {theme.accent === a.color && <Check size={18} />}
            </button>
          ))}
          <label style={{ width: 38, height: 38, borderRadius: 19, background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)', cursor: 'pointer', position: 'relative' }} title="Свой цвет">
            <input type="color" value={theme.accent} onChange={(e) => update({ accent: e.target.value })} style={{ opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
          </label>
        </div>
      </div>
      <WallpaperPicker />
      <div className="field">
        <label>Размер текста: {theme.fontSize}px</label>
        <input type="range" min={13} max={19} value={theme.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
      </div>
      <div className="field">
        <label>Скругление сообщений: {theme.bubbleRadius}px</label>
        <input type="range" min={4} max={22} value={theme.bubbleRadius} onChange={(e) => update({ bubbleRadius: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
      </div>
      <div className="chat-pane" style={{ borderRadius: 14, padding: 14, flexDirection: 'column', gap: 6, border: '1px solid var(--border)' }}>
        <div className="msg-row in"><div className="bubble">Как тебе новая тема? 🔥<span className="meta">12:00</span></div></div>
        <div className="msg-row out"><div className="bubble">Чёрный OLED с красным — топ<span className="meta">12:01</span></div></div>
      </div>
      <button className="btn secondary" onClick={() => update({ bg: 'oled', accent: '#ff2d3d', fontSize: 15, bubbleRadius: 16 })}>Сбросить по умолчанию</button>
    </div>
  );
}

const PAGES = {
  profile: ['Мой профиль', () => <ProfileTab />],
  usernames: ['Юзернеймы', () => <UsernamesTab />],
  theme: ['Оформление', () => <AppearanceTab />],
  wallets: ['TON-кошельки', () => <WalletsSection />],
  notifications: ['Уведомления', () => <NotificationsPage />],
  premium: ['Recidivist Premium', () => <PremiumPage />],
  wallet: ['Кошелёк', () => <WalletCardPage />],
  language: ['Язык', () => <LanguagePage />],
  privacy: ['Конфиденциальность', () => <PrivacyPage />],
  devices: ['Устройства', () => <DevicesPage />],
  security: ['Безопасность', () => <SecurityPage />],
  fonts: ['Шрифты', () => <FontsPage />],
  storage: ['Память', () => <StoragePage />],
};

export function SettingsModal({ tab: initialTab }) {
  const t = useT();
  const [page, setPage] = useState(initialTab && PAGES[initialTab] ? initialTab : null);
  if (page) {
    const [title, render] = PAGES[page];
    return <Modal title={t(title)} back={() => setPage(null)} className={`settings-page sp-${page}`}><div key={page} className="sp-body">{render()}</div></Modal>;
  }
  return <SettingsHome open={setPage} />;
}

function SettingsHome({ open }) {
  const t = useT();
  const me = useStore((s) => s.me);
  const chats = useStore((s) => s.chats);
  const openModal = useStore((s) => s.openModal);
  const openChat = useStore((s) => s.openChat);
  const setTab = useStore((s) => s.setTab);
  const logout = useStore((s) => s.logout);
  const currency = useStore((s) => s.currency);
  const lang = useLang((s) => s.lang);
  const navigate = useNavigate();
  const font = FONTS.find((f) => f.id === loadTheme().font) || FONTS[0];
  const saved = chats.find((c) => c.type === 'saved');
  const doLogout = async () => {
    if (!confirm('Выйти из аккаунта? Для входа понадобится сид-фраза.')) return;
    await api('/sessions/logout', { body: {} }).catch(() => {});
    logout();
  };
  return (
    <Modal title={t('Настройки')} className="settings-home">
      <button className="set-me" onClick={() => open('profile')}>
        <Avatar src={me.avatar} name={me.displayName} id={me.id} size={64} />
        <div className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
          <div className="row" style={{ gap: 5 }}><b className="row" style={{ minWidth: 0 }}><StyledName user={me} /></b>{me.premium && <PremiumStar />}</div>
          <div className="small muted ellipsis">{me.username ? `@${me.username}` : me.email}</div>
        </div>
        <span className="set-chev">›</span>
      </button>
      <Group>
        <Row icon={UserIcon} color="#ff3b30" title={t('Мой профиль')} onClick={() => setTab('profile')} />
        <Row icon={AtSign} color="#0a84ff" title={t('Юзернеймы')} value={me.username ? `@${me.username}` : ''} onClick={() => open('usernames')} />
        {saved && <Row icon={Bookmark} color="#5ac8fa" title={t('Избранное')} onClick={() => { setTab('chats'); openChat(saved.id); }} />}
      </Group>
      <Group>
        <Row icon={Bell} color="#ff453a" title={t('Уведомления')} onClick={() => open('notifications')} />
        <Row icon={Gift} color="#af52de" title={t('Магазин')} onClick={() => openModal('giftShop')} />
        <Row icon={Tag} color="#0a84ff" title={t('Маркет')} onClick={() => openModal('market')} />
        <Row icon={Star} color="#f5a623" title="Recidivist Premium" value={me.premium ? 'активен' : ''} onClick={() => open('premium')} />
        <Row icon={CreditCard} color="linear-gradient(135deg, #2c2c2e, #ff2d3d)" title={t('Кошелёк')} value={<Spark amount={me.balance} />} onClick={() => open('wallet')} />
        <Row icon={WalletIcon} color="#0098ea" title={t('TON-кошельки')} onClick={() => open('wallets')} />
      </Group>
      <Group>
        <Row icon={Globe} color="#bf5af2" title={t('Язык')} value={LANGS.find((l) => l.id === lang)?.name} onClick={() => open('language')} />
        <Row icon={Hand} color="#0a84ff" title={t('Конфиденциальность')} onClick={() => open('privacy')} />
        <Row icon={MonitorSmartphone} color="#ff9f0a" title={t('Устройства')} onClick={() => open('devices')} />
        <Row icon={ShieldCheck} color="#34c759" title={t('Безопасность')} onClick={() => open('security')} />
        <Row icon={Contrast} color="#3a3a3c" title={t('Оформление')} onClick={() => open('theme')} />
        <Row icon={Type} color="#0a84ff" title={t('Шрифты')} value={font.name} onClick={() => open('fonts')} />
        <Row icon={HardDrive} color="#8e8e93" title={t('Память')} onClick={() => open('storage')} />
      </Group>
      <Group>
        {me.isAdmin && <Row icon={Shield} color="#ff3b30" title={t('Админ-панель')} onClick={() => navigate('/admin')} />}
        <Row icon={LogOut} color="#ff453a" title={<span className="danger">{t('Выйти')}</span>} onClick={doLogout} />
      </Group>
      <div className="tiny muted center" style={{ padding: '6px 0 20px' }}>Recidivist · {currency.symbol} {currency.name}</div>
    </Modal>
  );
}

function LocationField() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const [v, setV] = useState(me.location || '');
  const save = async () => { if ((me.location || '') !== v) setMe((await api('/me/profile-extra', { body: { location: v } })).user); };
  return (
    <div className="field">
      <label>Местоположение</label>
      <div className="link-field"><span className="brand"><MapPin size={18} /></span><input className="input" value={v} maxLength={48} placeholder="Город или что угодно" onChange={(e) => setV(e.target.value)} onBlur={save} /></div>
    </div>
  );
}
