import { useEffect, useRef, useState } from 'react';

/** Follow a horizontal swipe from the left edge (iOS "back" gesture). */
export function useEdgeSwipe(ref, { onProgress, onBack, edge = 32, enabled = true }) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    let st = null;
    const start = (e) => {
      const t = e.touches[0];
      const r = el.getBoundingClientRect();
      if (t.clientX - r.left > edge) return;
      st = { x: t.clientX, y: t.clientY, t: Date.now(), w: r.width, dx: 0, locked: false };
    };
    const move = (e) => {
      if (!st) return;
      const t = e.touches[0];
      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      if (!st.locked) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; }
        if (dx < 8) return;
        st.locked = true;
      }
      e.preventDefault();
      st.dx = Math.max(0, dx);
      onProgress?.(st.dx / st.w, false);
    };
    const end = () => {
      if (!st) return;
      const { dx, w, t, locked } = st;
      st = null;
      if (!locked) return;
      const v = dx / Math.max(1, Date.now() - t);
      if (dx > w * 0.35 || v > 0.6) onBack();
      else onProgress?.(0, true);
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, enabled, edge]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Pushed screen (Instagram / iOS navigation): slides in from the right over the previous
 * screen, which parallaxes left and dims. Back = slide out, or swipe from the left edge.
 * `children(back)` renders the page; `onDone` unmounts it after the exit animation.
 */
export function PushLayer({ children, onDone }) {
  const ref = useRef();
  const [closing, setClosing] = useState(false);
  const stack = () => ref.current?.parentElement;
  const setP = (p, animate) => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = animate ? '' : 'none';
    el.style.transform = p ? `translateX(${p * 100}%)` : '';
    stack()?.style.setProperty('--push', String(1 - p));
    stack()?.classList.toggle('push-dragging', !animate);
  };
  const back = () => {
    if (closing) return;
    setClosing(true);
    const el = ref.current;
    if (el) { el.style.transition = ''; el.style.transform = ''; }
    stack()?.classList.remove('push-dragging');
    stack()?.style.setProperty('--push', '0');
    setTimeout(onDone, 360);
  };
  useEffect(() => {
    const s = stack();
    s?.style.setProperty('--push', '1');
    return () => { s?.style.setProperty('--push', '0'); s?.classList.remove('push-dragging'); };
  }, []);
  useEdgeSwipe(ref, { onProgress: setP, onBack: back });
  return <div ref={ref} className={`push-layer ${closing ? 'closing' : ''}`}>{children(back)}</div>;
}
