import { useEffect, useState } from 'react';
import { Search, Tag, History, AtSign, Gift } from 'lucide-react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Avatar, Modal, Spark, Spinner, useAction } from './common.jsx';
import { GiftArt } from './GiftArt.jsx';
import { fmtNum } from '../util.js';

function ListingCard({ l, onOpen }) {
  return (
    <div className="market-card" onClick={() => onOpen(l)}>
      {l.kind === 'gift' ? <GiftArt userGift={l.userGift} size="100%" height={140} rounded={0} /> : <div className="username-art">@{l.username}</div>}
      <div className="body">
        <div className="bold small ellipsis">{l.kind === 'gift' ? `${l.userGift.gift.name} #${fmtNum(l.userGift.collectible.number)}` : `@${l.username}`}</div>
        {l.kind === 'gift' && <div className="tiny muted ellipsis">{l.userGift.collectible.model.name} · {l.userGift.collectible.backdrop.name}</div>}
        <span className="btn sm" style={{ pointerEvents: 'none' }}>{l.mine ? 'Ваш лот · ' : ''}<Spark amount={l.price} /></span>
      </div>
    </div>
  );
}

function ListingDetails({ l, onBack, onChanged }) {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const [run, busy] = useAction();
  const [price, setPrice] = useState(String(l.price));
  const buy = () => {
    if (!confirm(`Купить ${l.kind === 'gift' ? `«${l.userGift.gift.name}» #${l.userGift.collectible.number}` : `@${l.username}`} за ${l.price} ✦?`)) return;
    run(async () => { await api(`/market/listings/${l.id}/buy`, { body: { expectedPrice: l.price } }); onChanged(); }, 'Покупка совершена 🎉');
  };
  const cancel = () => run(async () => { await api.del(`/market/listings/${l.id}`); onChanged(); }, 'Лот снят');
  const reprice = () => run(async () => { await api.patch(`/market/listings/${l.id}`, { price: Number(price) }); onChanged(); }, 'Цена обновлена');
  return (
    <Modal title="Лот" back={onBack}>
      <div className="col" style={{ gap: 12 }}>
        {l.kind === 'gift' ? (
          <div style={{ cursor: 'pointer' }} onClick={() => openModal('giftDetails', { userGiftId: l.userGift.id })}><GiftArt userGift={l.userGift} size="100%" height={240} /></div>
        ) : (
          <div className="username-art" style={{ height: 180, borderRadius: 16, fontSize: '1.6em' }}>@{l.username}</div>
        )}
        <div className="bold" style={{ fontSize: '1.2em' }}>{l.kind === 'gift' ? `${l.userGift.gift.name} #${fmtNum(l.userGift.collectible.number)}` : `@${l.username}`}</div>
        {l.kind === 'gift' && (
          <table className="attr-table"><tbody>
            <tr><td>Модель</td><td>{l.userGift.collectible.model.name}</td></tr>
            <tr><td>Фон</td><td>{l.userGift.collectible.backdrop.name}</td></tr>
            <tr><td>Узор</td><td>{l.userGift.collectible.symbol.emoji} {l.userGift.collectible.symbol.name}</td></tr>
          </tbody></table>
        )}
        {l.kind === 'username' && <div className="small muted">Коллекционный юзернейм. После покупки он перейдёт в ваш аккаунт, и вы сможете сделать его основным.</div>}
        <div className="row"><Avatar src={l.seller.avatar} name={l.seller.displayName} id={l.seller.id} size={32} /><div className="grow small">Продавец: <b>{l.seller.displayName}</b></div></div>
        {l.mine ? (
          <>
            <div className="row">
              <input className="input grow" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
              <button className="btn secondary" disabled={busy} onClick={reprice}>Изменить цену</button>
            </div>
            <button className="btn danger-btn block" disabled={busy} onClick={cancel}>Снять с продажи</button>
          </>
        ) : (
          <button className="btn block" disabled={busy || me.balance < l.price} onClick={buy}>
            {me.balance < l.price ? <>Не хватает <Spark amount={l.price - me.balance} /></> : <>Купить за <Spark amount={l.price} /></>}
          </button>
        )}
      </div>
    </Modal>
  );
}

export function MarketModal({ kind: initialKind = '', giftId: initialGiftId, q: initialQ = '' }) {
  const openModal = useStore((s) => s.openModal);
  const me = useStore((s) => s.me);
  const [kind, setKind] = useState(initialKind);
  const [sort, setSort] = useState('new');
  const [q, setQ] = useState(initialQ);
  const [giftId, setGiftId] = useState(initialGiftId || null);
  const [view, setView] = useState('all'); // all | mine | history
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setData(null);
    const t = setTimeout(() => {
      const url = view === 'history' ? '/market/history' : `/market?kind=${kind}&sort=${sort}&q=${encodeURIComponent(q)}${giftId ? `&giftId=${giftId}` : ''}${view === 'mine' ? '&mine=1' : ''}`;
      api(url).then(setData).catch(() => setData({ listings: [] }));
    }, 200);
    return () => clearTimeout(t);
  }, [kind, sort, q, giftId, view, tick]);

  if (selected) return <ListingDetails l={selected} onBack={() => setSelected(null)} onChanged={() => { setSelected(null); setTick((x) => x + 1); }} />;

  return (
    <Modal title="Маркет" wide="x" headExtra={<span className="chip"><Spark amount={me.balance} /></span>}>
      <div className="tabs">
        <button className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>Все лоты</button>
        <button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}><Tag size={14} style={{ verticalAlign: -2 }} /> Мои</button>
        <button className={view === 'history' ? 'on' : ''} onClick={() => setView('history')}><History size={14} style={{ verticalAlign: -2 }} /> История</button>
      </div>
      {view !== 'history' && (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <div className="search-box" style={{ minWidth: 200 }}><Search size={18} /><input placeholder="Название, @username или номер" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className="input" style={{ width: 170, height: 42 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">Сначала новые</option>
            <option value="price_asc">Дешевле</option>
            <option value="price_desc">Дороже</option>
            <option value="number">По номеру</option>
          </select>
        </div>
      )}
      {view !== 'history' && (
        <div className="row" style={{ gap: 6, marginBottom: 12, overflowX: 'auto', paddingBottom: 4 }}>
          <button className={`chip ${!kind && !giftId ? 'on' : ''}`} onClick={() => { setKind(''); setGiftId(null); }}>Все</button>
          <button className={`chip ${kind === 'gift' && !giftId ? 'on' : ''}`} onClick={() => { setKind('gift'); setGiftId(null); }}><Gift size={14} /> Подарки</button>
          <button className={`chip ${kind === 'username' ? 'on' : ''}`} onClick={() => { setKind('username'); setGiftId(null); }}><AtSign size={14} /> Юзернеймы</button>
          {data?.collections?.map((c) => (
            <button key={c.id} className={`chip ${giftId === c.id ? 'on' : ''}`} onClick={() => { setKind('gift'); setGiftId(c.id); }}>
              {c.emoji} {c.name} · от {fmtNum(c.floor)}
            </button>
          ))}
        </div>
      )}
      {view === 'mine' && (
        <div className="row" style={{ marginBottom: 12, gap: 8 }}>
          <button className="btn sm secondary" onClick={() => openModal('userProfile', { userId: me.id })}><Gift size={15} /> Выставить подарок</button>
          <button className="btn sm secondary" onClick={() => openModal('settings', { tab: 'usernames' })}><AtSign size={15} /> Выставить юзернейм</button>
        </div>
      )}
      {!data ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : data.listings.length === 0 ? (
        <div className="muted center" style={{ padding: 40, flexDirection: 'column', gap: 6 }}>Лотов нет<div className="small">Улучшите подарок до коллекционного и выставьте его на продажу</div></div>
      ) : view === 'history' ? (
        data.listings.map((l) => (
          <div key={l.id} className="tx-row">
            {l.kind === 'gift' ? <GiftArt userGift={l.userGift} size={44} rounded={10} /> : <AtSign size={28} className="accent" />}
            <div className="grow">
              <div className="bold small">{l.kind === 'gift' ? `${l.userGift.gift.name} #${l.userGift.collectible?.number}` : `@${l.username}`}</div>
              <div className="tiny muted">{l.mine ? `Продано ${l.buyer?.displayName}` : `Куплено у ${l.seller.displayName}`} · {new Date(l.closedAt).toLocaleString('ru-RU')}</div>
            </div>
            <div className={`amt ${l.mine ? 'plus' : ''}`}>{l.mine ? '+' : '−'}{fmtNum(l.price)}</div>
          </div>
        ))
      ) : (
        <div className="market-grid">{data.listings.map((l) => <ListingCard key={l.id} l={l} onOpen={setSelected} />)}</div>
      )}
      {data?.feePercent !== undefined && view !== 'history' && <div className="tiny muted center" style={{ marginTop: 14 }}>Комиссия маркета — {data.feePercent}% с продавца</div>}
    </Modal>
  );
}
