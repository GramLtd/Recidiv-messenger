import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App.jsx';
import { applyTheme, loadTheme } from './theme.js';
import './styles.css';

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
  const sync = () => {
    root.style.setProperty('--vvh', `${vv.height}px`);
    root.style.setProperty('--vvt', `${vv.offsetTop}px`);
    root.classList.toggle('kb-open', vv.height < window.innerHeight * 0.78);
    if (window.scrollY) window.scrollTo(0, 0);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

// Material-like ripple on every tappable surface.
const RIPPLE = '.btn, .icon-btn, .chip, .nav-btn, .glass-btn, .gift-actions button, .pv-actions button, .action-grid button, .menu-item, .list-item, .chat-item, .track-row, .pill, .glass-icon';
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

const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST || `${location.origin}/tonconnect-manifest.json`;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </TonConnectUIProvider>
  </React.StrictMode>,
);
