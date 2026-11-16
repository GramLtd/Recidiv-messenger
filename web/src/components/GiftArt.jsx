import { useRef, useState } from 'react';
import { TgsPlayer, isTgs } from './Tgs.jsx';

/** Fluent Emoji 3D asset for any emoji, shipped in /public/emoji3d (MIT, Microsoft). */
export const emojiCode = (e) => [...String(e || '')].map((c) => c.codePointAt(0).toString(16)).join('-');
export const emoji3d = (e) => `/emoji3d/${emojiCode(e)}.webp`;

/** 3D model image (animated when available) with graceful fallback to the plain emoji. */
export function GiftModel({ emoji, image, animation, filter, size, animated = false, className = '', style }) {
  const [failed, setFailed] = useState(false);
  const common = { width: size, height: size, filter: filter || undefined, ...style };
  if (animated && isTgs(animation) && !failed) {
    return <TgsPlayer src={animation} poster={image} size={size} className={`gift-model ${className}`} style={{ filter: filter || undefined, ...style }} />;
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
export function GiftArt({ userGift, gift, size = 80, height, rounded = 16, animated = false, style }) {
  const g = gift || userGift?.gift;
  const col = userGift?.collectible;
  if (col) return <CollectibleArt col={col} size={size} height={height} rounded={rounded} animated={animated} style={style} />;
  const h = height || size;
  const modelSize = typeof h === 'number' ? h * 0.82 : '82%';
  return (
    <div className="center" style={{ width: size, height: h, ...style }}>
      <GiftModel emoji={g?.emoji} image={g?.image} animation={g?.animation} size={modelSize} animated={animated} className="floaty" />
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

export function CollectibleArt({ col, size = 200, height, rounded = 16, animated = false, tilt = false, style, children }) {
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
  const mask = symbol ? `url(${emoji3d(symbol.emoji)})` : 'none';
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
      <div className="pattern">
        {PATTERN.map((p, i) => (
          <i
            key={i}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.s}%`,
              opacity: p.o,
              background: backdrop?.pattern ? `color-mix(in srgb, ${backdrop.edge} 55%, #000)` : '#000',
              WebkitMaskImage: mask,
              maskImage: mask,
            }}
          />
        ))}
      </div>
      <div className="model-wrap">
        <GiftModel emoji={model?.emoji} image={model?.image} animation={model?.animation} filter={model?.filter} size="100%" animated={animated} className="floaty" />
      </div>
      <div className="shine" />
      {children}
    </div>
  );
}
