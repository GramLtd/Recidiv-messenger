import { useEffect, useState } from 'react';
import { Sparkles, Send, Tag, EyeOff, Eye, Repeat, Pin, ArrowUpCircle, Info, Search, X, Link2, Gem, Crown } from 'lucide-react';
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
          <div className="card center gift-hero-card" style={{ width: '100%', flexDirection: 'column', gap: 8 }}>
            <GiftArt gift={picked} size={170} animated />
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
        <div className="gift-cards">
          {gifts.map((g, i) => (
            <div key={g.id} className={`gift-card shop ${g.remaining === 0 ? 'sold-out' : ''}`} style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }} onClick={() => (g.remaining === 0 ? openModal('market', { kind: 'gift', giftId: g.id }) : setPicked(g))}>
              {g.limited && <span className="ribbon">{g.remaining === 0 ? 'sold' : 'limited'}</span>}
              <div className="gift-card-art"><GiftArt gift={g} size="74%" height="74%" /></div>
              <div className="gift-card-name ellipsis">{g.name}</div>
              <span className="price"><Spark amount={g.price} /></span>
              {g.limited && <div className="tiny muted" style={{ marginTop: 2 }}>{g.remaining ? `${fmtNum(g.remaining)} из ${fmtNum(g.supply)}` : 'распродано'}</div>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function Chance({ v }) {
  return v != null ? <span className="rarity-tag">{v}%</span> : null;
}

function UpgradePreview({ attrs }) {
  // Cycle through possible looks so the user sees what the upgrade can give.
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => x + 1), 1400);
    return () => clearInterval(t);
  }, []);
  const m = attrs.models[i % attrs.models.length];
  const col = {
    model: { ...m, image: attrs.gift.image, animation: attrs.gift.animation },
    backdrop: attrs.backdrops[(i * 7) % attrs.backdrops.length],
    symbol: attrs.symbols[(i * 5) % attrs.symbols.length],
  };
  return (
    <div className="col" style={{ gap: 6 }}>
      <CollectibleArt key={i} col={col} size="100%" height={150} rounded={16} style={{ animation: 'fadeSwap .5s' }} />
      <div className="tiny muted center">{m.name} · {col.backdrop.name} · {col.symbol.emoji} {col.symbol.name}</div>
    </div>
  );
}

