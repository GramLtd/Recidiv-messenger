import { useEffect, useState } from 'react';
import { Check, Crown, Eye, Sparkles, Smartphone, Monitor, Trash2, ArrowDownLeft, ArrowUpRight, Plus, Send, KeyRound, ShieldCheck, Lock, HardDrive } from 'lucide-react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Avatar, Spark, Spinner, Switch, useAsync, useAction, PremiumStar, nameStyleCss, StyledName, SparkIcon } from './common.jsx';
import { LANGS, useLang } from '../i18n.js';
import { FONTS, loadTheme, saveTheme } from '../theme.js';
import { useLock, PinPad, checkCode } from './Lock.jsx';
import { UserPicker } from './NewChat.jsx';
import { fmtNum, lastSeen } from '../util.js';

const useThemeState = () => {
  const [theme, setTheme] = useState(loadTheme());
  const update = (patch) => { const t = { ...theme, ...patch }; setTheme(t); saveTheme(t); };
  return [theme, update];
};

export function Group({ title, children, footer }) {
  return (
    <div className="set-group-wrap">
      {title && <div className="set-group-title">{title}</div>}
      <div className="set-group">{children}</div>
      {footer && <div className="set-group-foot">{footer}</div>}
    </div>
  );
}
export function Row({ icon: Icon, color, title, sub, value, onClick, right, danger }) {
  return (
    <button className={`set-row ${danger ? 'danger' : ''}`} onClick={onClick} disabled={!onClick && !right}>
      {Icon && <span className="set-ico" style={{ background: color }}><Icon size={18} /></span>}
      <span className="grow set-text"><span>{title}</span>{sub && <small>{sub}</small>}</span>
      {value !== undefined && <span className="set-val">{value}</span>}
      {right}
      {onClick && !right && <span className="set-chev">›</span>}
    </button>
  );
}
const Radio = ({ on }) => <span className={`check ${on ? 'on' : ''}`}>{on && <Check size={14} />}</span>;

// ---------------- language ----------------
export function LanguagePage() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  return (
    <>
      <Group footer="Перевод интерфейса постепенно дополняется — непереведённые места остаются на русском.">
        {LANGS.map((l) => <Row key={l.id} title={<><span style={{ fontSize: '1.3em', marginRight: 10 }}>{l.flag}</span>{l.name}</>} onClick={() => setLang(l.id)} right={lang === l.id ? <Check size={20} className="accent" /> : <span />} />)}
      </Group>
    </>
  );
}

// ---------------- notifications ----------------
export function NotificationsPage() {
  const [theme, update] = useThemeState();
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const sw = (k) => <Switch on={theme[k] !== false} onChange={(v) => update({ [k]: v })} />;
  return (
    <>
      <Group footer={perm === 'denied' ? 'Уведомления запрещены в настройках браузера — разрешите их для этого сайта.' : undefined}>
        <Row title="Уведомления браузера" sub={perm === 'granted' ? 'включены' : perm === 'denied' ? 'запрещены' : perm === 'unsupported' ? 'не поддерживаются' : 'выключены'}
          right={perm === 'default' ? <button className="btn sm" onClick={async () => setPerm(await Notification.requestPermission())}>Включить</button> : <span />} />
      </Group>
      <Group title="Чаты">
        <Row title="Личные сообщения" right={sw('notifyPrivate')} />
        <Row title="Группы" right={sw('notifyGroups')} />
        <Row title="Каналы" right={sw('notifyChannels')} />
        <Row title="Показывать текст" sub="Иначе — просто «Новое сообщение»" right={sw('notifyPreview')} />
      </Group>
      <Group title="Производительность" footer="Без размытия, частиц и бесконечных анимаций — максимум плавности и меньше расход батареи.">
        <Row title="Режим производительности" right={<Switch on={theme.perf === true} onChange={(v) => update({ perf: v })} />} />
      </Group>
      <Group title="Звуки">
        <Row title="Звук отправки" right={sw('sendSound')} />
        <Row title="Звук входящих в открытом чате" right={sw('inSound')} />
      </Group>
    </>
  );
}

