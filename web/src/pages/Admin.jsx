import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Gift, Palette, Receipt, CreditCard, Store, Settings, Megaphone, ArrowLeft, Search, Plus, Ban, BadgeCheck, Shield, Coins, FlaskConical, KeyRound,
} from 'lucide-react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Modal, Spinner, useAsync, useAction, Switch } from '../components/common.jsx';
import { CollectibleArt } from '../components/GiftArt.jsx';
import { ModalHost, Toasts } from './Main.jsx';
import { fmtNum } from '../util.js';

const dt = (ts) => (ts ? new Date(ts).toLocaleString('ru-RU') : '—');

function Dashboard() {
  const { data } = useAsync(() => api('/admin/stats'), []);
  const currency = useStore((s) => s.currency);
  if (!data) return <Spinner />;
  const items = [
    ['Пользователи', data.users], ['Новых за 24ч', data.newUsers24h], ['Заблокировано', data.banned], ['Групп и каналов', data.chats],
    ['Сообщений', data.messages], ['Сообщений за 24ч', data.messages24h], [`${currency.name} у пользователей`, data.totalBalance],
    [`Куплено ${currency.name}`, data.sparksPurchased], ['Оплаченных платежей', data.paidPayments], ['Подарков продано', data.giftsSold],
    ['Коллекционных', data.collectibles], ['Активных лотов', data.activeListings], ['Оборот маркета', data.marketVolume], ['Активных историй', data.activeStories],
  ];
  return (
    <>
      <h2>Дашборд</h2>
      <div className="stat-grid">{items.map(([l, v]) => <div className="stat" key={l}><div className="v">{fmtNum(v)}</div><div className="l">{l}</div></div>)}</div>
    </>
  );
}

function UserEditor({ userId, onChanged }) {
  const currency = useStore((s) => s.currency);
  const close = useStore((s) => s.closeModal);
  const { data, reload } = useAsync(() => api(`/admin/users/${userId}`), [userId]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  if (!data) return <Modal title="Пользователь"><Spinner /></Modal>;
  const u = data.user;
  const grant = (sign) => run(async () => { await api(`/admin/users/${u.id}/balance`, { body: { amount: sign * Number(amount), reason } }); setAmount(''); setReason(''); reload(); onChanged(); }, 'Баланс обновлён');
  const flag = (body) => run(async () => { await api(`/admin/users/${u.id}/flags`, { body }); reload(); onChanged(); });
  return (
    <Modal title={`#${u.id} ${u.displayName}`} wide>
      <div className="row" style={{ marginBottom: 14 }}>
        <Avatar src={u.avatar} name={u.displayName} id={u.id} size={64} />
        <div className="grow">
          <div className="bold">{u.displayName} {u.username && <span className="muted">@{u.username}</span>}</div>
          <div className="small muted">{u.email} · с {dt(u.createdAt)}</div>
          <div className="small">Баланс: <b className="accent">{currency.symbol} {fmtNum(u.balance)}</b> · подарков: {data.gifts} · юзернеймы: {data.usernames.map((n) => '@' + n).join(', ') || '—'}</div>
        </div>
      </div>
      <div className="card col" style={{ gap: 10, marginBottom: 14 }}>
        <div className="bold row"><Coins size={18} className="accent" /> Выдать / списать {currency.name}</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 140 }} inputMode="numeric" placeholder="Сумма" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
          <input className="input grow" style={{ minWidth: 160 }} placeholder="Причина (видна пользователю)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn grow" disabled={busy || !amount} onClick={() => grant(1)}>+ Начислить</button>
          <button className="btn danger-btn grow" disabled={busy || !amount} onClick={() => grant(-1)}>− Списать</button>
        </div>
      </div>
      <div className="col" style={{ gap: 8, marginBottom: 14 }}>
        <div className="row"><Ban size={18} /><span className="grow">Заблокирован</span><Switch on={u.isBanned} onChange={(v) => flag({ banned: v })} /></div>
        <div className="row"><BadgeCheck size={18} /><span className="grow">Верифицирован (галочка)</span><Switch on={u.verified} onChange={(v) => flag({ verified: v })} /></div>
        <div className="row"><Shield size={18} /><span className="grow">Администратор</span><Switch on={u.isAdmin} onChange={(v) => flag({ admin: v })} /></div>
        <div className="row"><FlaskConical size={18} /><span className="grow">Тестировщик (доступ к номерам +999)</span><Switch on={u.isTester} onChange={(v) => flag({ tester: v })} /></div>
        <div className="small muted">Анонимный номер: {u.anonNumber || '—'}</div>
      </div>
      <div className="bold small" style={{ marginBottom: 6 }}>Последние операции</div>
      <div className="table-wrap">
        <table className="table"><thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Баланс</th><th>Описание</th></tr></thead>
          <tbody>{data.transactions.map((t) => <tr key={t.id}><td>{dt(t.created_at)}</td><td>{t.type}</td><td className={t.amount > 0 ? 'accent' : ''}>{t.amount > 0 ? '+' : ''}{t.amount}</td><td>{t.balance_after}</td><td>{t.description}</td></tr>)}</tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, textAlign: 'right' }}><button className="btn secondary" onClick={close}>Закрыть</button></div>
    </Modal>
  );
}

