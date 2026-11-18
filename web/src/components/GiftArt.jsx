import { useEffect, useRef, useState } from 'react';
import { TgsPlayer, isTgs } from './Tgs.jsx';

/** Fluent Emoji 3D asset for any emoji, shipped in /public/emoji3d (MIT, Microsoft). */
export const emojiCode = (e) => [...String(e || '')].map((c) => c.codePointAt(0).toString(16)).join('-');
export const emoji3d = (e) => `/emoji3d/${emojiCode(e)}.webp`;

/** 3D model image (animated when available) with graceful fallback to the plain emoji. */
export function GiftModel({ emoji, image, animation, filter, size, animated = false, loop = true, className = '', style }) {
  const [failed, setFailed] = useState(false);
  // play-once players free their SVG after the animation and show the still image again
  const [done, setDone] = useState(false);
  if (done) animated = false;
  const common = { width: size, height: size, filter: filter || undefined, ...style };
  if (animated && isTgs(animation) && !failed) {
    return <TgsPlayer src={animation} poster={image} size={size} loop={loop} onDone={loop ? undefined : () => setDone(true)} className={`gift-model ${className}`} style={{ filter: filter || undefined, ...style }} />;
  }
  const src = (animated && !isTgs(animation) && animation) || image || (emoji ? emoji3d(emoji) : null);
  if (!src || failed) {
    return (
      <span className={`gift-emoji ${className}`} style={{ ...common, fontSize: typeof size === 'number' ? size * 0.8 : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {emoji}
      </span>
    );
  }
  return <img className={`gift-model ${className}`} src={src} alt="" draggable={false} loading="lazy" style={common} onError={() => setFailed(true)} />;
}

/** Regular gift or collectible, depending on the user gift. */
export function GiftArt({ userGift, gift, size = 80, height, rounded = 16, animated = false, loop = true, float = false, style }) {
  const g = gift || userGift?.gift;
  const col = userGift?.collectible;
  if (col) return <CollectibleArt col={col} size={size} height={height} rounded={rounded} animated={animated} loop={loop} float={float} style={style} />;
  const h = height || size;
  const modelSize = typeof h === 'number' ? h * 0.82 : '82%';
  return (
    <div className="center" style={{ width: size, height: h, ...style }}>
      <GiftModel emoji={g?.emoji} image={g?.image} animation={g?.animation} size={modelSize} animated={animated} loop={loop} className={float ? 'floaty' : ''} />
    </div>
  );
}

// Telegram-like pattern: symbols in concentric rings around the model, smaller towards the edge.
const RINGS = [
  { r: 30, n: 6, s: 10, o: 0.5 },
  { r: 41, n: 10, s: 8.5, o: 0.42 },
  { r: 51, n: 14, s: 7, o: 0.32 },
  { r: 60, n: 18, s: 6, o: 0.22 },
];
const PATTERN = RINGS.flatMap((ring, ri) =>
  Array.from({ length: ring.n }, (_, i) => {
    const a = (i / ring.n) * Math.PI * 2 + ri * 0.4;
    return { x: 50 + Math.cos(a) * ring.r, y: 50 + Math.sin(a) * ring.r, s: ring.s, o: ring.o };
  }),
);

/*
 * The pattern used to be 48 CSS-masked elements per card — masks are expensive to composite and a grid of cards
 * had thousands of them. Now it is drawn once per (symbol, colour, aspect) into a canvas, cached as a blob URL and
 * shown as one background image.
 */
const patternCache = new Map();
const imgCache = new Map();
const loadImg = (src) => {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = src; }));
  }
  return imgCache.get(src);
};
function patternUrl(emoji, color, aspect) {
  const key = `${emoji}|${color}|${aspect}`;
  if (!patternCache.has(key)) {
    patternCache.set(key, loadImg(emoji3d(emoji)).then(async (im) => {
      const W = 480; const H = Math.round(W / aspect);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      for (const p of PATTERN) {
        const s = (p.s / 100) * W;
        g.globalAlpha = p.o;
        g.drawImage(im, (p.x / 100) * W - s / 2, (p.y / 100) * H - s / 2, s, s);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, W, H);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      return blob ? URL.createObjectURL(blob) : c.toDataURL();
    }).catch(() => { patternCache.delete(key); return null; }));
  }
  return patternCache.get(key);
}
const cssColor = (() => {
  let ctx;
  return (c) => { try { ctx ||= document.createElement('canvas').getContext('2d'); ctx.fillStyle = '#000'; ctx.fillStyle = c; return ctx.fillStyle; } catch { return '#000'; } };
})();
const mixBlack = (hex, k) => {
  const h = cssColor(hex);
  if (!/^#[0-9a-f]{6}$/i.test(h)) return '#000';
  const n = parseInt(h.slice(1), 16);
  const f = (v) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${f(n >> 16 & 255)}${f(n >> 8 & 255)}${f(n & 255)}`;
};

function Pattern({ symbol, backdrop }) {
  const ref = useRef();
  const [url, setUrl] = useState(null);
  const color = backdrop?.pattern ? mixBlack(backdrop.edge, 0.55) : '#000';
  useEffect(() => {
    if (!symbol?.emoji || !ref.current) return undefined;
    const r = ref.current.getBoundingClientRect();
    const aspect = r.width && r.height ? Math.round((r.width / r.height) * 10) / 10 : 1;
    let alive = true;
    patternUrl(symbol.emoji, color, aspect || 1).then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [symbol?.emoji, color]);
  return <div ref={ref} className="pattern" style={url ? { backgroundImage: `url(${url})`, backgroundSize: '100% 100%' } : undefined} />;
}

export function CollectibleArt({ col, size = 200, height, rounded = 16, animated = false, loop = true, tilt = false, float = false, style, children }) {
  const { backdrop, symbol, model } = col;
  const ref = useRef();
  const h = height || size;
  const onMove = (e) => {
    if (!tilt || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    ref.current.style.setProperty('--rx', `${-y * 10}deg`);
    ref.current.style.setProperty('--ry', `${x * 12}deg`);
  };
  const reset = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };
  return (
    <div
      ref={ref}
      className={`collectible-art ${tilt ? 'tilt' : ''}`}
      onPointerMove={onMove}
      onPointerLeave={reset}
      style={{
        width: size,
        height: h,
        borderRadius: rounded,
        background: `radial-gradient(circle at 50% 46%, ${backdrop?.center || '#444'} 0%, ${backdrop?.edge || '#000'} 78%)`,
        ...style,
      }}
    >
      <Pattern symbol={symbol} backdrop={backdrop} />
      <div className="model-wrap">
        <GiftModel emoji={model?.emoji} image={model?.image} animation={model?.animation} filter={model?.filter} size="100%" animated={animated} loop={loop} className={float ? 'floaty' : ''} />
      </div>
      {children}
    </div>
  );
}