// ---------------- fonts ----------------
export function FontsPage() {
  const me = useStore((s) => s.me);
  const [theme, update] = useThemeState();
  const openPage = useStore((s) => s.openModal);
  return (
    <Group footer="Шрифты с искрой доступны с Premium.">
      {FONTS.map((f) => {
        const locked = f.premium && !me.premium;
        return (
          <Row
            key={f.id}
            title={<span style={{ fontFamily: f.css || `'${(f.family || '').split(':')[0]}'`, fontSize: f.scale ? '.8em' : undefined }}>{f.name}</span>}
            sub={locked ? 'Premium' : undefined}
            onClick={() => (locked ? openPage('settings', { tab: 'premium' }) : update({ font: f.id }))}
            right={theme.font === f.id ? <Check size={20} className="accent" /> : f.premium ? <PremiumStar /> : <span />}
          />
        );
      })}
      {FONTS.map((f) => f.family && <link key={f.id} rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${f.family.replace(/ /g, '+')}&display=swap&text=${encodeURIComponent(f.name)}`} />)}
    </Group>
  );
}

// ---------------- privacy ----------------
export function PrivacyPage() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const openModal = useStore((s) => s.openModal);
  const p = me.privacy || {};
  const [price, setPrice] = useState(String(p.messagePrice || 10));
  const [run] = useAction();
  const save = (body) => run(async () => setMe((await api('/me/privacy', { body })).user));
  const blocked = useAsync(() => api('/me/blocked'), []);
  const contacts = useAsync(() => api('/contacts'), []);
  const unblock = (u) => run(async () => { await api(`/users/${u.id}/block`, { body: {} }); blocked.reload(); }, `${u.displayName} разблокирован(а)`);
  return (
    <>
      <Group title="Время захода" footer="Если скрыть своё время, вы не увидите время других — кроме Premium.">
        {[['everyone', 'Все'], ['contacts', 'Мои контакты'], ['nobody', 'Никто']].map(([k, l]) => <Row key={k} title={l} onClick={() => save({ lastSeen: k })} right={<Radio on={p.lastSeen === k} />} />)}
      </Group>
      <Group title="Кто может мне писать" footer="Правило действует для новых чатов: если вы уже писали человеку или он у вас в контактах — он сможет ответить.">
        {[['everyone', 'Все'], ['contacts', 'Только контакты'], ['premium', 'Только Premium'], ['paid', 'Платно']].map(([k, l]) => <Row key={k} title={l} onClick={() => save({ messages: k })} right={<Radio on={p.messages === k} />} />)}
        {p.messages === 'paid' && (
          <div className="set-inline">
            <span className="grow small">Цена сообщения</span>
            <input className="input" style={{ width: 90, height: 38 }} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} onBlur={() => save({ messagePrice: Number(price) || 1 })} />
            <Spark />
          </div>
        )}
      </Group>
      <Group footer="Если выключить, ваши заходы в чужие профили не попадут в их списки «Кто смотрел профиль».">
        <Row title="Отмечать мои просмотры профилей" right={<Switch on={p.profileViews !== false} onChange={(v) => save({ profileViews: v })} />} />
      </Group>
      <Group title={`Контакты · ${contacts.data?.users.length ?? '…'}`}>
        {contacts.data?.users.map((u) => <Row key={u.id} title={<span className="row" style={{ gap: 10 }}><Avatar src={u.avatar} name={u.displayName} id={u.id} size={32} />{u.displayName}</span>} sub={lastSeen(u)} onClick={() => openModal('userProfile', { userId: u.id })} />)}
        {contacts.data && !contacts.data.users.length && <Row title={<span className="muted">Контактов пока нет — добавьте из профиля человека</span>} />}
      </Group>
      <Group title={`Заблокированные · ${blocked.data?.users.length ?? '…'}`}>
        {blocked.data?.users.map((u) => <Row key={u.id} title={<span className="row" style={{ gap: 10 }}><Avatar src={u.avatar} name={u.displayName} id={u.id} size={32} />{u.displayName}</span>} right={<button className="btn sm secondary" onClick={() => unblock(u)}>Разблокировать</button>} />)}
        {blocked.data && !blocked.data.users.length && <Row title={<span className="muted">Никого</span>} />}
      </Group>
    </>
  );
}

// ---------------- devices ----------------
export function DevicesPage() {
  const { data, reload } = useAsync(() => api('/sessions'), []);
  const [run] = useAction();
  if (!data) return <div className="center" style={{ padding: 30 }}><Spinner /></div>;
  const cur = data.sessions.find((s) => s.current);
  const others = data.sessions.filter((s) => !s.current);
  const icon = (d) => (/iOS|Android/.test(d) ? Smartphone : Monitor);
  const when = (ts) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <Group title="Это устройство">
        {cur ? <Row icon={icon(cur.device)} color="#34c759" title={cur.device} sub={`в сети · ${cur.ip || ''}`} /> : <Row icon={Monitor} color="#34c759" title="Этот браузер" sub="Вход выполнен до обновления — после следующего входа появится здесь" />}
      </Group>
      {(others.length > 0 || data.currentLegacy) && (
        <Group footer="Выход на других устройствах потребует снова ввести сид-фразу.">
          <Row title={<span className="danger">Завершить все другие сеансы</span>} onClick={() => confirm('Выйти на всех других устройствах?') && run(async () => { await api('/sessions/terminate-others', { body: {} }); reload(); }, 'Другие сеансы завершены')} />
        </Group>
      )}
      {others.length > 0 && (
        <Group title="Активные сеансы">
          {others.map((s) => <Row key={s.id} icon={icon(s.device)} color="#5856d6" title={s.device} sub={when(s.lastActive)} right={<button className="icon-btn" onClick={() => run(async () => { await api.del(`/sessions/${s.id}`); reload(); }, 'Сеанс завершён')}><Trash2 size={18} className="danger" /></button>} />)}
        </Group>
      )}
    </>
  );
}

// ---------------- security ----------------
function CallsPrivacyGroup() {
  const [relay, setRelay] = useState(() => { try { return localStorage.getItem('calls.relayOnly') === '1'; } catch { return false; } });
  const [has, setHas] = useState(null);
  useEffect(() => { api('/calls/config').then((r) => setHas(r.hasRelay)).catch(() => setHas(false)); }, []);
  return (
    <Group title="Звонки" footer={has === false ? 'Администратор ещё не настроил ретранслятор — звонки идут напрямую, собеседник может узнать ваш IP-адрес.' : 'Звонок пойдёт через сервер-ретранслятор: собеседник не узнает ваш IP-адрес. Качество может быть чуть ниже.'}>
      <Row icon={ShieldCheck} color="#5856d6" title="Только через ретранслятор" right={<Switch on={relay} onChange={(v) => { setRelay(v); try { localStorage.setItem('calls.relayOnly', v ? '1' : '0'); } catch {} }} />} />
    </Group>
  );
}

function CloudPasswordGroup() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const toast = useStore((s) => s.toast);
  const [form, setForm] = useState(null); // null | { current, password, repeat, hint }
  const save = async (remove = false) => {
    try {
      if (!remove && form.password !== form.repeat) { toast('Пароли не совпадают', 'error'); return; }
      const r = await api('/me/password', { body: { current: form?.current || '', password: remove ? null : form.password, hint: form?.hint } });
      setMe(r.user); setForm(null); toast(remove ? 'Облачный пароль выключен' : 'Облачный пароль сохранён');
    } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Group title="Облачный пароль" footer="Второй шаг входа: после сид-фразы на новом устройстве понадобится этот пароль. Хранится на сервере только в виде стойкого хэша.">
      {!form ? (
        <>
          <Row icon={KeyRound} color="#34c759" title={me.hasPassword ? 'Сменить пароль' : 'Включить облачный пароль'} value={me.hasPassword ? 'вкл.' : 'выкл.'} onClick={() => setForm({ current: '', password: '', repeat: '', hint: me.passwordHint || '' })} />
          {me.hasPassword && <Row title={<span className="danger">Выключить пароль</span>} onClick={() => setForm({ current: '', password: '', repeat: '', hint: '', remove: true })} />}
        </>
      ) : (
        <div className="col" style={{ gap: 8, padding: 12 }}>
          {me.hasPassword && <input className="input" type="password" placeholder="Текущий пароль" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />}
          {!form.remove && (
            <>
              <input className="input" type="password" placeholder="Новый пароль (от 6 символов)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <input className="input" type="password" placeholder="Повторите пароль" value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })} />
              <input className="input" placeholder="Подсказка (необязательно)" value={form.hint} onChange={(e) => setForm({ ...form, hint: e.target.value })} />
            </>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary grow" onClick={() => setForm(null)}>Отмена</button>
            <button className={`btn grow ${form.remove ? 'danger-btn' : ''}`} onClick={() => save(!!form.remove)}>{form.remove ? 'Выключить' : 'Сохранить'}</button>
          </div>
        </div>
      )}
    </Group>
  );
}

export function SecurityPage() {
  const enabled = useLock((s) => s.enabled);
  const autoLock = useLock((s) => s.autoLock);
  const lockState = useLock();
  const toast = useStore((s) => s.toast);
  const [mode, setMode] = useState(null); // set | confirm | disable
  const [first, setFirst] = useState('');
  if (mode === 'set') return <PinPad title="Придумайте код-пароль" subtitle="4 цифры" onDone={(c) => { setFirst(c); setMode('confirm'); }} />;
  if (mode === 'confirm') return <PinPad title="Повторите код" onDone={async (c) => { if (c !== first) { toast('Коды не совпали', 'error'); setMode('set'); return false; } await lockState.setCode(c, 5); setMode(null); toast('Код-пароль включён'); return true; }} />;
  if (mode === 'disable') return <PinPad title="Введите текущий код" onDone={async (c) => { if (!(await checkCode(c))) return false; lockState.clear(); setMode(null); toast('Код-пароль выключен'); return true; }} />;
  return (
    <>
      <Group title="Код-пароль" footer="Код хранится только на этом устройстве. Если забудете — выйдите и войдите снова по сид-фразе.">
        <Row icon={Lock} color="#ff9500" title="Код-пароль" right={<Switch on={enabled} onChange={(v) => setMode(v ? 'set' : 'disable')} />} />
        {enabled && (
          <div className="set-inline">
            <span className="grow small">Блокировать через</span>
            <select className="input" style={{ width: 150, height: 38 }} value={autoLock} onChange={(e) => lockState.setAutoLock(Number(e.target.value))}>
              {[[0, 'сразу'], [1, '1 минуту'], [5, '5 минут'], [60, '1 час']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}
        {enabled && <Row title="Заблокировать сейчас" onClick={() => lockState.lock()} />}
      </Group>
      <CloudPasswordGroup />
      <CallsPrivacyGroup />
      <Group title="Удаление аккаунта" footer="Сообщения, посты, истории, файлы, юзернеймы и контакты будут стёрты с сервера безвозвратно. Войти по этой сид-фразе будет нельзя.">
        <Row icon={Trash2} color="#ff453a" title={<span className="danger">Удалить аккаунт навсегда</span>} onClick={async () => {
          const word = prompt('Это нельзя отменить. Чтобы удалить аккаунт, введите слово УДАЛИТЬ');
          if (word !== 'УДАЛИТЬ') return;
          try { await api('/me', { method: 'DELETE', body: { confirm: 'УДАЛИТЬ' } }); localStorage.clear(); location.href = '/'; } catch (e) { toast(e.message, 'error'); }
        }} />
      </Group>
      <Group title="Сид-фраза">
        <div className="warn-box" style={{ margin: 10 }}>
          <ShieldCheck size={18} />
          <span>Аккаунт защищён сид-фразой из 12 слов. Сервер хранит только хеш ключа — восстановить фразу невозможно. Храните её офлайн и никому не показывайте.</span>
        </div>
      </Group>
    </>
  );
}

// ---------------- storage ----------------
const KEEP = ['recidivist.token', 'recidivist.theme', 'recidivist.lang', 'recidivist.passcode'];
export function StoragePage() {
  const toast = useStore((s) => s.toast);
  const [est, setEst] = useState(null);
  const [cache, setCache] = useState(0);
  const measure = async () => {
    const e = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    let ls = 0;
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch {}
    let cs = 0;
    if (window.caches) {
      for (const key of await caches.keys()) {
        const c = await caches.open(key);
        for (const req of await c.keys()) { const r = await c.match(req); if (r) cs += Number(r.headers.get('content-length') || 0); }
      }
    }
    setCache(cs);
    setEst({ usage: e?.usage || ls + cs, quota: e?.quota || 0, ls });
  };
  useEffect(() => { measure(); }, []);
  const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} МБ`;
  const clearCache = async () => {
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
    toast('Кэш медиа очищен');
    measure();
  };
  const clearLocal = () => {
    try { Object.keys(localStorage).filter((k) => !KEEP.includes(k)).forEach((k) => localStorage.removeItem(k)); } catch {}
    toast('Черновики и временные данные удалены');
    measure();
  };
  const pct = est?.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
  return (
    <>
      <div className="storage-card">
        <div className="muted small">Занято на устройстве</div>
        <div className="storage-big">{est ? mb(est.usage) : '…'}</div>
        {est?.quota > 0 && <div className="muted small">из {mb(est.quota)} доступных браузеру</div>}
        <div className="storage-bar"><i style={{ width: `${Math.max(2, pct)}%` }} /></div>
        <div className="storage-legend">
          <span><i style={{ background: '#ff453a' }} />Кэш медиа<b>{mb(cache)}</b></span>
          <span><i style={{ background: '#0a84ff' }} />Настройки и черновики<b>{est ? mb(est.ls) : '…'}</b></span>
          <span><i style={{ background: '#8e8e93' }} />Приложение и прочее<b>{est ? mb(Math.max(0, est.usage - cache - est.ls)) : '…'}</b></span>
        </div>
      </div>
      <Group title="Очистка" footer="Сообщения и файлы хранятся на сервере — после очистки они просто загрузятся заново.">
        <Row icon={HardDrive} color="#ff9f0a" title="Очистить кэш медиа" onClick={clearCache} />
        <Row icon={Trash2} color="#ff453a" title="Удалить черновики и временные данные" onClick={clearLocal} />
      </Group>
    </>
  );
}

// ---------------- wallet card (currency) ----------------
export function WalletCardPage() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const currency = useStore((s) => s.currency);
  const openModal = useStore((s) => s.openModal);
  const { data } = useAsync(() => api('/wallet'), [me.balance]);
  const [filter, setFilter] = useState('all');
  const [pick, setPick] = useState(false);
  const [run] = useAction();
  if (pick) {
    return <UserPicker single onToggle={(u) => { setPick(false); openModal('transfer', { toUser: u }); }} />;
  }
  const txs = (data?.transactions || []).filter((x) => filter === 'all' || (filter === 'in' ? x.amount > 0 : x.amount < 0));
  return (
    <>
      <WalletCard amount={me.balance} owner={me.username ? `@${me.username}` : me.displayName} />
      <div className="row" style={{ gap: 10, margin: '14px 0' }}>
        <button className="btn secondary grow" onClick={() => openModal('wallet')}><Plus size={18} /> Пополнить</button>
        <button className="btn secondary grow" onClick={() => setPick(true)}><Send size={18} /> Отправить</button>
      </div>
      <Group footer="Под именем в профиле появится плашка с балансом — её увидит каждый.">
        <Row title="Показывать баланс в профиле" right={<Switch on={!!me.showBalance} onChange={(v) => run(async () => setMe((await api('/me/profile-extra', { body: { showBalance: v } })).user))} />} />
      </Group>
      <div className="set-group-title">История</div>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        {[['all', 'Все'], ['in', 'Пришло'], ['out', 'Ушло']].map(([k, l]) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {!data ? <Spinner /> : !txs.length ? <div className="muted center small" style={{ padding: 20 }}>Пока пусто</div> : txs.map((x) => (
        <div key={x.id} className="tx-row">
          <span className={`set-ico ${x.amount > 0 ? 'in' : 'out'}`} style={{ background: x.amount > 0 ? '#34c759' : '#3a3a3c' }}>{x.amount > 0 ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
          <div className="grow"><div className="small ellipsis">{x.description || x.type}</div><div className="tiny muted">{new Date(x.createdAt).toLocaleString('ru-RU')}</div></div>
          <span className={`amt ${x.amount > 0 ? 'plus' : ''}`}>{x.amount > 0 ? '+' : ''}{fmtNum(x.amount)}</span>
        </div>
      ))}
    </>
  );
}

export function WalletCard({ amount, owner }) {
  const currency = useStore((s) => s.currency);
  return (
    <div className="wcard">
      <div className="wcard-shine" />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <img src="/icon.svg" alt="" width={46} height={46} style={{ borderRadius: 14 }} />
        <div className="grow"><div className="wcard-brand">Recidivist</div><span className="wcard-tag">CARD</span></div>
        <span className="wcard-chip" />
      </div>
      <div className="wcard-amount"><span>{fmtNum(amount || 0)}</span><small>{currency.symbol} {currency.name}</small></div>
      <div className="wcard-owner">{owner}</div>
    </div>
  );
}

// ---------------- premium ----------------
const PERKS = [
  ['Искра Premium', 'Рядом с именем — везде, где вас видят', SparkIcon, '#ff3b5c'],
  ['Своё имя', 'Цвет, перелив, свечение и жирность', Sparkles, '#ff2d55'],
  ['Фон профиля', 'Перелив или золото вверху профиля', Crown, '#af52de'],
  ['Живая аватарка', 'GIF двигается, а не стоит', Eye, '#30b0c7'],
  ['Особые шрифты', 'Minecraft, Unbounded и моноширинный', KeyRound, '#5856d6'],
  ['Время захода других', 'Даже если вы скрыли своё', Eye, '#0a84ff'],
  ['Кто смотрел профиль', 'Кто открывал вашу страницу', Eye, '#34c759'],
  ['Кто может вам писать', 'Платные и Premium-сообщения проходят без ограничений', Send, '#ff9f0a'],
  ['Больше своего', '10 каналов и 10 групп вместо 3', Plus, '#ff375f'],
  ['20 постов в день вместо 5', 'Пауза 15 с вместо 30', Sparkles, '#32d74b'],
];
const BGS = { aurora: 'linear-gradient(135deg,#5b2bff,#ff2d95,#ff9a3c)', gold: 'linear-gradient(135deg,#7a5a00,#ffd86b,#b8860b)', sunset: 'linear-gradient(135deg,#ff512f,#dd2476)', ocean: 'linear-gradient(135deg,#00c6ff,#0072ff)', blood: 'linear-gradient(135deg,#3d0008,#ff2d3d)', toxic: 'linear-gradient(135deg,#0f3d00,#9dff3b)', violet: 'linear-gradient(135deg,#2a0f6b,#a77bff)', mono: 'linear-gradient(135deg,#111,#666)' };
export const profileBgCss = (id) => BGS[id] || null;

export function PremiumPage() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const { data, reload } = useAsync(() => api('/premium'), []);
  const [months, setMonths] = useState(1);
  const [run, busy] = useAction();
  const [ns, setNs] = useState(me.nameStyle || { color: '#ff2d3d', color2: '#ffb020', animated: true, glow: false, bold: false });
  const [views, setViews] = useState(null);
  const active = !!data?.active;
  const buy = () => run(async () => { setMe((await api('/premium/buy', { body: { months } })).user); reload(); }, 'Premium активирован ⭐');
  const saveStyle = (body) => run(async () => setMe((await api('/me/premium-style', { body })).user), 'Сохранено');
  return (
    <div className="premium">
      <div className="prem-hero">
        <div className="prem-star"><SparkIcon size={50} fill="#fff" /></div>
        <h2>Recidivist Premium</h2>
        <p>Заметный профиль, особые шрифты, больше лимитов и полный контроль над тем, кто вам пишет.</p>
        {data && <span className="prem-price">{active ? `активен до ${new Date(data.until).toLocaleDateString('ru-RU')}` : <><Spark amount={data.price} /> / месяц</>}</span>}
      </div>
      <div className="set-group prem-perks">
        {PERKS.map(([t, sub, I, c], i) => <div key={t} className="set-row" style={{ animationDelay: `${i * 0.03}s` }}><span className="set-ico" style={{ background: c }}><I size={18} /></span><span className="grow set-text"><span>{t}</span><small>{sub}</small></span></div>)}
      </div>
      {active && (
        <>
          <div className="set-group-title">Своё имя</div>
          <div className="set-group" style={{ padding: 14 }}>
            <div className="prem-preview"><StyledName user={{ displayName: me.displayName, nameStyle: ns }} className="" /></div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              <label className="small row" style={{ gap: 6 }}>цвет<input type="color" value={ns.color || '#ffffff'} onChange={(e) => setNs({ ...ns, color: e.target.value })} /></label>
              <label className="small row" style={{ gap: 6 }}>перелив<input type="color" value={ns.color2 || '#ffffff'} onChange={(e) => setNs({ ...ns, color2: e.target.value })} /></label>
              <button className="chip" onClick={() => setNs({ ...ns, color2: null })}>без перелива</button>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {[['animated', 'анимация'], ['glow', 'свечение'], ['bold', 'жирный']].map(([k, l]) => <button key={k} className={`chip ${ns[k] ? 'on' : ''}`} onClick={() => setNs({ ...ns, [k]: !ns[k] })}>{l}</button>)}
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn secondary grow sm" onClick={() => saveStyle({ nameStyle: null })}>Сбросить</button>
              <button className="btn grow sm" disabled={busy} onClick={() => saveStyle({ nameStyle: ns })}>Сохранить</button>
            </div>
          </div>
          <div className="set-group-title">Фон профиля</div>
          <div className="prem-bgs">
            <button className={`prem-bg ${!me.profileBg ? 'on' : ''}`} style={{ background: 'var(--bg-3)' }} onClick={() => saveStyle({ profileBg: null })}>нет</button>
            {Object.entries(BGS).map(([id, css]) => <button key={id} className={`prem-bg ${me.profileBg === id ? 'on' : ''}`} style={{ background: css }} onClick={() => saveStyle({ profileBg: id })} />)}
          </div>
          <div className="set-group-title">Кто смотрел профиль</div>
          <div className="set-group">
            {!views ? <Row title="Показать" onClick={() => api('/me/profile-views').then((r) => setViews(r.views)).catch(() => setViews([]))} /> : !views.length ? <Row title={<span className="muted">Пока никого</span>} /> : views.map((v) => (
              <Row key={v.user.id} title={<span className="row" style={{ gap: 10 }}><Avatar src={v.user.avatar} name={v.user.displayName} id={v.user.id} size={32} />{v.user.displayName}</span>} sub={new Date(v.viewedAt).toLocaleString('ru-RU')} onClick={() => useStore.getState().openModal('userProfile', { userId: v.user.id })} />
            ))}
          </div>
        </>
      )}
      <div className="prem-buy">
        <div className="seg" style={{ marginBottom: 10 }}>
          <span className="seg-ind" style={{ transform: `translateX(${[1, 3, 12].indexOf(months) * 100}%)` }} />
          {[1, 3, 12].map((m) => <button key={m} className={months === m ? 'on' : ''} onClick={() => setMonths(m)}>{m} мес.</button>)}
        </div>
        <button className="btn block prem-btn" disabled={busy || !data} onClick={buy}>{active ? 'Продлить' : 'Оформить'} за <Spark amount={(data?.price || 0) * months} /></button>
      </div>
    </div>
  );
}