function UsersPage() {
  const [q, setQ] = useState('');
  const openModal = useStore((s) => s.openModal);
  const { data, reload } = useAsync(() => api(`/admin/users?q=${encodeURIComponent(q)}`), [q]);
  return (
    <>
      <h2>Пользователи</h2>
      <div className="search-box" style={{ maxWidth: 420, marginBottom: 14 }}><Search size={18} /><input placeholder="Имя, email, @username или ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>ID</th><th>Пользователь</th><th>Email</th><th>Баланс</th><th>Статус</th><th>Регистрация</th></tr></thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => openModal('adminUser', { userId: u.id, onChanged: reload })}>
                <td>{u.id}</td>
                <td><span className="row" style={{ gap: 8 }}><Avatar src={u.avatar} name={u.displayName} id={u.id} size={28} />{u.displayName}{u.username && <span className="muted">@{u.username}</span>}</span></td>
                <td>{u.email}</td>
                <td className="accent bold">{fmtNum(u.balance)}</td>
                <td>{u.isBanned && <span className="tag red">бан</span>} {u.isAdmin && <span className="tag accent">админ</span>} {u.isTester && <span className="tag">тест</span>} {u.verified && <span className="tag green">✓</span>} {u.anonNumber && <span className="muted small">{u.anonNumber}</span>}</td>
                <td>{dt(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function GiftEditor({ gift, onSaved }) {
  const close = useStore((s) => s.closeModal);
  const [f, setF] = useState({
    name: gift?.name || '', emoji: gift?.emoji || '🎁', price: gift?.price ?? 100, supply: gift?.supply ?? '', upgradePrice: gift?.upgradePrice ?? '',
    convertValue: gift?.convertValue ?? '', enabled: gift?.enabled ?? true, sort: gift?.sort ?? 0,
  });
  const [models, setModels] = useState(gift?.models || []);
  const [grantUser, setGrantUser] = useState('');
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => run(async () => {
    const body = { ...f, supply: f.supply === '' ? null : Number(f.supply), upgradePrice: f.upgradePrice === '' ? null : Number(f.upgradePrice), convertValue: f.convertValue === '' ? undefined : Number(f.convertValue), price: Number(f.price), sort: Number(f.sort) };
    if (gift) {
      await api.patch(`/admin/gifts/${gift.id}`, body);
      if (models.length) await api.put(`/admin/gifts/${gift.id}/models`, { models });
    } else await api('/admin/gifts', { body });
    onSaved();
    close();
  }, 'Сохранено');
  const grant = () => run(async () => { await api(`/admin/gifts/${gift.id}/grant`, { body: { userId: Number(grantUser) } }); setGrantUser(''); }, 'Подарок выдан');
  const total = models.reduce((s, m) => s + Number(m.rarity || 0), 0) || 1;
  return (
    <Modal title={gift ? `Подарок: ${gift.name}` : 'Новый подарок'} wide footer={<button className="btn" disabled={busy} onClick={save}>Сохранить</button>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field" style={{ width: 90 }}><label>Эмодзи</label><input className="input" style={{ fontSize: '1.5em', textAlign: 'center' }} value={f.emoji} onChange={set('emoji')} /></div>
          <div className="field grow"><label>Название</label><input className="input" value={f.name} onChange={set('name')} /></div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field grow"><label>Цена</label><input className="input" inputMode="numeric" value={f.price} onChange={set('price')} /></div>
          <div className="field grow"><label>Тираж (пусто = безлимит)</label><input className="input" inputMode="numeric" value={f.supply ?? ''} onChange={set('supply')} /></div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field grow"><label>Цена улучшения (пусто = нельзя)</label><input className="input" inputMode="numeric" value={f.upgradePrice ?? ''} onChange={set('upgradePrice')} /></div>
          <div className="field grow"><label>Конвертация в валюту</label><input className="input" inputMode="numeric" value={f.convertValue ?? ''} onChange={set('convertValue')} placeholder="85% цены" /></div>
          <div className="field" style={{ width: 100 }}><label>Порядок</label><input className="input" inputMode="numeric" value={f.sort} onChange={set('sort')} /></div>
        </div>
        <div className="row"><span className="grow">Доступен в магазине</span><Switch on={!!f.enabled} onChange={(v) => setF({ ...f, enabled: v })} /></div>
        {gift && (
          <>
            <div className="divider" />
            <div className="bold">Модели коллекционной версии</div>
            <div className="small muted">Модель — вариант внешнего вида (своя картинка/анимация или эмодзи + CSS-фильтр). Вес определяет редкость (10 = 1%).</div>
            {models.map((m, i) => (
              <div key={m.id || `n${i}`} className="row" style={{ flexWrap: 'wrap' }}>
                {m.image ? <img src={m.image} alt="" style={{ width: 40, height: 40, objectFit: 'contain', filter: m.filter || undefined }} /> : <span style={{ fontSize: '1.8em', filter: m.filter, width: 40, textAlign: 'center' }}>{m.emoji}</span>}
                <input className="input" style={{ width: 130 }} value={m.name} onChange={(e) => setModels(models.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input" style={{ width: 70 }} value={m.emoji} onChange={(e) => setModels(models.map((x, k) => (k === i ? { ...x, emoji: e.target.value } : x)))} />
                <input className="input grow" style={{ minWidth: 140 }} placeholder="CSS filter" value={m.filter || ''} onChange={(e) => setModels(models.map((x, k) => (k === i ? { ...x, filter: e.target.value } : x)))} />
                <input className="input" style={{ width: 80 }} inputMode="numeric" value={m.rarity} onChange={(e) => setModels(models.map((x, k) => (k === i ? { ...x, rarity: e.target.value.replace(/\D/g, '') } : x)))} />
                <span className="small muted" style={{ width: 50 }}>{Math.round((Number(m.rarity || 0) / total) * 1000) / 10}%</span>
                <button className="icon-btn" onClick={() => setModels(models.filter((_, k) => k !== i))}>✕</button>
              </div>
            ))}
            <button className="btn secondary sm" onClick={() => setModels([...models, { name: 'Новая', emoji: f.emoji, filter: '', rarity: 50 }])}><Plus size={15} /> Добавить модель</button>
            <div className="divider" />
            <div className="bold">Выдать подарок пользователю</div>
            <div className="row"><input className="input grow" placeholder="ID пользователя" inputMode="numeric" value={grantUser} onChange={(e) => setGrantUser(e.target.value.replace(/\D/g, ''))} /><button className="btn" disabled={!grantUser || busy} onClick={grant}>Выдать</button></div>
          </>
        )}
      </div>
    </Modal>
  );
}

function GiftsPage() {
  const openModal = useStore((s) => s.openModal);
  const { data, reload } = useAsync(() => api('/admin/gifts'), []);
  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}><h2 className="grow" style={{ margin: 0 }}>Подарки</h2><button className="btn" onClick={() => openModal('adminGift', { onSaved: reload })}><Plus size={18} /> Новый подарок</button></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th></th><th>Название</th><th>Цена</th><th>Продано / тираж</th><th>Улучшение</th><th>Коллекц.</th><th>Конверт.</th><th>Статус</th></tr></thead>
          <tbody>
            {data?.gifts.map((g) => (
              <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => openModal('adminGift', { gift: g, onSaved: reload })}>
                <td style={{ fontSize: '1.5em' }}>{g.emoji}</td><td>{g.name}</td><td>{fmtNum(g.price)}</td>
                <td>{fmtNum(g.sold)} / {g.supply ? fmtNum(g.supply) : '∞'}</td>
                <td>{g.upgradePrice ?? '—'}</td><td>{g.upgraded}</td><td>{g.convertValue}</td>
                <td>{g.enabled ? <span className="tag green">в продаже</span> : <span className="tag">скрыт</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AttributesPage() {
  const { data, reload } = useAsync(() => api('/admin/attributes'), []);
  const [run] = useAction();
  const [bd, setBd] = useState({ name: '', center: '#ff3b3b', edge: '#000000', pattern: '#ffffff', rarity: 10 });
  const [sym, setSym] = useState({ name: '', emoji: '', rarity: 10 });
  const [previewSym, setPreviewSym] = useState('');
  const [seed] = useState(() => Math.floor(Math.random() * 1e6));
  const setRarity = (table, id, rarity) => run(async () => { await api.patch(`/admin/attributes/${table}/${id}`, { rarity }); reload(); });
  if (!data) return <Spinner />;
  const bTotal = data.backdrops.reduce((s, x) => s + x.rarity, 0) || 1;
  const sTotal = data.symbols.reduce((s, x) => s + x.rarity, 0) || 1;
  return (
    <>
      <h2>Фоны и узоры коллекционных подарков</h2>
      <div className="small muted" style={{ marginBottom: 10 }}>
        Фон и узор выпадают независимо друг от друга: {data.backdrops.length} фонов × {data.symbols.length} узоров = {fmtNum(data.backdrops.length * data.symbols.length)} сочетаний.
      </div>
      <div className="row small" style={{ marginBottom: 12 }}>
        <span className="muted">Узор в превью:</span>
        <select className="input" style={{ width: 220, height: 34 }} value={previewSym} onChange={(e) => setPreviewSym(e.target.value)}>
          <option value="">Случайный для каждого фона</option>
          {data.symbols.map((s) => <option key={s.id} value={s.id}>{s.emoji} {s.name}</option>)}
        </select>
      </div>
      <div className="gift-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', marginBottom: 16 }}>
        {data.backdrops.map((b) => (
          <div key={b.id} className="card" style={{ padding: 8 }}>
            <CollectibleArt col={{ backdrop: b, symbol: data.symbols.find((s) => String(s.id) === previewSym) || data.symbols[(b.id * 7919 + seed) % data.symbols.length], model: { emoji: '💀' } }} size="100%" height={100} rounded={10} />
            <div className="small bold" style={{ marginTop: 6 }}>{b.name}</div>
            <div className="row small"><input className="input" style={{ height: 32 }} defaultValue={b.rarity} onBlur={(e) => Number(e.target.value) !== b.rarity && setRarity('backdrops', b.id, Number(e.target.value))} /><span className="muted">{Math.round((b.rarity / bTotal) * 1000) / 10}%</span></div>
          </div>
        ))}
      </div>
      <div className="card row" style={{ flexWrap: 'wrap', marginBottom: 24 }}>
        <input className="input" style={{ width: 160 }} placeholder="Название фона" value={bd.name} onChange={(e) => setBd({ ...bd, name: e.target.value })} />
        <label className="small">центр <input type="color" value={bd.center} onChange={(e) => setBd({ ...bd, center: e.target.value })} /></label>
        <label className="small">край <input type="color" value={bd.edge} onChange={(e) => setBd({ ...bd, edge: e.target.value })} /></label>
        <label className="small">узор <input type="color" value={bd.pattern} onChange={(e) => setBd({ ...bd, pattern: e.target.value })} /></label>
        <input className="input" style={{ width: 90 }} placeholder="вес" value={bd.rarity} onChange={(e) => setBd({ ...bd, rarity: e.target.value })} />
        <button className="btn" disabled={!bd.name} onClick={() => run(async () => { await api('/admin/backdrops', { body: bd }); setBd({ ...bd, name: '' }); reload(); }, 'Фон добавлен')}><Plus size={16} /> Фон</button>
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {data.symbols.map((s) => (
          <div key={s.id} className="card row" style={{ padding: '6px 10px', gap: 6 }}>
            <span style={{ fontSize: '1.4em' }}>{s.emoji}</span><span className="small">{s.name}</span>
            <input className="input" style={{ width: 56, height: 30 }} defaultValue={s.rarity} onBlur={(e) => Number(e.target.value) !== s.rarity && setRarity('symbols', s.id, Number(e.target.value))} />
            <span className="tiny muted">{Math.round((s.rarity / sTotal) * 1000) / 10}%</span>
          </div>
        ))}
      </div>
      <div className="card row" style={{ flexWrap: 'wrap' }}>
        <input className="input" style={{ width: 80 }} placeholder="🔥" value={sym.emoji} onChange={(e) => setSym({ ...sym, emoji: e.target.value })} />
        <input className="input" style={{ width: 160 }} placeholder="Название узора" value={sym.name} onChange={(e) => setSym({ ...sym, name: e.target.value })} />
        <input className="input" style={{ width: 90 }} placeholder="вес" value={sym.rarity} onChange={(e) => setSym({ ...sym, rarity: e.target.value })} />
        <button className="btn" disabled={!sym.name || !sym.emoji} onClick={() => run(async () => { await api('/admin/symbols', { body: sym }); setSym({ name: '', emoji: '', rarity: 10 }); reload(); }, 'Узор добавлен')}><Plus size={16} /> Узор</button>
      </div>
    </>
  );
}

function TransactionsPage() {
  const { data } = useAsync(() => api('/admin/transactions?limit=500'), []);
  return (
    <>
      <h2>Транзакции</h2>
      <div className="table-wrap">
        <table className="table"><thead><tr><th>ID</th><th>Дата</th><th>Пользователь</th><th>Тип</th><th>Сумма</th><th>Баланс</th><th>Описание</th></tr></thead>
          <tbody>{data?.transactions.map((t) => <tr key={t.id}><td>{t.id}</td><td>{dt(t.created_at)}</td><td>{t.display_name} <span className="muted">#{t.user_id}</span></td><td>{t.type}</td><td className={t.amount > 0 ? 'accent bold' : ''}>{t.amount > 0 ? '+' : ''}{t.amount}</td><td>{t.balance_after}</td><td>{t.description}</td></tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function PaymentsPage() {
  const { data, reload } = useAsync(() => api('/admin/payments'), []);
  const [run] = useAction();
  return (
    <>
      <h2>Платежи</h2>
      <div className="table-wrap">
        <table className="table"><thead><tr><th>ID</th><th>Дата</th><th>Пользователь</th><th>Провайдер</th><th>Сумма</th><th>Валюта</th><th>Статус</th><th>Комментарий</th><th></th></tr></thead>
          <tbody>{data?.payments.map((p) => (
            <tr key={p.id}><td>{p.id}</td><td>{dt(p.created_at)}</td><td>{p.display_name}</td><td>{p.provider}</td><td>{p.amount} → {p.sparks}</td><td>{p.currency}</td>
              <td><span className={`tag ${p.status === 'paid' ? 'green' : p.status === 'pending' ? 'accent' : ''}`}>{p.status}</span></td><td className="muted">{p.comment}</td>
              <td>{p.status === 'pending' && <button className="btn sm secondary" onClick={() => confirm('Зачислить платёж вручную?') && run(async () => { await api(`/admin/payments/${p.id}/approve`, { body: {} }); reload(); }, 'Зачислено')}>Зачислить</button>}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function ListingsPage() {
  const { data, reload } = useAsync(() => api('/admin/listings'), []);
  const [run] = useAction();
  return (
    <>
      <h2>Маркет</h2>
      <div className="table-wrap">
        <table className="table"><thead><tr><th>ID</th><th>Дата</th><th>Продавец</th><th>Лот</th><th>Цена</th><th>Статус</th><th></th></tr></thead>
          <tbody>{data?.listings.map((l) => (
            <tr key={l.id}><td>{l.id}</td><td>{dt(l.created_at)}</td><td>{l.seller_name}</td><td>{l.kind === 'gift' ? `${l.emoji} ${l.gift_name} #${l.number}` : `@${l.username}`}</td><td>{fmtNum(l.price)}</td>
              <td><span className={`tag ${l.status === 'sold' ? 'green' : l.status === 'active' ? 'accent' : ''}`}>{l.status}</span></td>
              <td>{l.status === 'active' && <button className="btn sm danger-btn" onClick={() => run(async () => { await api.del(`/market/listings/${l.id}`); reload(); }, 'Лот снят')}>Снять</button>}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function SettingsPage() {
  const { data, setData } = useAsync(() => api('/admin/settings'), []);
  const [run, busy] = useAction();
  if (!data) return <Spinner />;
  const s = data.settings;
  const set = (k) => (e) => setData({ settings: { ...s, [k]: e.target.value } });
  let pkgs = [];
  try { pkgs = JSON.parse(s.packages); } catch {}
  const setPkgs = (p) => setData({ settings: { ...s, packages: JSON.stringify(p) } });
  const save = () => run(async () => { await api.put('/admin/settings', s); useStore.setState({ currency: { name: s.currency_name, nameEn: s.currency_name_en, symbol: s.currency_symbol } }); }, 'Настройки сохранены');
  return (
    <>
      <h2>Настройки платформы</h2>
      <div className="col" style={{ maxWidth: 640, gap: 14 }}>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field grow"><label>Название валюты</label><input className="input" value={s.currency_name} onChange={set('currency_name')} /></div>
          <div className="field grow"><label>Название (EN)</label><input className="input" value={s.currency_name_en} onChange={set('currency_name_en')} /></div>
          <div className="field" style={{ width: 100 }}><label>Символ</label><input className="input" value={s.currency_symbol} onChange={set('currency_symbol')} /></div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field grow"><label>Комиссия маркета, %</label><input className="input" value={s.market_fee_percent} onChange={set('market_fee_percent')} /></div>
          <div className="field grow"><label>Мин. цена лота</label><input className="input" value={s.min_listing_price} onChange={set('min_listing_price')} /></div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <div className="field grow"><label>Цена нового юзернейма (0 = бесплатно)</label><input className="input" value={s.username_price} onChange={set('username_price')} /></div>
          <div className="field grow"><label>Бонус за регистрацию</label><input className="input" value={s.signup_bonus} onChange={set('signup_bonus')} /></div>
        </div>
        <div className="bold">Пакеты пополнения</div>
        {pkgs.map((p, i) => (
          <div key={i} className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" style={{ width: 100 }} value={p.id} onChange={(e) => setPkgs(pkgs.map((x, k) => (k === i ? { ...x, id: e.target.value } : x)))} placeholder="id" />
            <label className="small row" style={{ gap: 4 }}>валюта<input className="input" style={{ width: 100 }} value={p.sparks} onChange={(e) => setPkgs(pkgs.map((x, k) => (k === i ? { ...x, sparks: Number(e.target.value) || 0 } : x)))} /></label>
            <label className="small row" style={{ gap: 4 }}>TON<input className="input" style={{ width: 90 }} value={p.ton} onChange={(e) => setPkgs(pkgs.map((x, k) => (k === i ? { ...x, ton: Number(e.target.value) || 0 } : x)))} /></label>
            <label className="small row" style={{ gap: 4 }}>USDT<input className="input" style={{ width: 90 }} value={p.usdt} onChange={(e) => setPkgs(pkgs.map((x, k) => (k === i ? { ...x, usdt: Number(e.target.value) || 0 } : x)))} /></label>
            <button className="icon-btn" onClick={() => setPkgs(pkgs.filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
        <button className="btn secondary sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPkgs([...pkgs, { id: `p${Date.now() % 100000}`, sparks: 100, ton: 0.5, usdt: 1.5 }])}><Plus size={15} /> Пакет</button>
        <button className="btn" disabled={busy} onClick={save}>Сохранить</button>
      </div>
    </>
  );
}

function BroadcastPage() {
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  return (
    <>
      <h2>Рассылка</h2>
      <div className="col" style={{ maxWidth: 560 }}>
        <div className="small muted">Сообщение придёт всем пользователям от официального аккаунта @recidivist.</div>
        <textarea className="input" style={{ minHeight: 140 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст объявления" />
        <button className="btn" disabled={busy || !text.trim()} onClick={() => confirm('Отправить всем пользователям?') && run(async () => { const r = await api('/admin/broadcast', { body: { text } }); setText(''); useStore.getState().toast(`Отправлено: ${r.sent}`); })}>
          <Megaphone size={18} /> Отправить всем
        </button>
      </div>
    </>
  );
}

function Tri({ value, onChange, labels = ['как в .env', 'вкл', 'выкл'] }) {
  return (
    <div className="tabs" style={{ marginBottom: 0, maxWidth: 360 }}>
      {[['', labels[0]], ['true', labels[1]], ['false', labels[2]]].map(([v, l]) => (
        <button key={v || 'env'} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

function ConfigPage() {
  const { data, setData } = useAsync(() => api('/admin/config'), []);
  const [v, setV] = useState(null);
  const [run, busy] = useAction();
  if (!data) return <Spinner />;
  const val = v || data.values;
  const set = (k) => (e) => setV({ ...val, [k]: typeof e === 'string' ? e : e.target.value });
  const save = () => run(async () => { const r = await api.put('/admin/config', val); setData(r); setV(null); }, 'Настройки сохранены');
  const ef = data.effective;
  const status = (on, text) => <span className={`tag ${on ? 'green' : 'red'}`}>{text}</span>;
  return (
    <>
      <h2>Оплата и вход</h2>
      <div className="small muted" style={{ marginBottom: 14, maxWidth: 680 }}>Эти настройки заменяют значения из <code>server/.env</code>. Пустое поле / «как в .env» — используется значение из файла. Секретные ключи показываются замаскированными: чтобы заменить, впишите новый.</div>
      <div className="col" style={{ maxWidth: 680, gap: 16 }}>
        <div className="card col">
          <div className="row"><b className="grow">TON (TonConnect)</b>{status(ef.tonEnabled, ef.tonEnabled ? 'работает' : 'выключено')}</div>
          <div className="row"><span className="grow small">Принимать оплату в TON</span><Switch on={val.pay_ton !== 'false'} onChange={(on) => set('pay_ton')(on ? 'true' : 'false')} /></div>
          <div className="field"><label>Кошелёк проекта (куда приходят платежи)</label><input className="input" value={val.ton_wallet} onChange={set('ton_wallet')} placeholder={ef.tonWallet || 'UQ…'} /></div>
          <div className="field"><label>Toncenter API key (необязательно)</label><input className="input" value={val.toncenter_key} onChange={set('toncenter_key')} placeholder="ключ toncenter.com" /></div>
        </div>
        <div className="card col">
          <div className="row"><b className="grow">xRocket Pay</b>{status(ef.xrocketEnabled, ef.xrocketEnabled ? 'работает' : ef.xrocketConfigured ? 'выключено' : 'нет ключа')}</div>
          <div className="row"><span className="grow small">Принимать оплату через xRocket</span><Switch on={val.pay_xrocket !== 'false'} onChange={(on) => set('pay_xrocket')(on ? 'true' : 'false')} /></div>
          <div className="field"><label>API key</label><input className="input" value={val.xrocket_key} onChange={set('xrocket_key')} placeholder="Rocket-Pay-Key" /></div>
        </div>
        <div className="card col">
          <div className="row"><b className="grow">Тестовые платежи</b>{status(ef.testPayments, ef.testPayments ? 'включены' : 'выключены')}</div>
          <div className="small muted">Кнопка «тестовая оплата» в кошельке начисляет искры без денег. В продакшене выключите.</div>
          <Tri value={val.test_payments} onChange={set('test_payments')} />
        </div>
        <div className="card col">
          <div className="row"><KeyRound size={18} className="accent" /><b className="grow">Вход и регистрация</b></div>
          <div className="row"><span className="grow small">Регистрация новых пользователей открыта</span><Switch on={val.registration !== 'false'} onChange={(on) => set('registration')(on ? 'true' : 'false')} /></div>
          <div className="row"><span className="grow small">Подтверждать почту кодом</span><Switch on={val.email_verification !== 'false'} onChange={(on) => set('email_verification')(on ? 'true' : 'false')} /></div>
          <div className="field"><label>Email администраторов (через запятую)</label><input className="input" value={val.admin_emails} onChange={set('admin_emails')} placeholder={ef.adminEmails.join(', ') || 'admin@example.com'} /><span className="hint">Пользователь с таким email при регистрации сразу получает права админа.</span></div>
        </div>
        <div className="card col">
          <div className="row"><b className="grow">Почта (SMTP)</b>{status(ef.smtp, ef.smtp ? ef.smtpHost : 'не настроена — коды в консоли')}</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="field grow"><label>Хост</label><input className="input" value={val.smtp_host} onChange={set('smtp_host')} placeholder="smtp.yandex.ru" /></div>
            <div className="field" style={{ width: 110 }}><label>Порт</label><input className="input" value={val.smtp_port} onChange={set('smtp_port')} placeholder="587" /></div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="field grow"><label>Логин</label><input className="input" value={val.smtp_user} onChange={set('smtp_user')} autoComplete="off" /></div>
            <div className="field grow"><label>Пароль</label><input className="input" type="password" value={val.smtp_pass} onChange={set('smtp_pass')} autoComplete="new-password" /></div>
          </div>
          <div className="field"><label>Отправитель</label><input className="input" value={val.smtp_from} onChange={set('smtp_from')} placeholder="Recidivist <no-reply@домен>" /></div>
          <div className="field"><label>SSL (порт 465)</label><Tri value={val.smtp_secure} onChange={set('smtp_secure')} labels={['авто', 'да', 'нет']} /></div>
        </div>
        <button className="btn" disabled={busy} onClick={save}>Сохранить</button>
      </div>
    </>
  );
}

const PAGES = [
  ['dashboard', 'Дашборд', LayoutDashboard, Dashboard],
  ['users', 'Пользователи', Users, UsersPage],
  ['gifts', 'Подарки', Gift, GiftsPage],
  ['attributes', 'Фоны и узоры', Palette, AttributesPage],
  ['transactions', 'Транзакции', Receipt, TransactionsPage],
  ['payments', 'Платежи', CreditCard, PaymentsPage],
  ['listings', 'Маркет', Store, ListingsPage],
  ['settings', 'Настройки', Settings, SettingsPage],
  ['config', 'Оплата и вход', KeyRound, ConfigPage],
  ['broadcast', 'Рассылка', Megaphone, BroadcastPage],
];

function AdminModalHost() {
  const modals = useStore((s) => s.modals);
  const top = modals[modals.length - 1];
  if (top?.type === 'adminUser') return <UserEditor key={top.key} {...top.props} />;
  if (top?.type === 'adminGift') return <GiftEditor key={top.key} {...top.props} />;
  return <ModalHost />;
}

export default function Admin() {
  const navigate = useNavigate();
  const [page, setPage] = useState('dashboard');
  const Page = PAGES.find((p) => p[0] === page)[3];
  return (
    <div className="admin">
      <nav className="admin-nav">
        <button className="menu-item" onClick={() => navigate('/')}><ArrowLeft size={20} /> В мессенджер</button>
        <div className="section-title">Админ-панель</div>
        {PAGES.map(([id, label, Icon]) => (
          <button key={id} className={`menu-item ${page === id ? 'on' : ''}`} onClick={() => setPage(id)}><Icon size={20} /> {label}</button>
        ))}
      </nav>
      <main className="admin-main"><Page /></main>
      <AdminModalHost />
      <Toasts />
    </div>
  );
}
