import { useEffect, useRef, useState } from 'react';
import { siTiktok, siSpotify, siSoundcloud, siTelegram, siDiscord } from '../brand-icons.js';
import { ImagePlus, Trash2, Upload, ZoomIn } from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload, mediaUrl } from '../api.js';
import { useAction } from './common.jsx';

// ---------------- brand links ----------------
export const LINKS = [
  { id: 'tiktok', name: 'TikTok', icon: siTiktok, placeholder: '@username или ссылка' },
  { id: 'spotify', name: 'Spotify', icon: siSpotify, placeholder: 'ссылка open.spotify.com/…' },
  { id: 'soundcloud', name: 'SoundCloud', icon: siSoundcloud, placeholder: 'username или ссылка' },
  { id: 'telegram', name: 'Telegram', icon: siTelegram, placeholder: '@username или t.me/…' },
  { id: 'discord', name: 'Discord', icon: siDiscord, placeholder: 'username или discord.gg/…' },
];

export function BrandIcon({ icon, color }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={icon.title} style={color ? { fill: `#${icon.hex === '000000' ? 'fff' : icon.hex}` } : undefined}>
      <path d={icon.path} />
    </svg>
  );
}

/** Row of link buttons on a profile. */
export function ProfileLinks({ links }) {
  const toast = useStore((s) => s.toast);
  const items = LINKS.filter((l) => links?.[l.id]);
  if (!items.length) return null;
  return (
    <div className="pv-links">
      {items.map((l) => {
        const v = links[l.id];
        const isUrl = /^https:\/\//.test(v);
        return isUrl ? (
          <a key={l.id} className="pv-link" href={v} target="_blank" rel="noopener noreferrer" title={l.name}><BrandIcon icon={l.icon} color /></a>
        ) : (
          <button key={l.id} className="pv-link" title={`${l.name}: ${v}`} onClick={() => { navigator.clipboard?.writeText(v); toast(`${l.name}: ${v} — скопировано`); }}>
            <BrandIcon icon={l.icon} color />
          </button>
        );
      })}
    </div>
  );
}

export function LinksEditor() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const [v, setV] = useState(() => ({ ...(me.links || {}) }));
  const [run, busy] = useAction();
  const save = () => run(async () => setMe((await api('/me/links', { body: v })).user), 'Ссылки сохранены');
  return (
    <div className="field">
      <label>Ссылки в профиле</label>
      <div className="col" style={{ gap: 8 }}>
        {LINKS.map((l) => (
          <div key={l.id} className="link-field">
            <span className="brand"><BrandIcon icon={l.icon} color /></span>
            <input className="input" placeholder={`${l.name}: ${l.placeholder}`} value={v[l.id] || ''} onChange={(e) => setV({ ...v, [l.id]: e.target.value })} autoCapitalize="off" autoComplete="off" spellCheck={false} />
          </div>
        ))}
        <button className="btn secondary sm" disabled={busy} onClick={save}>Сохранить ссылки</button>
      </div>
    </div>
  );
}

// ---------------- banner ----------------
const MAX_BANNER_MB = 10;
const videoDuration = (file) =>
  new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(NaN);
    v.src = URL.createObjectURL(file);
  });

export function BannerMedia({ banner, className }) {
  if (!banner) return null;
  return banner.type === 'video'
    ? <video className={className} src={mediaUrl(banner.url)} autoPlay muted loop playsInline />
    : <img className={className} src={mediaUrl(banner.url)} alt="" />;
}

