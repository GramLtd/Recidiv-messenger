import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { applyTheme, loadTheme } from './theme.js';
import './styles.css';
import './styles-v5.css';

applyTheme(loadTheme());

// iOS Safari ignores user-scalable=no, so block pinch / double-tap zoom manually.
const stop = (e) => e.preventDefault();
document.addEventListener('gesturestart', stop, { passive: false });
document.addEventListener('gesturechange', stop, { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest('input, textarea, .bubble')) e.preventDefault();
  lastTouch = now;
}, { passive: false });
document.addEventListener('contextmenu', (e) => { if (e.target.tagName === 'IMG') e.preventDefault(); });

// iOS keyboard: keep the app glued to the *visual* viewport so the chat header
// never slides off-screen and the composer sits right above the keyboard.
const vv = window.visualViewport;
if (vv) {
  const root = document.documentElement;
  const touch = matchMedia('(pointer: coarse)').matches;
  let tallest = vv.height;
  const editing = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === 'TEXTAREA' || a.isContentEditable || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'color'].includes(a.type)));
  };
  const sync = () => {
    tallest = Math.max(tallest, vv.height);
    root.style.setProperty('--vvh', `${vv.height}px`);
    root.style.setProperty('--vvt', `${vv.offsetTop}px`);
    // iOS Safari also shrinks window.innerHeight with the keyboard, so compare with the
    // tallest viewport we have seen, and trust focus on touch devices.
    const open = vv.height < tallest * 0.8 || (touch && editing());
    root.classList.toggle('kb-open', open);
    if (window.scrollY) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  window.addEventListener('orientationchange', () => { tallest = 0; setTimeout(sync, 300); });
  document.addEventListener('focusin', () => setTimeout(sync, 50));
  document.addEventListener('focusout', () => setTimeout(sync, 120));
  sync();
}

// Material-like ripple on every tappable surface.
const RIPPLE = '.btn, .icon-btn, .chip, .glass-btn, .gift-actions button, .pv-actions button, .action-grid button, .menu-item, .list-item, .chat-item, .track-row, .pill, .glass-icon';
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest(RIPPLE);
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  el.style.overflow = el.style.overflow || 'hidden';
  el.appendChild(span);
  setTimeout(() => span.remove(), 600);
}, { passive: true });

// Liquid glass: the specular highlight follows the finger / cursor.
const GLASS = '.btn, .chip, .glass-icon, .gift-actions button, .pv-actions button, .pill, .bot-buttons button, .glass-btn, .send-btn, .fab, .scroll-down, .shazam-btn, .story-nav, .pkg, .lg, .gs-actions button';
const moveGlass = (e) => {
  const el = e.target.closest?.(GLASS);
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
};
// at most one update per frame
let glassEvt = null;
document.addEventListener('pointermove', (e) => {
  if (glassEvt) { glassEvt = e; return; }
  glassEvt = e;
  requestAnimationFrame(() => { moveGlass(glassEvt); glassEvt = null; });
}, { passive: true });
// Remember where the user tapped: menus and modals grow out of that point.
document.addEventListener('pointerdown', (e) => {
  moveGlass(e);
  window.__tap = { x: e.clientX, y: e.clientY, t: Date.now() };
}, { passive: true, capture: true });


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
  </React.StrictMode>,
);