export function GiftDetailsModal({ userGiftId }) {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const openModal = useStore((s) => s.openModal);
  const close = useStore((s) => s.closeModal);
  const toast = useStore((s) => s.toast);
  const { data, loading, setData } = useAsync(() => api(`/user-gifts/${userGiftId}`), [userGiftId]);
  const ug = data?.userGift;
  const attrs = useAsync(() => (ug?.gift.upgradable && !ug.collectible ? api(`/gifts/${ug.gift.id}/attributes`) : Promise.resolve(null)), [ug?.gift.id, !!ug?.collectible]);
  const [run, busy] = useAction();
  const [revealing, setRevealing] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState(false);

  if (loading || !ug) return <Modal title="Подарок"><div className="center" style={{ padding: 40 }}><Spinner /></div></Modal>;
  const mine = ug.owner?.id === me.id;
  const col = ug.collectible;

  const upgrade = () =>
    run(async () => {
      setRevealing(true);
      const [r] = await Promise.all([api(`/user-gifts/${ug.id}/upgrade`, { body: {} }), new Promise((res) => setTimeout(res, 1600))]);
      setData({ userGift: r.userGift });
      setJustUpgraded(true);
      document.querySelector('.gift-modal .modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
    }).finally(() => setRevealing(false));
  const convert = () => {
    if (!confirm(`Конвертировать подарок в ${ug.gift.convertValue} ✦? Подарок исчезнет из профиля.`)) return;
    run(async () => { await api(`/user-gifts/${ug.id}/convert`, { body: {} }); close(); }, 'Подарок конвертирован');
  };
  const visibility = (body) => run(async () => setData({ userGift: (await api(`/user-gifts/${ug.id}/visibility`, { body })).userGift }));
  const wear = () =>
    run(async () => {
      const r = await api(`/user-gifts/${ug.id}/wear`, { body: { wear: !ug.worn } });
      setData({ userGift: r.userGift });
      const { user } = await api('/auth/me');
      setMe(user);
    }, ug.worn ? 'Подарок снят' : 'Подарок надет — он виден рядом с вашим именем');
  const unlist = () => run(async () => { await api.del(`/market/listings/${ug.listing.id}`); setData({ userGift: { ...ug, listing: null } }); }, 'Снято с продажи');
  const copyLink = () => { navigator.clipboard?.writeText(`${location.origin}/gift/${col?.slug || ug.id}`); toast('Ссылка скопирована'); };

  const top = (
    <div className="hero-top">
      <button className="glass-icon" onClick={close}><X size={20} /></button>
      <span className="spacer" />
      {col && <button className="glass-icon" onClick={copyLink}><Link2 size={18} /></button>}
      {mine && <button className="glass-icon" onClick={() => visibility({ pinned: !ug.pinned })} title={ug.pinned ? 'Открепить' : 'Закрепить'}><Pin size={18} className={ug.pinned ? 'accent' : ''} /></button>}
      {mine && <button className="glass-icon" onClick={() => visibility({ hidden: !ug.hidden })} title={ug.hidden ? 'Показать в профиле' : 'Скрыть из профиля'}>{ug.hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
    </div>
  );

  return (
    <Modal title={null} className="gift-modal">
      <div style={{ margin: '-4px -18px 0', position: 'relative' }}>
        {col ? (
          <CollectibleArt col={col} size="100%" height={340} rounded={0} animated tilt style={justUpgraded ? { animation: 'reveal .9s cubic-bezier(.2,.8,.2,1)' } : undefined}>
            <div className="hero-caption">
              <div className="hero-name">{ug.gift.name}</div>
              <div className="hero-sub">Коллекционный · #{fmtNum(col.number)}</div>
            </div>
          </CollectibleArt>
        ) : (
          <div className="plain-hero">
            <div className={revealing ? 'revealing' : ''}><GiftArt userGift={ug} size={190} animated /></div>
            <div className="hero-name" style={{ color: 'var(--text)', textShadow: 'none' }}>{ug.gift.name}</div>
            <div className="hero-sub muted" style={{ textShadow: 'none' }}>{ug.gift.limited ? `Лимитированный · тираж ${fmtNum(ug.gift.supply)}` : 'Подарок'}</div>
          </div>
        )}
        {top}
      </div>

      <div className="col" style={{ marginTop: 14, gap: 12 }}>
        {mine && col && (
          <div className="gift-actions">
            <button disabled={!!ug.listing} onClick={() => openModal('transferGift', { userGift: ug })}><Gem size={22} />Передать</button>
            <button className={ug.worn ? 'on' : ''} onClick={wear} disabled={busy}><Crown size={22} />{ug.worn ? 'Снять' : 'Надеть'}</button>
            {ug.listing ? (
              <button onClick={unlist} disabled={busy}><Tag size={22} />Снять с продажи</button>
            ) : (
              <button onClick={() => openModal('sell', { userGift: ug, onDone: (l) => setData({ userGift: { ...ug, listing: l } }) })}><Tag size={22} />Продать</button>
            )}
          </div>
        )}

        <div className="info-table">
          {col ? (
            <>
              <div><span>Владелец</span><b className="row" style={{ gap: 6 }}>{ug.owner && <><Avatar src={ug.owner.avatar} name={ug.owner.displayName} id={ug.owner.id} size={22} /><span className="accent ellipsis">{ug.owner.displayName}</span></>}</b></div>
              <div><span>Выпущено</span><b>{fmtNum(col.issued)} из {ug.gift.supply ? fmtNum(ug.gift.supply) : '∞'}</b></div>
              <div><span>Модель</span><b>{col.model?.name}<Chance v={col.model?.chance} /></b></div>
              <div><span>Узор</span><b>{col.symbol?.name}<Chance v={col.symbol?.chance} /></b></div>
              <div><span>Фон</span><b><i className="dot" style={{ background: col.backdrop?.center }} />{col.backdrop?.name}<Chance v={col.backdrop?.chance} /></b></div>
              <div><span>Оценка</span><b><Spark amount={col.estimate} /></b></div>
              {ug.listing && <div><span>На маркете</span><b><Spark amount={ug.listing.price} /></b></div>}
            </>
          ) : (
            <>
              <div><span>От</span><b className="row" style={{ gap: 6 }}>{ug.sender ? <><Avatar src={ug.sender.avatar} name={ug.sender.displayName} id={ug.sender.id} size={22} />{ug.sender.displayName}</> : 'Аноним'}</b></div>
              <div><span>Дата</span><b>{new Date(ug.createdAt).toLocaleString('ru-RU')}</b></div>
              <div><span>Стоимость</span><b><Spark amount={ug.gift.price} /></b></div>
              {ug.gift.limited && <div><span>Доступно</span><b>{fmtNum(ug.gift.remaining)} из {fmtNum(ug.gift.supply)}</b></div>}
            </>
          )}
        </div>
        {ug.message && <div className="card small" style={{ fontStyle: 'italic' }}>«{ug.message}»</div>}

        {mine && !col && ug.gift.upgradable && attrs.data && (
          <div className="card col" style={{ gap: 10 }}>
            <div className="row bold"><Sparkles size={18} className="accent" /> Улучшить до коллекционного</div>
            <div className="small muted">Подарок получит уникальный номер и случайные модель, фон и узор. Его можно будет надеть, продать на маркете или передать.</div>
            <UpgradePreview attrs={attrs.data} />
          </div>
        )}

        {mine && !col && (
          <div className="col" style={{ gap: 8 }}>
            {ug.gift.upgradable && (
              <button className="btn block shimmer" disabled={busy} onClick={upgrade}><ArrowUpCircle size={18} /> {revealing ? 'Улучшаем…' : <>Улучшить за <Spark amount={ug.gift.upgradePrice} /></>}</button>
            )}
            <button className="btn ghost sm" disabled={busy} onClick={convert}><Repeat size={16} /> Конвертировать в <Spark amount={ug.gift.convertValue} /></button>
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