export function BannerEditor() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const toast = useStore((s) => s.toast);
  const [progress, setProgress] = useState(null);
  const pick = async (file) => {
    if (!file) return;
    try {
      if (file.size > MAX_BANNER_MB * 1024 * 1024) throw new Error(`Баннер должен весить не больше ${MAX_BANNER_MB} МБ`);
      let duration;
      if (file.type.startsWith('video/')) {
        duration = await videoDuration(file);
        if (!(duration <= 5.5)) throw new Error('Видео-баннер должен быть не длиннее 5 секунд');
      } else if (!file.type.startsWith('image/')) throw new Error('Выберите картинку, GIF или видео');
      setProgress(0);
      const media = await upload(file, setProgress);
      setMe((await api('/me/banner', { body: { url: media.url, duration } })).user);
      toast('Баннер обновлён');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setProgress(null);
    }
  };
  const remove = async () => setMe((await api('/me/banner', { body: { url: null } })).user);
  return (
    <div className="field">
      <label>Баннер профиля</label>
      <label className="banner-edit">
        <BannerMedia banner={me.banner} />
        <span className="lg">{progress != null ? `Загрузка ${Math.round(progress * 100)}%` : <><ImagePlus size={17} /> {me.banner ? 'Заменить' : 'Добавить баннер'}</>}</span>
        <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
      </label>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="hint">Картинка, GIF или видео до 5 секунд, до 10 МБ</span>
        {me.banner && <button className="btn sm ghost" onClick={remove}><Trash2 size={15} /> Убрать</button>}
      </div>
    </div>
  );
}

