import { useState } from 'react';
import { Camera, Check, Plus, Tag, Bell, LogOut, ShieldCheck } from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload } from '../api.js';
import { Avatar, Modal, Spark, useAsync, useAction } from './common.jsx';
import { ACCENTS, BACKGROUNDS, loadTheme, saveTheme } from '../theme.js';

const STATUS_EMOJI = ['', '🔴', '💀', '🔥', '⛓️', '👑', '💎', '🗝️', '⚡', '🎲', '🕷️', '🌙'];

function ProfileTab() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const [name, setName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio || '');
  const [avatar, setAvatar] = useState(me.avatar);
  const [emojiStatus, setEmojiStatus] = useState(me.emojiStatus || '');
  const [run, busy] = useAction();
  const save = () => run(async () => setMe((await api.patch('/me', { displayName: name, bio, avatar, emojiStatus: emojiStatus || null })).user), 'Профиль сохранён');
  return (
    <div className="col" style={{ gap: 14 }}>
      <label style={{ cursor: 'pointer', position: 'relative', alignSelf: 'center' }}>
        <Avatar src={avatar} name={name} id={me.id} size={100} />
        <span className="story-add" style={{ width: 32, height: 32 }}><Camera size={16} /></span>
        <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files[0] && setAvatar((await upload(e.target.files[0])).url)} />
      </label>
      <div className="field"><label>Имя</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} /></div>
      <div className="field"><label>О себе</label><textarea className="input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} /><span className="hint">{bio.length}/200</span></div>
      <div className="field">
        <label>Эмодзи-статус</label>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {STATUS_EMOJI.map((e) => (
            <button key={e || 'none'} className={`chip ${emojiStatus === e ? 'on' : ''}`} style={{ fontSize: '1.1em' }} onClick={() => setEmojiStatus(e)}>{e || 'нет'}</button>
          ))}
        </div>
      </div>
      <div className="small muted">Email: {me.email}</div>
      <button className="btn" disabled={busy} onClick={save}>Сохранить</button>
    </div>
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

function PrivacyTab() {
  const logout = useStore((s) => s.logout);
  const toast = useStore((s) => s.toast);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="list-item" style={{ background: 'var(--bg-2)' }}>
        <Bell size={22} className="accent" />
        <div className="grow"><div className="bold">Уведомления браузера</div><div className="tiny muted">{perm === 'granted' ? 'включены' : perm === 'denied' ? 'запрещены в настройках браузера' : 'выключены'}</div></div>
        {perm === 'default' && <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>Включить</button>}
      </div>
      <div className="warn-box">
        <ShieldCheck size={18} />
        <span>Ваш аккаунт защищён сид-фразой из 12 слов. Сервер хранит только хеш ключа, выведенного из неё, — восстановить фразу невозможно. Храните её офлайн.</span>
      </div>
      <button className="btn danger-btn" onClick={() => { if (confirm('Выйти? Для входа понадобится сид-фраза.')) { logout(); toast('Вы вышли из аккаунта'); } }}><LogOut size={18} /> Выйти из аккаунта</button>
    </div>
  );
}

export function SettingsModal({ tab: initialTab = 'profile' }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <Modal title="Настройки">
      <div className="tabs">
        <button className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Профиль</button>
        <button className={tab === 'usernames' ? 'on' : ''} onClick={() => setTab('usernames')}>Юзернеймы</button>
        <button className={tab === 'theme' ? 'on' : ''} onClick={() => setTab('theme')}>Тема</button>
        <button className={tab === 'privacy' ? 'on' : ''} onClick={() => setTab('privacy')}>Прочее</button>
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'usernames' && <UsernamesTab />}
      {tab === 'theme' && <AppearanceTab />}
      {tab === 'privacy' && <PrivacyTab />}
    </Modal>
  );
}
