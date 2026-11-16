import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Centered glass card that grows out of the element you tapped and shrinks back into it
 * (like the reference video); the page behind is blurred.
 * `from` — DOMRect of the origin element.
 */
export function Popover({ from, onClose, children, className = '', closeButton = true }) {
  const card = useRef();
  const overlay = useRef();
  const [closing, setClosing] = useState(false);

  const fromTransform = () => {
    const el = card.current;
    if (!el || !from) return 'scale(.6)';
    const r = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (r.left + r.width / 2);
    const dy = from.top + from.height / 2 - (r.top + r.height / 2);
    const s = Math.max(0.08, Math.min(from.width / r.width, from.height / r.height));
    return `translate(${dx}px, ${dy}px) scale(${s})`;
  };

  useLayoutEffect(() => {
    const el = card.current;
    el.animate(
      [
        { transform: fromTransform(), opacity: 0.2, filter: 'blur(10px)', borderRadius: '999px' },
        { transform: 'none', opacity: 1, filter: 'blur(0px)', borderRadius: '30px' },
      ],
      { duration: 520, easing: 'cubic-bezier(.2, 1.15, .3, 1)', fill: 'both' },
    );
    overlay.current.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'both' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    if (closing) return;
    setClosing(true);
    card.current.animate(
      [
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
        { transform: fromTransform(), opacity: 0, filter: 'blur(8px)' },
      ],
      { duration: 340, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'both' },
    );
    overlay.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 340, easing: 'ease-in', fill: 'both' }).onfinish = onClose;
  };

  return createPortal(
    <div className="pop-root">
      <div ref={overlay} className="pop-overlay" onClick={close} />
      <div ref={card} className={`pop-card ${className}`} role="dialog">
        {closeButton && <button className="pop-x" onClick={close} aria-label="Закрыть"><X size={16} /></button>}
        {typeof children === 'function' ? children(close) : children}
      </div>
    </div>,
    document.body,
  );
}
