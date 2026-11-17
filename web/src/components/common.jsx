import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ArrowLeft, BadgeCheck } from 'lucide-react';
import { mediaUrl } from '../api.js';
import { colorFor, initials } from '../util.js';
import { useStore, useCurrency } from '../store.js';

export function Avatar({ src, name, id, size = 48, online, ring, onClick, saved }) {
  const style = { width: size, height: size, fontSize: size * 0.38, background: src ? '#222' : `linear-gradient(160deg, ${colorFor(id)}, color-mix(in srgb, ${colorFor(id)} 60%, #000))` };
  let el = (
    <div className="avatar" style={style}>
      {saved ? '🔖' : src ? <img src={mediaUrl(src)} alt="" loading="lazy" /> : initials(name)}
    </div>
  );
  if (ring) el = <div className={`story-ring ${ring === 'seen' ? 'seen' : ''}`}>{el}</div>;
  return (
    <div className="avatar-wrap" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      {el}
      {online && <span className="online-dot" />}
    </div>
  );
}

export const Verified = ({ size = 16 }) => <BadgeCheck size={size} className="verified" fill="currentColor" color="var(--bg)" strokeWidth={2} style={{ color: 'var(--accent)' }} />;

/** Small collectible "worn" next to a user's name. */
export function WornGift({ gift, size = 20 }) {
  if (!gift) return null;
  return (
    <span className="worn-gift" title={`${gift.name} #${gift.number}`} style={{ width: size, height: size, background: `radial-gradient(circle, ${gift.center || '#444'}, ${gift.edge || '#000'})` }}>
      <img src={gift.image || `/emoji3d/${[...gift.emoji].map((c) => c.codePointAt(0).toString(16)).join('-')}.webp`} alt="" style={{ filter: gift.filter || undefined }} />
    </span>
  );
}

/** Spark icon (currency shape) usable like a lucide icon. */
export const SparkIcon = ({ size = 20, fill = 'none', color = 'currentColor', strokeWidth = 2, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={fill !== 'none' ? 0 : strokeWidth} strokeLinejoin="round" {...rest}>
    <path d="M12 2.5c.6 4.6 2.3 7.4 9.5 9.5-7.2 2.1-8.9 4.9-9.5 9.5-.6-4.6-2.3-7.4-9.5-9.5 7.2-2.1 8.9-4.9 9.5-9.5z" fill={fill === 'none' ? 'none' : fill} />
  </svg>
);

/** Premium badge: a spark — the same shape as our currency ✦. */
export const PremiumStar = ({ size = 15 }) => (
  <svg className="premium-star" width={size} height={size} viewBox="0 0 24 24" aria-label="Premium">
    <defs><linearGradient id="pspark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb3a0" /><stop offset=".45" stopColor="var(--accent)" /><stop offset="1" stopColor="#ff7a1a" /></linearGradient></defs>
    <path fill="url(#pspark)" d="M12 1.5c.6 4.9 2.4 7.9 10.5 10.5C14.4 14.6 12.6 17.6 12 22.5c-.6-4.9-2.4-7.9-10.5-10.5C9.6 9.4 11.4 6.4 12 1.5z" />
  </svg>
);

/** Premium name style: colour / gradient, shimmer, glow, bold. */
export function nameStyleCss(ns) {
  if (!ns) return undefined;
  const st = {};
  if (ns.color && ns.color2) {
    st.backgroundImage = `linear-gradient(90deg, ${ns.color}, ${ns.color2}, ${ns.color})`;
    st.backgroundSize = ns.animated ? '200% 100%' : '100% 100%';
    st.WebkitBackgroundClip = 'text';
    st.backgroundClip = 'text';
    st.WebkitTextFillColor = 'transparent';
    st.color = 'transparent';
    if (ns.animated) st.animation = 'nameShift 3s linear infinite';
  } else if (ns.color) {
    st.color = ns.color;
    st.WebkitTextFillColor = ns.color;
  }
  if (ns.bold) st.fontWeight = 900;
  return st;
}
/** Glow lives on a wrapper: Safari breaks gradient text when `filter` is on the same element. */
export const nameGlowCss = (ns) => (ns?.glow ? { filter: `drop-shadow(0 0 6px ${ns.color || '#fff'})` } : undefined);

export function StyledName({ user, className = 'ellipsis' }) {
  const ns = user?.nameStyle;
  if (!ns) return <span className={className}>{user?.displayName}</span>;
  return (
    <span className={`styled-name ${className}`} style={nameGlowCss(ns)}>
      <span style={nameStyleCss(ns)}>{user?.displayName}</span>
    </span>
  );
}

export function Name({ user, className }) {
  if (!user) return null;
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <StyledName user={user} />
      {user.verified && <Verified size={15} />}
      {user.premium && <PremiumStar />}
      {user.wornGift && <WornGift gift={user.wornGift} />}
    </span>
  );
}

