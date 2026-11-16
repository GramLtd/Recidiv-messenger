import { useState } from 'react';
import { Sparkles, Send, Tag, EyeOff, Eye, Repeat, Pin, ArrowUpCircle, Info, Search } from 'lucide-react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Avatar, Modal, Spark, Switch, Spinner, useAsync, useAction, Verified } from './common.jsx';
import { GiftArt, CollectibleArt } from './GiftArt.jsx';
import { UserPicker } from './NewChat.jsx';
import { fmtNum } from '../util.js';

function SupplyBar({ gift }) {
  if (!gift.limited) return null;
  const pct = Math.min(100, (gift.sold / gift.supply) * 100);
  return (
    <div style={{ width: '100%' }}>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-3)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
      </div>
      <div className="tiny muted" style={{ marginTop: 3, textAlign: 'center' }}>{gift.remaining ? `осталось ${fmtNum(gift.remaining)} из ${fmtNum(gift.supply)}` : 'распродано'}</div>
    </div>
  );
}

/** Gift catalogue → pick a gift → choose recipient / message / anonymity → buy. */
export function GiftShopModal({ toUser: initialTo }) {
  const me = useStore((s) => s.me);
  const closeAll = useStore((s) => s.closeAllModals);
  const openModal = useStore((s) => s.openModal);
  const { data, loading, reload } = useAsync(() => api('/gifts'), []);
  const [filter, setFilter] = useState('all');
  const [picked, setPicked] = useState(null);
  const [to, setTo] = useState(initialTo || null);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [run, busy] = useAction();

  if (choosing) {
    return (
      <Modal title="Кому отправить?" back={() => setChoosing(false)}>
        <div className="list-item" onClick={() => { setTo(me); setChoosing(false); }}>
          <Avatar src={me.avatar} name={me.displayName} id={me.id} size={44} />
          <div className="bold">Себе</div>
        </div>
        <UserPicker single onToggle={(u) => { setTo(u); setChoosing(false); }} />
      </Modal>
    );
  }

  if (picked) {
    const recipient = to || me;
    const buy = () =>
      run(async () => {
        await api(`/gifts/${picked.id}/buy`, { body: { toUserId: recipient.id, message, anonymous } });
        closeAll();
      }, recipient.id === me.id ? 'Подарок добавлен в профиль 🎁' : `Подарок отправлен ${recipient.displayName} 🎁`);
    return (
      <Modal
        title="Отправить подарок"
        back={() => setPicked(null)}
        footer={
          <button className="btn block" disabled={busy || picked.remaining === 0 || me.balance < picked.price} onClick={buy}>
            {me.balance < picked.price ? 'Недостаточно средств' : <>Отправить за <Spark amount={picked.price} /></>}
          </button>
        }
      >
        <div className="col" style={{ alignItems: 'center', gap: 12 }}>
          <div className="card center" style={{ width: '100%', flexDirection: 'column', gap: 8, background: 'radial-gradient(circle at 50% 30%, rgba(var(--accent-rgb), .25), transparent 70%), var(--bg-2)' }}>
            <GiftArt gift={picked} size={130} />
            <div className="bold" style={{ fontSize: '1.15em' }}>{picked.name}</div>
            <SupplyBar gift={picked} />
          </div>
          <div className="list-item" style={{ width: '100%', background: 'var(--bg-2)' }} onClick={() => setChoosing(true)}>
            <Avatar src={recipient.avatar} name={recipient.displayName} id={recipient.id} size={40} />
            <div className="grow"><div className="small muted">Получатель</div><div className="bold">{recipient.id === me.id ? 'Себе' : recipient.displayName}</div></div>
            <span className="accent small">Изменить</span>
          </div>
          <textarea className="input" placeholder="Сообщение (необязательно)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={255} style={{ minHeight: 70 }} />
          {recipient.id !== me.id && (
            <div className="row" style={{ width: '100%' }}>
              <div className="grow"><div>Анонимно</div><div className="small muted">Получатель не увидит отправителя</div></div>
              <Switch on={anonymous} onChange={setAnonymous} />
            </div>
          )}
          <div className="small muted" style={{ textAlign: 'center' }}>
            {picked.upgradable ? <>Получатель сможет улучшить подарок до коллекционного за <Spark amount={picked.upgradePrice} /> или конвертировать в <Spark amount={picked.convertValue} />.</> : <>Получатель сможет конвертировать подарок в <Spark amount={picked.convertValue} />.</>}
          </div>
        </div>
      </Modal>
    );
  }

  const gifts = (data?.gifts || []).filter((g) => filter === 'all' || (filter === 'limited' ? g.limited : !g.limited));
  return (
    <Modal title="Подарки" wide headExtra={<span className="chip" onClick={() => openModal('wallet')}><Spark amount={me.balance} /></span>}>
      {initialTo && <div className="small muted" style={{ marginBottom: 10 }}>Подарок для <b style={{ color: 'var(--text)' }}>{initialTo.displayName}</b></div>}
      <div className="row" style={{ gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {[['all', 'Все'], ['limited', 'Лимитированные'], ['regular', 'Обычные']].map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <span className="spacer" />
        <button className="chip" onClick={() => openModal('market', { kind: 'gift' })}><Tag size={14} /> Маркет</button>
      </div>
      {loading ? <div className="center" style={{ padding: 40 }}><Spinner /></div> : (
        <div className="gift-grid">
          {gifts.map((g) => (
            <div key={g.id} className={`gift-tile ${g.remaining === 0 ? 'sold-out' : ''}`} onClick={() => (g.remaining === 0 ? openModal('market', { kind: 'gift', giftId: g.id }) : setPicked(g))}>
              {g.limited && <span className="ribbon">{g.remaining === 0 ? 'sold' : 'limited'}</span>}
              <GiftArt gift={g} size={72} />
              <div className="small bold ellipsis" style={{ maxWidth: '100%' }}>{g.name}</div>
              <span className="price"><Spark amount={g.price} /></span>
              <SupplyBar gift={g} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function rarityPct(r, total) {
  return `${Math.round((r / total) * 1000) / 10}%`;
}

function AttributeTable({ ug, attrs }) {
  const col = ug.collectible;
  const totals = attrs && {
    model: attrs.models.reduce((s, x) => s + x.rarity, 0),
    backdrop: attrs.backdrops.reduce((s, x) => s + x.rarity, 0),
    symbol: attrs.symbols.reduce((s, x) => s + x.rarity, 0),
  };
  return (
    <table className="attr-table">
      <tbody>
        <tr><td>Владелец</td><td>{ug.owner ? <span className="row" style={{ gap: 6, display: 'inline-flex' }}><Avatar src={ug.owner.avatar} name={ug.owner.displayName} id={ug.owner.id} size={22} />{ug.owner.displayName}{ug.owner.verified && <Verified size={14} />}</span> : '—'}</td></tr>
        <tr><td>Модель</td><td>{col.model.name}{totals && <span className="rarity-tag">{rarityPct(col.model.rarity, totals.model)}</span>}</td></tr>
        <tr><td>Фон</td><td><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, background: col.backdrop.center, marginRight: 6, verticalAlign: -1 }} />{col.backdrop.name}{totals && <span className="rarity-tag">{rarityPct(col.backdrop.rarity, totals.backdrop)}</span>}</td></tr>
        <tr><td>Узор</td><td>{col.symbol.emoji} {col.symbol.name}{totals && <span className="rarity-tag">{rarityPct(col.symbol.rarity, totals.symbol)}</span>}</td></tr>
        <tr><td>Тираж</td><td>#{fmtNum(col.number)}{ug.gift.supply ? ` из ${fmtNum(ug.gift.supply)}` : ''}</td></tr>
      </tbody>
    </table>
  );
}

export function GiftDetailsModal({ userGiftId }) {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const close = useStore((s) => s.closeModal);
  const { data, loading, setData } = useAsync(() => api(`/user-gifts/${userGiftId}`), [userGiftId]);
  const ug = data?.userGift;
  const attrs = useAsync(() => (ug?.gift.upgradable ? api(`/gifts/${ug.gift.id}/attributes`) : Promise.resolve(null)), [ug?.gift.id]);
  const [run, busy] = useAction();
  const [revealing, setRevealing] = useState(false);

  if (loading || !ug) return <Modal title="Подарок"><div className="center" style={{ padding: 40 }}><Spinner /></div></Modal>;
  const mine = ug.owner?.id === me.id;
  const col = ug.collectible;

  const upgrade = () =>
    run(async () => {
      setRevealing(true);
      const r = await api(`/user-gifts/${ug.id}/upgrade`, { body: {} });
      await new Promise((res) => setTimeout(res, 1200));
      setData({ userGift: r.userGift });
      setRevealing(false);
    }).finally(() => setRevealing(false));
  const convert = () => {
    if (!confirm(`Конвертировать подарок в ${ug.gift.convertValue} ✦? Подарок исчезнет из профиля.`)) return;
    run(async () => { await api(`/user-gifts/${ug.id}/convert`, { body: {} }); close(); }, 'Подарок конвертирован');
  };
  const visibility = (body) => run(async () => setData({ userGift: (await api(`/user-gifts/${ug.id}/visibility`, { body })).userGift }));
  const unlist = () => run(async () => { await api.del(`/market/listings/${ug.listing.id}`); setData({ userGift: { ...ug, listing: null } }); }, 'Снято с продажи');

  return (
    <Modal title={null}>
      <div style={{ margin: '-4px -18px 0' }}>
        {col ? (
          <div style={{ position: 'relative' }}>
            <CollectibleArt col={col} size="100%" height={300} rounded={0} />
            <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,.6)' }}>
              <div style={{ fontSize: '1.4em', fontWeight: 800 }}>{ug.gift.name}</div>
              <div className="small" style={{ opacity: 0.85 }}>Коллекционный #{fmtNum(col.number)}</div>
            </div>
            <button className="icon-btn" style={{ position: 'absolute', top: 8, right: 8, color: '#fff', background: 'rgba(0,0,0,.3)' }} onClick={close}>✕</button>
          </div>
        ) : (
          <div style={{ position: 'relative', padding: '30px 0 14px', textAlign: 'center', background: 'radial-gradient(circle at 50% 40%, rgba(var(--accent-rgb), .35), transparent 70%)' }}>
            <button className="icon-btn" style={{ position: 'absolute', top: 8, right: 8 }} onClick={close}>✕</button>
            <div style={{ animation: revealing ? 'spin 0.6s linear infinite' : undefined, display: 'inline-block' }}><GiftArt userGift={ug} size={140} /></div>
            <div style={{ fontSize: '1.3em', fontWeight: 800, marginTop: 6 }}>{ug.gift.name}</div>
            {ug.gift.limited && <div className="small muted">Лимитированный · тираж {fmtNum(ug.gift.supply)}</div>}
          </div>
        )}
      </div>

      <div className="col" style={{ marginTop: 14, gap: 12 }}>
        {!col && (
          <table className="attr-table">
            <tbody>
              <tr><td>От</td><td>{ug.sender ? <span className="row" style={{ display: 'inline-flex', gap: 6 }}><Avatar src={ug.sender.avatar} name={ug.sender.displayName} id={ug.sender.id} size={22} />{ug.sender.displayName}</span> : 'Аноним'}</td></tr>
              <tr><td>Дата</td><td>{new Date(ug.createdAt).toLocaleString('ru-RU')}</td></tr>
              <tr><td>Стоимость</td><td><Spark amount={ug.gift.price} /></td></tr>
              {ug.gift.limited && <tr><td>Доступно</td><td>{fmtNum(ug.gift.remaining)} из {fmtNum(ug.gift.supply)}</td></tr>}
            </tbody>
          </table>
        )}
        {col && <AttributeTable ug={ug} attrs={attrs.data} />}
        {ug.message && <div className="card small" style={{ fontStyle: 'italic' }}>«{ug.message}»</div>}

        {mine && !col && ug.gift.upgradable && attrs.data && (
          <div className="card col" style={{ gap: 10 }}>
            <div className="row bold"><Sparkles size={18} className="accent" /> Улучшить до коллекционного</div>
            <div className="small muted">Подарок получит уникальный номер, случайную модель, фон и узор. Его можно будет продать на маркете или передать.</div>
            <div className="upgrade-preview">
              {attrs.data.models.slice(0, 3).map((m, i) => (
                <CollectibleArt key={m.id} col={{ model: m, backdrop: attrs.data.backdrops[(i * 5) % attrs.data.backdrops.length], symbol: attrs.data.symbols[(i * 7) % attrs.data.symbols.length] }} size="100%" height={90} rounded={12} />
              ))}
            </div>
            <div className="tiny muted">Моделей: {attrs.data.models.length} · фонов: {attrs.data.backdrops.length} · узоров: {attrs.data.symbols.length}</div>
          </div>
        )}

        {mine && (
          <div className="col" style={{ gap: 8 }}>
            {!col && ug.gift.upgradable && (
              <button className="btn block" disabled={busy} onClick={upgrade}><ArrowUpCircle size={18} /> Улучшить за <Spark amount={ug.gift.upgradePrice} /></button>
            )}
            {col && !ug.listing && (
              <div className="row">
                <button className="btn grow" onClick={() => openModal('sell', { userGift: ug, onDone: (l) => setData({ userGift: { ...ug, listing: l } }) })}><Tag size={18} /> Продать</button>
                <button className="btn secondary grow" onClick={() => openModal('transferGift', { userGift: ug })}><Send size={18} /> Передать</button>
              </div>
            )}
            {col && ug.listing && (
              <div className="card row">
                <div className="grow">На маркете за <Spark amount={ug.listing.price} /></div>
                <button className="btn sm secondary" disabled={busy} onClick={unlist}>Снять</button>
              </div>
            )}
            <div className="row">
              <button className="btn secondary sm grow" onClick={() => visibility({ hidden: !ug.hidden })}>{ug.hidden ? <><Eye size={16} /> Показать в профиле</> : <><EyeOff size={16} /> Скрыть из профиля</>}</button>
              <button className="btn secondary sm grow" onClick={() => visibility({ pinned: !ug.pinned })}><Pin size={16} /> {ug.pinned ? 'Открепить' : 'Закрепить'}</button>
            </div>
            {!col && <button className="btn ghost sm" disabled={busy} onClick={convert}><Repeat size={16} /> Конвертировать в <Spark amount={ug.gift.convertValue} /></button>}
          </div>
        )}
        {!mine && ug.listing && (
          <button className="btn block" onClick={() => openModal('market', { kind: 'gift', q: String(col?.number || '') })}>Купить на маркете за <Spark amount={ug.listing.price} /></button>
        )}
      </div>
    </Modal>
  );
}

export function TransferGiftModal({ userGift }) {
  const closeAll = useStore((s) => s.closeAllModals);
  const [run] = useAction();
  return (
    <Modal title={`Передать ${userGift.gift.name} #${userGift.collectible.number}`}>
      <div className="small muted" style={{ marginBottom: 10 }}><Info size={14} style={{ verticalAlign: -2 }} /> Передача бесплатна и необратима.</div>
      <UserPicker single onToggle={(u) => confirm(`Передать подарок ${u.displayName}?`) && run(async () => { await api(`/user-gifts/${userGift.id}/transfer`, { body: { toUserId: u.id } }); closeAll(); }, 'Подарок передан')} />
    </Modal>
  );
}

export function SellModal({ userGift, username, onDone }) {
  const close = useStore((s) => s.closeModal);
  const { data } = useAsync(() => api('/config/public'), []);
  const [price, setPrice] = useState('');
  const [run, busy] = useAction();
  const fee = data ? Math.floor((Number(price || 0) * data.marketFeePercent) / 100) : 0;
  const submit = () =>
    run(async () => {
      const r = await api('/market/listings', { body: userGift ? { kind: 'gift', userGiftId: userGift.id, price: Number(price) } : { kind: 'username', username, price: Number(price) } });
      onDone?.(r.listing);
      close();
    }, 'Выставлено на маркет');
  return (
    <Modal title="Продать на маркете" footer={<button className="btn block" disabled={busy || !(Number(price) > 0)} onClick={submit}>Выставить</button>}>
      <div className="col" style={{ alignItems: 'center', gap: 12 }}>
        {userGift ? <GiftArt userGift={userGift} size={120} /> : <div className="username-art" style={{ width: '100%', borderRadius: 14 }}>@{username}</div>}
        <div className="bold">{userGift ? `${userGift.gift.name} #${userGift.collectible.number}` : `@${username}`}</div>
        <input className="input" style={{ textAlign: 'center', fontSize: '1.5em', fontWeight: 700, height: 60 }} inputMode="numeric" placeholder="Цена" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} autoFocus />
        {data && Number(price) > 0 && (
          <div className="small muted">Комиссия {data.marketFeePercent}%: <Spark amount={fee} /> · вы получите <Spark amount={Number(price) - fee} /></div>
        )}
      </div>
    </Modal>
  );
}

export { Search };
