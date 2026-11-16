import { createContext, useContext, useEffect, useState } from 'react';
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

export function Name({ user, className }) {
  if (!user) return null;
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      <span className="ellipsis">{user.displayName}</span>
      {user.verified && <Verified size={15} />}
      {user.wornGift ? <WornGift gift={user.wornGift} /> : user.emojiStatus && <span>{user.emojiStatus}</span>}
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
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && doClose()}>
      <div className={`modal ${wide === 'x' ? 'xwide' : wide ? 'wide' : ''} ${className}`}>
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
      {c.symbol}
      {amount !== undefined && <> {Number(amount).toLocaleString('ru-RU')}</>}
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