/** Inside a tab page, <Modal> renders as a full page instead of an overlay. */
export const InlinePage = createContext(false);

export function Modal({ title, children, footer, onClose, wide, back, className = '', headExtra }) {
  const inline = useContext(InlinePage);
  const close = useStore((s) => s.closeModal);
  const doClose = onClose || close;
  useEffect(() => {
    if (inline) return;
    const h = (e) => e.key === 'Escape' && doClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [doClose, inline]);
  if (inline) {
    return (
      <div className={`page ${className}`}>
        {title !== null && (
          <div className="page-head">
            {back && <button className="icon-btn" onClick={back}><ArrowLeft size={22} /></button>}
            <h3>{title}</h3>
            {headExtra}
          </div>
        )}
        <div className="page-body">
          {children}
          {footer && <div className="page-foot">{footer}</div>}
        </div>
      </div>
    );
  }
  return <SheetModal {...{ title, children, footer, back, className, headExtra, wide }} doClose={doClose} />;
}

/** Overlay modal; on phones it is a bottom sheet you can drag down to close. */
function SheetModal({ title, children, footer, back, className, headExtra, wide, doClose }) {
  const ref = useRef();
  const drag = useRef(null);
  // grow out of the point the user tapped
  useLayoutEffect(() => {
    const el = ref.current;
    const tap = window.__tap;
    if (!el || !tap || Date.now() - tap.t > 900) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--ox', `${Math.max(0, Math.min(r.width, tap.x - r.left))}px`);
    el.style.setProperty('--oy', `${Math.max(0, Math.min(r.height, tap.y - r.top))}px`);
  }, []);
  const onStart = (e) => {
    if (window.innerWidth > 560) return;
    const body = ref.current.querySelector('.modal-body');
    if (body && body.scrollTop > 0 && !e.target.closest('.modal-head, .sheet-grip')) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dy = e.touches[0].clientY - drag.current.y;
    if (dy < 0) return;
    drag.current.dy = dy;
    ref.current.style.transition = 'none';
    ref.current.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)';
    if (dy > 110) {
      ref.current.style.transform = 'translateY(100%)';
      setTimeout(doClose, 200);
    } else ref.current.style.transform = '';
  };
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && doClose()}>
      <div ref={ref} className={`modal ${wide === 'x' ? 'xwide' : wide ? 'wide' : ''} ${className}`} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
        <div className="sheet-grip" />
        {title !== null && (
          <div className="modal-head">
            {back && (
              <button className="icon-btn" onClick={back}>
                <ArrowLeft size={22} />
              </button>
            )}
            <h3>{title}</h3>
            {headExtra}
            <button className="icon-btn" onClick={doClose}>
              <X size={22} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Spark({ amount, size }) {
  const c = useCurrency();
  return (
    <span className="spark" style={size ? { fontSize: size } : undefined}>
      <span className="spark-sym">{c.symbol}</span>
      {amount !== undefined && <span className="spark-amt">{Number(amount).toLocaleString('ru-RU')}</span>}
    </span>
  );
}

export function Switch({ on, onChange }) {
  return <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function Spinner({ size = 28 }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const reload = () => {
    setState((s) => ({ ...s, loading: true }));
    return fn()
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, deps);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}

/** Wrap an async action: shows errors as toasts and tracks busy state. */
export function useAction() {
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMessage) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      if (okMessage) toast(okMessage);
      return r;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return [run, busy];
}
