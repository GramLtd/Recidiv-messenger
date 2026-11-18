import { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { RefreshCw, Smartphone } from 'lucide-react';
import { api } from '../api.js';
import { useStore } from '../store.js';

/** QR as an SVG path (no canvas, crisp at any size). */
export function QrSvg({ text, size = 220 }) {
  const { path, n } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const count = q.getModuleCount();
    let d = '';
    for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { path: d, n: count };
  }, [text]);
  return (
    <svg className="qr-svg" width={size} height={size} viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" aria-label="QR-код">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} rx="2.5" fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

/**
 * Telegram-style "log in by QR": this device shows a short-lived code; a phone where you're already signed in
 * scans it (Settings → Devices → «Подключить устройство») and confirms. Long-polls the server for the result.
 */
export function QrLogin() {
  const login = useStore((s) => s.login);
  const [code, setCode] = useState(null);
  const [state, setState] = useState('loading');
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setState('loading');
    setCode(null);
    (async () => {
      try {
        const c = await api('/auth/qr', { body: {} });
        if (!alive) return;
        setCode(c);
        setState('waiting');
        const deadline = Date.now() + c.expiresIn * 1000;
        while (alive && Date.now() < deadline) {
          const r = await api(`/auth/qr/${c.id}`).catch(() => ({ state: 'retry' }));
          if (!alive) return;
          if (r.state === 'approved') { login(r.token, r.user); return; }
          if (r.state === 'expired') break;
          if (r.state === 'scanned') setState('scanned');
          if (r.state === 'retry') await new Promise((res) => setTimeout(res, 2000));
        }
        if (alive) setState('expired');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [nonce]);

  return (
    <div className="qr-login">
      <div className={`qr-box ${state}`}>
        {code ? <QrSvg text={code.url} size={208} /> : <div className="qr-skeleton" />}
        {code && <span className="qr-logo"><img src="/icon-192.png" alt="" /></span>}
        {(state === 'expired' || state === 'error') && (
          <button className="qr-refresh" onClick={() => setNonce((x) => x + 1)}><RefreshCw size={22} />{state === 'error' ? 'Ошибка — повторить' : 'Обновить код'}</button>
        )}
        {state === 'scanned' && <div className="qr-scanned"><Smartphone size={26} />Подтвердите вход на телефоне</div>}
      </div>
      <ol className="qr-steps">
        <li>Откройте Recidivist на телефоне</li>
        <li>Настройки → Устройства → <b>Подключить устройство</b></li>
        <li>Наведите камеру на этот код и подтвердите вход</li>
      </ol>
    </div>
  );
}
