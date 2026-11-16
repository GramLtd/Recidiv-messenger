import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Delete, Lock } from 'lucide-react';

// Local passcode: only a salted SHA-256 of the code is stored on this device.
const KEY = 'recidivist.passcode';
const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
};
async function hash(code, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${code}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const useLock = create((set) => ({
  enabled: !!read(),
  locked: !!read(),
  autoLock: read()?.autoLock ?? 5,
  lock: () => read() && set({ locked: true }),
  unlock: () => set({ locked: false }),
  async setCode(code, autoLock = 5) {
    const salt = crypto.getRandomValues(new Uint32Array(2)).join('');
    localStorage.setItem(KEY, JSON.stringify({ salt, hash: await hash(code, salt), autoLock }));
    set({ enabled: true, autoLock });
  },
  setAutoLock(min) {
    const p = read();
    if (!p) return;
    localStorage.setItem(KEY, JSON.stringify({ ...p, autoLock: min }));
    set({ autoLock: min });
  },
  clear() {
    localStorage.removeItem(KEY);
    set({ enabled: false, locked: false });
  },
}));

export async function checkCode(code) {
  const p = read();
  return !!p && (await hash(code, p.salt)) === p.hash;
}

// lock again after the app was in the background for `autoLock` minutes
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  const st = useLock.getState();
  if (!st.enabled) return;
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > st.autoLock * 60_000) st.lock();
});

export function PinPad({ title, subtitle, onDone, error }) {
  const [code, setCode] = useState('');
  const [shake, setShake] = useState(false);
  useEffect(() => {
    if (code.length < 4) return;
    Promise.resolve(onDone(code)).then((ok) => {
      if (ok === false) { setShake(true); setTimeout(() => { setShake(false); setCode(''); }, 450); } else setCode('');
    });
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e) => {
      if (/^\d$/.test(e.key)) setCode((c) => (c.length < 4 ? c + e.key : c));
      if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="pinpad">
      <div className="pin-lock"><Lock size={26} /></div>
      <h2>{title}</h2>
      {subtitle && <div className="muted small">{subtitle}</div>}
      <div className={`pin-dots ${shake ? 'shake' : ''}`}>{[0, 1, 2, 3].map((i) => <i key={i} className={i < code.length ? 'on' : ''} />)}</div>
      {error && <div className="error-text">{error}</div>}
      <div className="pin-keys">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} className="lg" onClick={() => setCode((c) => (c.length < 4 ? c + n : c))}>{n}</button>)}
        <span />
        <button className="lg" onClick={() => setCode((c) => (c.length < 4 ? `${c}0` : c))}>0</button>
        <button className="pin-del" onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Стереть"><Delete size={24} /></button>
      </div>
    </div>
  );
}

export function LockScreen() {
  const locked = useLock((s) => s.locked);
  const unlock = useLock((s) => s.unlock);
  if (!locked) return null;
  return (
    <div className="lock-screen">
      <PinPad title="Введите код-пароль" onDone={async (c) => { if (await checkCode(c)) { unlock(); return true; } return false; }} />
      <button className="btn ghost sm" onClick={() => { if (confirm('Забыли код? Можно выйти из аккаунта и войти снова по сид-фразе.')) { localStorage.removeItem(KEY); window.dispatchEvent(new Event('recidivist:logout')); useLock.setState({ enabled: false, locked: false }); } }}>Забыли код?</button>
    </div>
  );
}
