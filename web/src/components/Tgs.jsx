import { useEffect, useRef, useState } from 'react';

// Telegram-style .tgs stickers = gzipped Lottie JSON. Parsed animations are cached by URL.
const cache = new Map();
let lottiePromise;
const loadLottie = () => (lottiePromise ||= import('lottie-web/build/player/lottie_light.js').then((m) => m.default || m));

export const isTgs = (src) => typeof src === 'string' && /\.tgs($|\?)/i.test(src);

function loadTgs(src) {
  if (!cache.has(src)) {
    const p = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
        return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).json();
      })
      .catch((e) => {
        cache.delete(src);
        throw e;
      });
    cache.set(src, p);
  }
  return cache.get(src);
}

/** Plays a .tgs animation; shows `poster` until it is ready (and if it fails). */
export function TgsPlayer({ src, poster, size, className = '', style, loop = true, onDone }) {
  const box = useRef();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let anim;
    let cancelled = false;
    setReady(false);
    setFailed(false);
    Promise.all([loadTgs(src), loadLottie()])
      .then(([data, lottie]) => {
        if (cancelled || !box.current) return;
        // lottie mutates the data object — give each player its own copy
        anim = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop, autoplay: true, animationData: structuredClone(data), rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
        anim.addEventListener('DOMLoaded', () => !cancelled && setReady(true));
        if (!loop) anim.addEventListener('complete', () => !cancelled && onDone?.());
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [src, loop]);

  return (
    <span className={`tgs-player ${className}`} style={{ width: size, height: size, position: 'relative', display: 'inline-block', ...style }}>
      {poster && (!ready || failed) && <img src={poster} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
      <span ref={box} style={{ position: 'absolute', inset: 0, opacity: ready && !failed ? 1 : 0 }} />
    </span>
  );
}