// ---------------- avatar cropper ----------------
/** Pan / pinch / zoom the photo inside a circle — exactly what the avatar will look like. */
export function AvatarCropper({ file, onDone, onCancel }) {
  const box = useRef();
  const imgRef = useRef();
  const preview = useRef();
  const [src] = useState(() => URL.createObjectURL(file));
  const [nat, setNat] = useState(null);
  const [size, setSize] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => URL.revokeObjectURL(src), [src]);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const D = size * 0.84;
  const base = nat ? D / Math.min(nat.w, nat.h) : 1;
  const s = base * zoom;
  const w = nat ? nat.w * s : 0;
  const h = nat ? nat.h * s : 0;
  const clamp = (p, z = zoom) => {
    const ss = base * z;
    const mx = nat ? Math.max(0, (nat.w * ss - D) / 2) : 0;
    const my = nat ? Math.max(0, (nat.h * ss - D) / 2) : 0;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };
  const setZoomC = (z) => {
    const zz = Math.max(1, Math.min(5, z));
    setZoom(zz);
    setPos((p) => clamp(p, zz));
  };

  const crop = (out) => {
    const c = document.createElement('canvas');
    c.width = out;
    c.height = out;
    const g = c.getContext('2d');
    const sx = (w / 2 - pos.x - D / 2) / s;
    const sy = (h / 2 - pos.y - D / 2) / s;
    g.imageSmoothingQuality = 'high';
    g.drawImage(imgRef.current, sx, sy, D / s, D / s, 0, 0, out, out);
    return c;
  };
  useEffect(() => {
    if (!nat || !preview.current) return;
    const c = crop(72);
    const g = preview.current.getContext('2d');
    g.clearRect(0, 0, 72, 72);
    g.drawImage(c, 0, 0);
  });

  const onDown = (e) => {
    box.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    gesture.current = pts.length === 2
      ? { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom }
      : { x: e.clientX, y: e.clientY, pos };
  };
  const onMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const gst = gesture.current;
    if (pts.length === 2 && gst?.dist) setZoomC((gst.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / gst.dist);
    else if (gst && !gst.dist) setPos(clamp({ x: gst.pos.x + e.clientX - gst.x, y: gst.pos.y + e.clientY - gst.y }));
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    const p = [...pointers.current.values()][0];
    gesture.current = p ? { x: p.x, y: p.y, pos } : null;
  };

  const done = async () => {
    setBusy(true);
    const c = crop(512);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    await onDone(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    setBusy(false);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 70 }}>
      <div className="modal floating" style={{ maxWidth: 420 }}>
        <div className="modal-head"><h3>Аватарка</h3></div>
        <div className="modal-body col" style={{ gap: 14 }}>
          <div ref={box} className="cropper" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={(e) => setZoomC(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}>
            <img
              ref={imgRef}
              src={src}
              alt=""
              onLoad={(e) => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              style={{ width: w || undefined, height: h || undefined, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }}
            />
            <div className="cropper-mask" />
            <div className="cropper-ring" />
          </div>
          <div className="row"><ZoomIn size={18} className="muted" /><input className="slider" type="range" min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoomC(Number(e.target.value))} /></div>
          <div className="crop-preview"><canvas ref={preview} width={72} height={72} /><span className="small muted">Так аватарка будет выглядеть в чатах</span></div>
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onCancel}>Отмена</button>
          <button className="btn" disabled={busy || !nat} onClick={done}><Upload size={17} /> {busy ? 'Загрузка…' : 'Готово'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- chat wallpapers ----------------
export const WALLPAPERS = [
  { id: 'noir', name: 'Нуар', css: 'radial-gradient(circle at 20% 10%, #2a0a0e 0%, #000 60%)' },
  { id: 'blood', name: 'Кровь', css: 'linear-gradient(160deg, #3d0008 0%, #120003 55%, #000 100%)' },
  { id: 'ember', name: 'Угли', css: 'radial-gradient(circle at 80% 100%, #5a1a00 0%, #1a0500 45%, #000 80%)' },
  { id: 'aurora', name: 'Сияние', css: 'linear-gradient(130deg, #021b1a, #0a2a4a, #2a0a3a, #021b1a)', anim: true },
  { id: 'neon', name: 'Неон', css: 'linear-gradient(135deg, #1a0033 0%, #33001a 50%, #001a33 100%)', anim: true },
  { id: 'ocean', name: 'Океан', css: 'radial-gradient(circle at 30% 0%, #06345a 0%, #020c1a 60%)' },
  { id: 'forest', name: 'Тайга', css: 'radial-gradient(circle at 70% 0%, #0e3a22 0%, #03120a 60%)' },
  { id: 'gold', name: 'Золото', css: 'radial-gradient(circle at 50% 0%, #4a3500 0%, #140e00 60%, #000 100%)' },
  { id: 'steel', name: 'Сталь', css: 'linear-gradient(180deg, #23272e 0%, #0b0d10 100%)' },
  { id: 'bars', name: 'Решётка', css: 'repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 6px, transparent 6px 46px), radial-gradient(circle at 50% 0%, #2a2a2a, #050505 70%)' },
];

export function wallpaperStyle(wp) {
  if (!wp) return null;
  if (wp.preset) {
    const p = WALLPAPERS.find((x) => x.id === wp.preset);
    if (!p) return null;
    return { background: p.css, backgroundSize: p.anim ? '300% 300%' : undefined, animation: p.anim ? 'wpShift 18s ease-in-out infinite' : undefined, '--wp-dim': wp.dim ?? 0 };
  }
  return { backgroundImage: wp.type === 'image' ? `url(${mediaUrl(wp.url)})` : undefined, filter: wp.blur ? `blur(${wp.blur}px)` : undefined, transform: wp.blur ? 'scale(1.08)' : undefined, '--wp-dim': wp.dim ?? 0.25 };
}

export function ChatWallpaper({ wp }) {
  const style = wallpaperStyle(wp);
  if (!style) return null;
  return (
    <div className="chat-wallpaper" style={style}>
      {wp.type === 'video' && <video src={mediaUrl(wp.url)} autoPlay muted loop playsInline />}
    </div>
  );
}

export function WallpaperPicker() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const toast = useStore((s) => s.toast);
  const wp = me.wallpaper;
  const [progress, setProgress] = useState(null);
  const save = async (body) => {
    try {
      setMe((await api('/me/wallpaper', { body })).user);
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const pick = async (file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast('Обои должны весить не больше 20 МБ', 'error');
    try {
      setProgress(0);
      const m = await upload(file, setProgress);
      await save({ url: m.url, dim: wp?.dim ?? 0.25, blur: 0 });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setProgress(null);
    }
  };
  const custom = wp && wp.url;
  return (
    <div className="field">
      <label>Обои в чатах</label>
      <div className="wp-grid">
        <button className={`wp-item ${!wp ? 'on' : ''}`} style={{ background: 'var(--chat-bg)' }} onClick={() => save({})}><span>Стандартные</span></button>
        {WALLPAPERS.map((p, i) => (
          <button key={p.id} className={`wp-item ${wp?.preset === p.id ? 'on' : ''}`} style={{ background: p.css, backgroundSize: p.anim ? '300% 300%' : undefined, animation: p.anim ? `popIn .4s ${i * 0.03}s both, wpShift 18s ease-in-out infinite` : undefined, animationDelay: p.anim ? undefined : `${i * 0.03}s` }} onClick={() => save({ preset: p.id, dim: 0 })}>
            <span>{p.name}</span>
          </button>
        ))}
        {custom && (
          <button className="wp-item on" style={{ backgroundImage: wp.type === 'image' ? `url(${mediaUrl(wp.url)})` : undefined }}>
            {wp.type === 'video' && <video src={mediaUrl(wp.url)} autoPlay muted loop playsInline />}
            <span>Свои</span>
          </button>
        )}
        <label className="wp-item add">
          <ImagePlus size={22} />
          <span style={{ position: 'static', color: 'inherit', textShadow: 'none' }}>{progress != null ? `${Math.round(progress * 100)}%` : 'Своё фото / видео'}</span>
          <input type="file" accept="image/*,video/mp4,video/webm" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
      {custom && <WallpaperTuning wp={wp} save={save} />}
    </div>
  );
}

function WallpaperTuning({ wp, save }) {
  const [dim, setDim] = useState(wp.dim ?? 0.25);
  const [blur, setBlur] = useState(wp.blur || 0);
  const commit = () => save({ url: wp.url, dim, blur });
  const evts = { onPointerUp: commit, onKeyUp: commit, onTouchEnd: commit };
  return (
    <>
      <label className="small muted" style={{ marginTop: 8 }}>Затемнение: {Math.round(dim * 100)}%</label>
      <input className="slider" type="range" min={0} max={0.8} step={0.05} value={dim} onChange={(e) => setDim(Number(e.target.value))} {...evts} />
      {wp.type === 'image' && (
        <>
          <label className="small muted" style={{ marginTop: 8 }}>Размытие: {blur}px</label>
          <input className="slider" type="range" min={0} max={20} step={1} value={blur} onChange={(e) => setBlur(Number(e.target.value))} {...evts} />
        </>
      )}
    </>
  );
}

// ---------------- blurred profile background ----------------
export function BlurBgEditor() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const toast = useStore((s) => s.toast);
  const [progress, setProgress] = useState(null);
  const cur = me.blurBg?.mode || 'avatar';
  const save = async (body) => {
    try { setMe((await api('/me/blur-bg', { body })).user); } catch (e) { toast(e.message, 'error'); }
  };
  const pick = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Выберите картинку', 'error');
    try {
      setProgress(0);
      const m = await upload(file, setProgress);
      await save({ mode: 'custom', url: m.url });
    } catch (e) { toast(e.message, 'error'); } finally { setProgress(null); }
  };
  const opts = [
    ['avatar', 'Аватарка', me.avatar ? mediaUrl(me.avatar) : null],
    ['banner', 'Баннер', me.banner?.type === 'image' ? mediaUrl(me.banner.url) : null],
    ['custom', 'Своя картинка', me.blurBg?.url ? mediaUrl(me.blurBg.url) : null],
    ['off', 'Выключен', null],
  ];
  return (
    <div className="field">
      <label>Размытый фон профиля</label>
      <div className="blur-opts">
        {opts.map(([k, l, img]) => {
          const isCustom = k === 'custom';
          const Tag = isCustom ? 'label' : 'button';
          return (
            <Tag key={k} className={`blur-opt ${cur === k ? 'on' : ''}`} onClick={isCustom && me.blurBg?.url ? () => save({ mode: 'custom', url: me.blurBg.url }) : isCustom ? undefined : () => save({ mode: k })}>
              <span className="blur-thumb">{img ? <img src={img} alt="" /> : k === 'off' ? null : <i />}</span>
              <span>{isCustom && progress != null ? `${Math.round(progress * 100)}%` : l}</span>
              {isCustom && <input type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} />}
            </Tag>
          );
        })}
      </div>
      <span className="hint">Картинка сильно размывается и ложится под весь профиль{cur === 'banner' && !me.banner ? ' · сначала добавьте баннер' : ''}</span>
    </div>
  );
}
