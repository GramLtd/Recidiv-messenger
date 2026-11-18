import { useEffect, useRef, useState } from 'react';
import { UpgradeReveal } from './UpgradeReveal.jsx';
import { SeasonBadge, findCraftSet, CRAFT_N } from './Economy.jsx';
import { Sparkles, Send, Tag, Tag as TagIcon, Gavel, Hammer, EyeOff, Eye, Repeat, Pin, ArrowUpCircle, Info, Search, X, Link2, Gem, Crown, MoreHorizontal, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useStore } from '../store.js';
import { api, PUBLIC_ORIGIN } from '../api.js';
import { Avatar, Modal, Spark, Switch, Spinner, useAsync, useAction, Verified } from './common.jsx';
import { GiftArt, CollectibleArt, GiftModel } from './GiftArt.jsx';
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
export function GiftShopModal({ toUser: initialTo, toChat }) {
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
        await api(`/gifts/${picked.id}/buy`, { body: toChat ? { toChatId: toChat.id, message, anonymous } : { toUserId: recipient.id, message, anonymous } });
        setPicked(null);
        setMessage('');
        setAnonymous(false);
        reload();
        closeAll();
      }, toChat ? `Подарок отправлен каналу «${toChat.title}» 🎁` : recipient.id === me.id ? 'Подарок добавлен в профиль 🎁' : `Подарок отправлен ${recipient.displayName} 🎁`);
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
            <GiftArt gift={picked} size={170} animated float />
            <div className="bold" style={{ fontSize: '1.15em' }}>{picked.name}</div>
            <SupplyBar gift={picked} />
          </div>
          {toChat ? (
            <div className="list-item" style={{ width: '100%', background: 'var(--bg-2)' }}>
              <Avatar src={toChat.avatar} name={toChat.title} id={toChat.id} size={40} />
              <div className="grow"><div className="small muted">Канал</div><div className="bold">{toChat.title}</div></div>
            </div>
          ) : (
          <div className="list-item" style={{ width: '100%', background: 'var(--bg-2)' }} onClick={() => setChoosing(true)}>
            <Avatar src={recipient.avatar} name={recipient.displayName} id={recipient.id} size={40} />
            <div className="grow"><div className="small muted">Получатель</div><div className="bold">{recipient.id === me.id ? 'Себе' : recipient.displayName}</div></div>
            <span className="accent small">Изменить</span>
          </div>
          )}
          <textarea className="input" placeholder="Сообщение (необязательно)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={255} style={{ minHeight: 70 }} />
          {(toChat || recipient.id !== me.id) && (
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
      {(initialTo || toChat) && <div className="small muted" style={{ marginBottom: 10 }}>Подарок для <b style={{ color: 'var(--text)' }}>{toChat ? `канала «${toChat.title}»` : initialTo.displayName}</b></div>}
      <div className="row" style={{ gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        <span className="small muted">Коллекционные подарки — их можно улучшить, продать и передать</span>
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
              <SeasonBadge gift={g} />
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
  // Model, backdrop and pattern are rolled independently, like the real upgrade.
  const roll = () => {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    return { m: pick(attrs.models), backdrop: pick(attrs.backdrops), symbol: pick(attrs.symbols) };
  };
  const [i, setI] = useState(0);
  const [look, setLook] = useState(roll);
  useEffect(() => {
    const t = setInterval(() => { setLook(roll()); setI((x) => x + 1); }, 1400);
    return () => clearInterval(t);
  }, [attrs]);
  const m = look.m;
  const col = {
    model: { ...m, image: m.image || attrs.gift.image, animation: m.image ? null : attrs.gift.animation },
    backdrop: look.backdrop,
    symbol: look.symbol,
  };
  return (
    <div className="col" style={{ gap: 6 }}>
      <CollectibleArt key={i} col={col} size="100%" height={150} rounded={16} style={{ animation: 'fadeSwap .5s' }} />
      <div className="tiny muted center">{m.name} · {col.backdrop.name} · {col.symbol.emoji} {col.symbol.name}</div>
    </div>
  );
}

export function GiftDetailsModal({ userGiftId, list }) {
  const [id, setId] = useState(userGiftId);
  const [dir, setDir] = useState('');
  const idx = list ? list.indexOf(id) : -1;
  const go = (d) => {
    if (!list || idx < 0) return;
    const next = list[(idx + d + list.length) % list.length];
    if (next === id) return;
    setDir(d > 0 ? 'swipe-next' : 'swipe-prev');
    setId(next);
  };
  return <GiftSheet key={id} userGiftId={id} dir={dir} nav={list && list.length > 1 ? go : null} />;
}

function GiftSheet({ userGiftId, dir, nav }) {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const openModal = useStore((s) => s.openModal);
  const close = useStore((s) => s.closeModal);
  const toast = useStore((s) => s.toast);
  const { data, setData } = useAsync(() => api(`/user-gifts/${userGiftId}`), [userGiftId]);
  const ug = data?.userGift;
  const attrs = useAsync(() => (ug?.gift.upgradable && !ug.collectible ? api(`/gifts/${ug.gift.id}/attributes`) : Promise.resolve(null)), [ug?.gift.id, !!ug?.collectible]);
  const [run, busy] = useAction();
  const [revealing, setRevealing] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState(false);
  const [upg, setUpg] = useState(null);
  const [menu, setMenu] = useState(false);
  const modelRef = useRef();
  const touch = useRef(null);

  if (!ug) return <Modal title={null} className={`gift-sheet ${dir}`}><div className="center" style={{ padding: 80 }}><Spinner /></div></Modal>;
  const mine = ug.owner?.id === me.id;
  const col = ug.collectible;
  const m = col?.model;

  const upgrade = () => {
    if (attrs.data?.models?.length && attrs.data.backdrops?.length && attrs.data.symbols?.length) {
      setUpg({ request: api(`/user-gifts/${ug.id}/upgrade`, { body: {} }) });
      return;
    }
    return run(async () => {
      setRevealing(true);
      const [r] = await Promise.all([api(`/user-gifts/${ug.id}/upgrade`, { body: {} }), new Promise((res) => setTimeout(res, 1600))]);
      setData({ userGift: r.userGift });
      setJustUpgraded(true);
      document.querySelector('.gift-sheet .modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
    }).finally(() => setRevealing(false));
  };
  const craft = async () => {
    try {
      const set = await findCraftSet(me.id, ug.gift.id);
      const ids = [ug.id, ...set.map((g) => g.id).filter((id) => id !== ug.id)].slice(0, CRAFT_N);
      if (ids.length < CRAFT_N) { toast(`Для крафта нужно ${CRAFT_N} одинаковых обычных подарка «${ug.gift.name}» — у вас ${set.length}`, 'error'); return; }
      if (!confirm(`Крафт: ${CRAFT_N} подарков «${ug.gift.name}» превратятся в 1 коллекционный — бесплатно, без оплаты улучшения. Продолжить?`)) return;
      if (attrs.data?.models?.length) setUpg({ request: api('/craft', { body: { userGiftIds: ids } }) });
      else { const r = await api('/craft', { body: { userGiftIds: ids } }); setData({ userGift: r.userGift }); setJustUpgraded(true); }
    } catch (e) { toast(e.message, 'error'); }
  };
  const upgradeDone = (userGift) => {
    setUpg(null);
    if (userGift) { setData({ userGift }); setJustUpgraded(true); }
    document.querySelector('.gift-sheet .modal-body')?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const convert = () => {
    if (!confirm(`Конвертировать подарок в ${ug.gift.convertValue} ${useStore.getState().currency.symbol}? Подарок исчезнет из профиля.`)) return;
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
  const removeGift = () => {
    if (!confirm(`Удалить «${ug.gift.name}${col ? ` #${col.number}` : ''}» из профиля? Это нельзя отменить.`)) return;
    run(async () => { await api.del(`/user-gifts/${ug.id}`); close(); window.dispatchEvent(new CustomEvent('gift:removed', { detail: ug.id })); }, 'Подарок удалён');
  };
  const unlist = () => run(async () => { await api.del(`/market/listings/${ug.listing.id}`); setData({ userGift: { ...ug, listing: null } }); }, 'Снято с продажи');
  const copyLink = () => { navigator.clipboard?.writeText(`${PUBLIC_ORIGIN}/gift/${col?.slug || ug.id}`); toast('Ссылка скопирована'); setMenu(false); };

  // tilt the model with the finger / cursor
  const tilt = (e) => {
    const el = modelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    el.style.transform = `rotateY(${x * 14}deg) rotateX(${-y * 10}deg) scale(1.04)`;
  };
  const untilt = () => { if (modelRef.current) modelRef.current.style.transform = ''; };
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    const t = touch.current;
    touch.current = null;
    if (!t || !nav) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) nav(dx < 0 ? 1 : -1);
  };

  const sub = ug.listing
    ? <>В продаже за <Spark amount={ug.listing.price} /></>
    : col ? 'Коллекционный подарок' : ug.gift.limited ? `Лимитированный · тираж ${fmtNum(ug.gift.supply)}` : 'Подарок';
  const sender = ug.sender ? ug.sender.displayName : ug.anonymous ? 'анонима' : null;

  return (
    <Modal title={null} className={`gift-sheet ${dir}`}>
      {upg && <UpgradeReveal attrs={attrs.data} gift={ug.gift} request={upg.request} onDone={upgradeDone} onError={(e) => { setUpg(null); toast(e.message, 'error'); }} />}
      <div className={`gs-hero ${col ? '' : 'gs-plain'}`} onPointerMove={tilt} onPointerLeave={untilt} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={justUpgraded ? { animation: 'reveal .9s cubic-bezier(.2,.8,.2,1)' } : undefined}>
        {col && <CollectibleArt col={col} size="100%" height="100%" rounded={0} />}
        <div className="gs-top">
          <button className="glass-icon" onClick={close} aria-label="Закрыть"><X size={20} /></button>
          <span className="spacer" />
          {(col || mine) && (
            <div style={{ position: 'relative' }}>
              <button className="glass-icon" onClick={() => setMenu(!menu)} aria-label="Ещё"><MoreHorizontal size={20} /></button>
              {menu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setMenu(false)} />
                  <div className="ctx-menu" style={{ position: 'absolute', right: 0, top: 48, left: 'auto', zIndex: 10, '--origin': 'top right', color: 'var(--text)' }}>
                    {col && <button className="menu-item" onClick={copyLink}><Link2 size={18} /> Скопировать ссылку</button>}
                    {mine && <button className="menu-item" onClick={() => { setMenu(false); visibility({ pinned: !ug.pinned }); }}><Pin size={18} /> {ug.pinned ? 'Открепить' : 'Закрепить в профиле'}</button>}
                    {mine && <button className="menu-item" onClick={() => { setMenu(false); visibility({ hidden: !ug.hidden }); }}>{ug.hidden ? <Eye size={18} /> : <EyeOff size={18} />} {ug.hidden ? 'Показать в профиле' : 'Скрыть из профиля'}</button>}
                    {mine && me.isAdmin && <button className="menu-item danger" onClick={() => { setMenu(false); removeGift(); }}><Trash2 size={18} className="danger" /> Удалить подарок</button>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {nav && <button className="glass-icon gs-arrow prev" onClick={() => nav(-1)} aria-label="Предыдущий"><ChevronLeft size={22} /></button>}
        {nav && <button className="glass-icon gs-arrow next" onClick={() => nav(1)} aria-label="Следующий"><ChevronRight size={22} /></button>}
        <div className="gs-model">
          <div ref={modelRef} className={revealing ? 'revealing' : ''} style={{ transition: 'transform .3s ease-out', width: 170, height: 170 }}>
            <GiftModel emoji={m?.emoji || ug.gift.emoji} image={m?.image || ug.gift.image} animation={m ? m.animation : ug.gift.animation} filter={m?.filter} size={170} animated className="floaty" />
          </div>
        </div>
        <div className="gs-title">{ug.gift.name}{col && <small>#{fmtNum(col.number)}</small>}</div>
        <div className="gs-sub">{sub}</div>
        {mine && col && (
          <div className="gs-actions">
            <button disabled={!!ug.listing} onClick={() => openModal('transferGift', { userGift: ug })}><Gem size={22} />передать</button>
            <button className={ug.worn ? 'on' : ''} onClick={wear} disabled={busy}><Crown size={22} />{ug.worn ? 'снять' : 'носить'}</button>
            {ug.listing ? (
              <button onClick={unlist} disabled={busy}><TagIcon size={22} />не продавать</button>
            ) : (
              <button onClick={() => openModal('sell', { userGift: ug, onDone: (l) => setData({ userGift: { ...ug, listing: l } }) })}><TagIcon size={22} />продать</button>
            )}
            {!ug.listing && <button onClick={() => openModal('auctionCreate', { userGift: ug })}><Gavel size={22} />аукцион</button>}
          </div>
        )}
        {mine && !col && (
          <div className="gs-actions">
            <button disabled={busy || !ug.gift.upgradable} onClick={upgrade}><ArrowUpCircle size={22} />{revealing ? 'улучшаем…' : 'улучшить'}</button>
            {ug.gift.upgradable && <button disabled={busy} onClick={craft} title={`${CRAFT_N} одинаковых обычных подарков → 1 коллекционный бесплатно`}><Hammer size={22} />крафт</button>}
            <button disabled={busy} onClick={convert}><Repeat size={22} />в {useStore.getState().currency.symbol}</button>
            <button disabled={busy} onClick={() => visibility({ hidden: !ug.hidden })}>{ug.hidden ? <Eye size={22} /> : <EyeOff size={22} />}{ug.hidden ? 'показать' : 'скрыть'}</button>
          </div>
        )}
      </div>

      <div className="gs-body">
        <div className="gs-table">
          {col ? (
            <>
              <div><span>Владелец</span><b className="row" style={{ gap: 6 }}>{ug.owner && <><Avatar src={ug.owner.avatar} name={ug.owner.displayName} id={ug.owner.id} size={22} /><span className="accent-link ellipsis">{ug.owner.displayName}</span></>}</b></div>
              <div><span>Модель</span><b><span className="ellipsis">{col.model?.name}</span><Chance v={col.model?.chance} /></b></div>
              <div><span>Узор</span><b><span className="ellipsis">{col.symbol?.name}</span><Chance v={col.symbol?.chance} /></b></div>
              <div><span>Фон</span><b><i className="dot" style={{ background: col.backdrop?.center }} /><span className="ellipsis">{col.backdrop?.name}</span><Chance v={col.backdrop?.chance} /></b></div>
              <div><span>Наличие</span><b>{fmtNum(col.issued)}/{ug.gift.supply ? fmtNum(ug.gift.supply) : '∞'} выпущено</b></div>
              <div><span>Ценность</span><b>~<Spark amount={col.estimate} /></b></div>
            </>
          ) : (
            <>
              <div><span>От</span><b className="row" style={{ gap: 6 }}>{ug.sender ? <><Avatar src={ug.sender.avatar} name={ug.sender.displayName} id={ug.sender.id} size={22} /><span className="accent-link ellipsis">{ug.sender.displayName}</span></> : 'Аноним'}</b></div>
              <div><span>Дата</span><b>{new Date(ug.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></div>
              <div><span>Стоимость</span><b><Spark amount={ug.gift.price} /></b></div>
              {ug.gift.limited && <div><span>Наличие</span><b>{fmtNum(ug.gift.supply - ug.gift.remaining)}/{fmtNum(ug.gift.supply)} выпущено</b></div>}
            </>
          )}
          {(ug.message || (col && sender)) && (
            <div style={{ display: 'block' }}>
              <span className="gs-note">
                {col && sender && <>Подарок от <span className="accent-link">{sender}</span>{ug.owner && <> для <span className="accent-link">{ug.owner.displayName}</span></>}, отправлен {new Date(ug.createdAt).toLocaleDateString('ru-RU')}.</>}
                {ug.message && <>{col && sender ? ' ' : ''}«{ug.message}»</>}
              </span>
            </div>
          )}
        </div>

        {mine && !col && ug.gift.upgradable && attrs.data && (
          <div className="card col" style={{ gap: 10 }}>
            <div className="row bold"><Sparkles size={18} className="accent" /> Улучшить до коллекционного за <Spark amount={ug.gift.upgradePrice} /></div>
            <div className="small muted">Подарок получит уникальный номер и случайные модель, фон и узор. Его можно будет носить, продать на маркете или передать.</div>
            <UpgradePreview attrs={attrs.data} />
          </div>
        )}

        {mine && (
          <div className="gs-vis">
            {ug.hidden ? 'Подарок скрыт из профиля. ' : 'Подарок виден в профиле. '}
            <button onClick={() => visibility({ hidden: !ug.hidden })}>{ug.hidden ? 'Показать' : 'Скрыть'} ›</button>
          </div>
        )}
        {!mine && ug.listing && (
          <button className="btn block" onClick={() => openModal('market', { kind: 'gift', q: String(col?.number || '') })}>Купить на маркете за <Spark amount={ug.listing.price} /></button>
        )}
        <button className="btn block gs-ok" onClick={close}>OK</button>
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
