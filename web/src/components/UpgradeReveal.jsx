import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CollectibleArt } from './GiftArt.jsx';
import { fmtNum } from '../util.js';

/*
 * Telegram-like gift upgrade: the card spins through possible looks like a slot machine, slows down,
 * locks model → backdrop → pattern one after another, then bursts (flash, shock ring, sparks) into the result.
 *   attrs   — /gifts/:id/attributes (models / backdrops / symbols)
 *   request — promise of the upgrade API call ({ userGift })
 */
const pick = (l) => l[Math.floor(Math.random() * l.length)];
const LOCK = { model: 1700, backdrop: 2300, symbol: 2900 };
const REVEAL_AT = 3150;

export function UpgradeReveal({ attrs, gift, request, onDone, onError }) {
  const [t0] = useState(() => performance.now());
  const [result, setResult] = useState(null);
  const [look, setLook] = useState(() => ({ m: pick(attrs.models), b: pick(attrs.backdrops), s: pick(attrs.symbols) }));
  const [locked, setLocked] = useState({});
  const [phase, setPhase] = useState('spin'); // spin → reveal
  const [tick, setTick] = useState(0);
  const resRef = useRef(null);

  useEffect(() => {
    let alive = true;
    request.then((r) => { if (alive) { resRef.current = r.userGift; setResult(r.userGift); } }).catch((e) => { if (alive) onError?.(e); });
    return () => { alive = false; };
  }, []);

  // slot-machine ticker: fast at first, easing out; each attribute freezes at its lock time (once the result is known)
  useEffect(() => {
    let timer;
    let alive = true;
    const step = () => {
      if (!alive) return;
      const el = performance.now() - t0;
      const col = resRef.current?.collectible;
      const lk = {
        model: !!col && el >= LOCK.model,
        backdrop: !!col && el >= LOCK.backdrop,
        symbol: !!col && el >= LOCK.symbol,
      };
      setLocked((p) => (p.model === lk.model && p.backdrop === lk.backdrop && p.symbol === lk.symbol ? p : lk));
      setLook((p) => ({
        m: lk.model ? col.model : pick(attrs.models.filter((x) => x !== p.m).length ? attrs.models.filter((x) => x !== p.m) : attrs.models),
        b: lk.backdrop ? col.backdrop : pick(attrs.backdrops.filter((x) => x !== p.b).length ? attrs.backdrops.filter((x) => x !== p.b) : attrs.backdrops),
        s: lk.symbol ? col.symbol : pick(attrs.symbols.filter((x) => x !== p.s).length ? attrs.symbols.filter((x) => x !== p.s) : attrs.symbols),
      }));
      setTick((x) => x + 1);
      if (col && el >= REVEAL_AT) { setPhase('reveal'); return; }
      const progress = Math.min(1, el / REVEAL_AT);
      timer = setTimeout(step, 70 + progress * progress * 260); // 70ms → ~330ms between frames
    };
    step();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const col = result?.collectible;
  const shown = phase === 'reveal' && col ? col : {
    model: { ...look.m, image: look.m.image || gift.image, animation: null },
    backdrop: look.b,
    symbol: look.s,
  };
  const sparks = useMemo(() => Array.from({ length: 34 }, (_, i) => {
    const a = (i / 34) * Math.PI * 2 + Math.random() * 0.3;
    const d = 140 + Math.random() * 160;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 4 + Math.random() * 7, delay: Math.random() * 120, r: Math.random() * 360 };
  }), []);
  const edge = (phase === 'reveal' ? col?.backdrop?.center : look.b?.center) || '#fff';

  return createPortal(
    <div className={`upg ${phase}`} style={{ '--upg-c': edge }} onClick={() => phase === 'reveal' && onDone(result)}>
      <div className="upg-glow" />
      {phase === 'reveal' && <><i className="upg-flash" /><i className="upg-ring" /><i className="upg-ring r2" /></>}
      {phase === 'reveal' && (
        <div className="upg-sparks">
          {sparks.map((p, i) => <i key={i} style={{ '--x': `${p.x}px`, '--y': `${p.y}px`, '--s': `${p.s}px`, '--r': `${p.r}deg`, animationDelay: `${p.delay}ms` }} />)}
        </div>
      )}
      <div className="upg-stage" onClick={(e) => e.stopPropagation()}>
        <div className={`upg-card ${phase === 'spin' ? 'spinning' : ''}`} key={phase === 'reveal' ? 'final' : 'spin'}>
          <CollectibleArt col={shown} size="100%" height="100%" rounded={28} animated={phase === 'reveal'} loop={false} />
          {phase === 'spin' && <i className="upg-blur" key={tick} />}
        </div>
        <div className="upg-title">{phase === 'reveal' ? <>Подарок улучшен!</> : 'Улучшаем подарок…'}</div>
        <div className="upg-name">{gift.name}{phase === 'reveal' && col ? <small> #{fmtNum(col.number)}</small> : null}</div>
        <div className="upg-slots">
          {[['Модель', 'model', shown.model], ['Фон', 'backdrop', shown.backdrop], ['Узор', 'symbol', shown.symbol]].map(([label, k, v]) => (
            <div key={k} className={`upg-slot ${locked[k] || phase === 'reveal' ? 'locked' : ''}`}>
              <small>{label}</small>
              <b key={locked[k] ? 'l' : tick}>{k === 'symbol' ? `${v?.emoji || ''} ${v?.name || ''}` : v?.name}</b>
              {(locked[k] || phase === 'reveal') && v?.chance != null && <span className="rarity-tag">{v.chance}%</span>}
            </div>
          ))}
        </div>
        {phase === 'reveal' && <button className="btn upg-ok" onClick={() => onDone(result)}>Отлично</button>}
      </div>
    </div>,
    document.body,
  );
}
