import { useEffect, useMemo, useState } from 'react';
import { Gavel, Timer, TrendingUp, TrendingDown, Gift, AtSign, CalendarCheck, Check } from 'lucide-react';
import { api } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Modal, Spark, Spinner, useAction } from './common.jsx';
import { GiftArt } from './GiftArt.jsx';
import { fmtNum } from '../util.js';

/* ===================== time left ===================== */
export function useNow(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
export function left(ms) {
  if (ms <= 0) return 'завершён';
  const s = Math.floor(ms / 1000); const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ===================== auctions ===================== */
const title = (a) => (a.kind === 'gift' ? `${a.userGift.gift.name} #${fmtNum(a.userGift.collectible.number)}` : `@${a.username}`);

function AuctionCard({ a, onOpen }) {
  const now = useNow();
  const ms = a.endsAt - now;
  return (
    <div className="market-card auction-card" onClick={onOpen}>
      {a.kind === 'gift' ? <GiftArt userGift={a.userGift} size="100%" height={140} rounded={0} /> : <div className="username-art">@{a.username}</div>}
      <span className={`auc-timer ${ms < 300_000 ? 'hot' : ''}`}><Timer size={12} /> {left(ms)}</span>
      <div className="market-card-body">
        <div className="bold ellipsis small">{title(a)}</div>
        <div className="tiny muted">{a.bids ? `${a.bids} ставок · лидер ${a.leader?.displayName}` : 'Ставок пока нет'}</div>
        <div className="auc-price">{a.bid ? 'Ставка' : 'Старт'} <Spark amount={a.bid || a.startPrice} /></div>
      </div>
    </div>
  );
}

export function AuctionDetails({ id, onBack }) {
  const me = useStore((s) => s.me);
  const [a, setA] = useState(null);
  const [amount, setAmount] = useState('');
  const [run, busy] = useAction();
  const now = useNow();
  const load = () => api(`/auctions/${id}`).then((r) => { setA(r.auction); setAmount((x) => (x && Number(x) >= r.auction.minNext ? x : String(r.auction.minNext))); });
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [id]);
  if (!a) return <Modal title="Аукцион" back={onBack}><div className="center" style={{ padding: 40 }}><Spinner /></div></Modal>;
  const ms = a.endsAt - now;
  const active = a.status === 'active' && ms > 0;
  const bid = () => run(async () => { setA((await api(`/auctions/${a.id}/bid`, { body: { amount: Number(amount) } })).auction); }, 'Ставка принята');
  const cancel = () => run(async () => { await api.del(`/auctions/${a.id}`); onBack(); }, 'Аукцион отменён');
  return (
    <Modal title="Аукцион" back={onBack}>
      <div className="col" style={{ gap: 12 }}>
        {a.kind === 'gift' ? <GiftArt userGift={a.userGift} size="100%" height={220} float /> : <div className="username-art" style={{ height: 140, borderRadius: 16 }}>@{a.username}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="bold" style={{ fontSize: '1.15em' }}>{title(a)}</div>
          <span className={`auc-timer static ${ms < 300_000 && active ? 'hot' : ''}`}><Timer size={13} /> {active ? left(ms) : a.status === 'sold' ? 'продан' : 'завершён'}</span>
        </div>
        <div className="auc-big">
          <div><small>{a.bid ? 'Текущая ставка' : 'Стартовая цена'}</small><b><Spark amount={a.bid || a.startPrice} /></b></div>
          {a.leader && <div className="row" style={{ gap: 8 }}><Avatar src={a.leader.avatar} name={a.leader.displayName} id={a.leader.id} size={30} /><span className="small">{a.leading ? 'Вы лидируете' : a.leader.displayName}</span></div>}
        </div>
        {active && !a.mine && !a.leading && (
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
            <button className="btn" disabled={busy || Number(amount) < a.minNext || me.balance < Number(amount)} onClick={bid}><Gavel size={16} /> Ставка</button>
          </div>
        )}
        {active && !a.mine && <div className="tiny muted">Минимальная ставка — {fmtNum(a.minNext)}. Сумма блокируется до конца аукциона; если вас перебьют, она сразу вернётся. Ставка в последние 2 минуты продлевает аукцион.</div>}
        {a.mine && active && !a.bids && <button className="btn danger-btn block" disabled={busy} onClick={cancel}>Отменить аукцион</button>}
        {a.history?.length > 0 && (
          <>
            <div className="section-title">Ставки</div>
            {a.history.map((h, i) => (
              <div key={i} className="row auc-hist" style={{ gap: 10 }}>
                <Avatar src={h.user?.avatar} name={h.user?.displayName} id={h.user?.id} size={28} />
                <span className="grow small">{h.user?.displayName}</span>
                <span className="tiny muted">{new Date(h.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
                <b className="small"><Spark amount={h.amount} /></b>
              </div>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}

export function AuctionsView({ mine, onOpen }) {
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); api(`/auctions${mine ? '?mine=1' : ''}`).then(setData).catch(() => setData({ auctions: [] })); }, [mine]);
  const setOpen = onOpen;
  if (!data) return <div className="center" style={{ padding: 40 }}><Spinner /></div>;
  if (!data.auctions.length) return <div className="muted center" style={{ padding: 40, flexDirection: 'column', gap: 6 }}><Gavel size={34} />Аукционов пока нет<div className="small">Выставьте коллекционный подарок или юзернейм — кнопка «аукцион» в карточке подарка</div></div>;
  return <div className="market-grid">{data.auctions.map((a) => <AuctionCard key={a.id} a={a} onOpen={() => setOpen(a.id)} />)}</div>;
}

export function AuctionCreateModal({ userGift, username }) {
  const close = useStore((s) => s.closeModal);
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState(24);
  const [run, busy] = useAction();
  const create = () => run(async () => {
    await api('/auctions', { body: userGift ? { kind: 'gift', userGiftId: userGift.id, startPrice: Number(price), hours } : { kind: 'username', username, startPrice: Number(price), hours } });
    close();
  }, 'Аукцион запущен 🔨');
  return (
    <Modal title="Аукцион" footer={<button className="btn block" disabled={busy || !Number(price)} onClick={create}><Gavel size={16} /> Запустить аукцион</button>}>
      <div className="col" style={{ gap: 12 }}>
        {userGift ? <GiftArt userGift={userGift} size="100%" height={170} /> : <div className="username-art" style={{ height: 110, borderRadius: 16 }}>@{username}</div>}
        <div className="field"><label>Стартовая цена</label><input className="input" inputMode="numeric" autoFocus value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} placeholder="Например, 500" /></div>
        <div className="field"><label>Длительность</label>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{[[1, '1 час'], [6, '6 часов'], [12, '12 часов'], [24, 'Сутки'], [72, '3 дня']].map(([h, l]) => <button key={h} className={`chip ${hours === h ? 'on' : ''}`} onClick={() => setHours(h)}>{l}</button>)}</div>
        </div>
        <div className="tiny muted">Покупатели делают ставки; победитель получает лот, вы — сумму ставки минус комиссия маркета. Отменить можно, пока нет ставок.</div>
      </div>
    </Modal>
  );
}

/* ===================== price chart ===================== */
export function PriceChart({ giftId }) {
  const [d, setD] = useState(null);
  useEffect(() => { setD(null); api(`/market/stats/${giftId}`).then(setD).catch(() => setD(null)); }, [giftId]);
  const path = useMemo(() => {
    if (!d?.series?.length) return null;
    const pts = d.series.length === 1 ? [d.series[0], d.series[0]] : d.series;
    const max = Math.max(...pts.map((p) => p.max)); const min = Math.min(...pts.map((p) => p.min));
    const W = 300; const H = 64; const span = max - min || 1;
    const xy = pts.map((p, i) => [(i / (pts.length - 1)) * W, H - 4 - ((p.avg - min) / span) * (H - 8)]);
    const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${W} ${H} L0 ${H} Z`, min, max };
  }, [d]);
  if (!d) return null;
  const up = (d.change || 0) >= 0;
  return (
    <div className="price-chart">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="tiny muted">Последняя продажа</div>
          <div className="bold" style={{ fontSize: '1.15em' }}>{d.last ? <Spark amount={d.last} /> : '—'}</div>
        </div>
        {d.change != null && <span className={`pc-change ${up ? 'up' : 'down'}`}>{up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{up ? '+' : ''}{d.change}% за 30 дн</span>}
        <div style={{ textAlign: 'right' }}><div className="tiny muted">Минимум сейчас</div><div className="bold">{d.floor ? <Spark amount={d.floor} /> : '—'}</div></div>
      </div>
      {path ? (
        <svg viewBox="0 0 300 64" preserveAspectRatio="none" className="pc-svg">
          <defs><linearGradient id="pcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".35" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
          <path d={path.area} fill="url(#pcg)" />
          <path d={path.line} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" className="pc-line" />
        </svg>
      ) : <div className="tiny muted" style={{ padding: '10px 0' }}>Продаж за 30 дней ещё не было</div>}
      <div className="tiny muted">{d.sales} {d.sales === 1 ? 'продажа' : 'продаж'} за 30 дней</div>
    </div>
  );
}

/* ===================== daily reward ===================== */
export function DailyModal() {
  const setMe = useStore((s) => s.setMe);
  const [d, setD] = useState(null);
  const [run, busy] = useAction();
  const [got, setGot] = useState(null);
  useEffect(() => { api('/daily').then(setD).catch(() => {}); }, []);
  const claim = () => run(async () => {
    const r = await api('/daily/claim', { body: {} });
    setD(r); setGot(r.amount);
    api('/auth/me').then((x) => setMe(x.user)).catch(() => {});
  });
  return (
    <Modal title="Ежедневная награда">
      {!d ? <div className="center" style={{ padding: 30 }}><Spinner /></div> : (
        <div className="col" style={{ gap: 14, alignItems: 'center' }}>
          <div className={`daily-hero ${got ? 'got' : ''}`}><CalendarCheck size={40} />{got && <span className="daily-plus">+{got}</span>}</div>
          <div style={{ textAlign: 'center' }}>
            <div className="bold" style={{ fontSize: '1.15em' }}>{d.streak ? `Серия: ${d.streak} ${d.streak === 1 ? 'день' : d.streak < 5 ? 'дня' : 'дней'} подряд` : 'Заходите каждый день'}</div>
            <div className="small muted">Чем дольше серия, тем больше награда. Пропуск дня обнуляет серию.</div>
          </div>
          <div className="daily-days">
            {d.rewards.map((v, i) => {
              const done = d.claimedToday ? i < ((d.streak - 1) % d.rewards.length) + 1 : i < d.streak % d.rewards.length;
              const next = !d.claimedToday && i === d.streak % d.rewards.length;
              return (
                <div key={i} className={`daily-day ${done ? 'done' : ''} ${next ? 'next' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
                  <small>День {i + 1}</small>
                  {done ? <Check size={18} /> : <Spark amount={v} />}
                </div>
              );
            })}
          </div>
          <button className="btn block" disabled={busy || !d.canClaim} onClick={claim}>{d.canClaim ? <>Забрать <Spark amount={d.nextReward} /></> : 'Получено — приходите завтра'}</button>
        </div>
      )}
    </Modal>
  );
}

/* ===================== craft ===================== */
export const CRAFT_N = 5;
/** Find CRAFT_N regular copies of the same gift the user owns (not on sale). */
export async function findCraftSet(meId, giftId) {
  const { gifts } = await api(`/users/${meId}/gifts`);
  return gifts.filter((g) => !g.collectible && g.gift.id === giftId && !g.listing).slice(0, CRAFT_N);
}

export function SeasonBadge({ gift }) {
  const now = useNow(30_000);
  if (!gift?.saleUntil) return null;
  const ms = gift.saleUntil - now;
  return <span className={`season-badge ${ms <= 0 ? 'ended' : ''}`}>{ms > 0 ? `⏳ ${left(ms)}` : 'продажи завершены'}</span>;
}
