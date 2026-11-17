import { useEffect, useRef, useState } from 'react';
import { Search, Clock, Upload, Smile, Sticker, Film } from 'lucide-react';
import { api, upload, mediaUrl } from '../api.js';
import { useStore } from '../store.js';
import { Spinner } from './common.jsx';
import { TgsPlayer } from './Tgs.jsx';

const RECENT_ST = 'recidivist.recentStickers';
const RECENT_GIF = 'recidivist.recentGifs';
const readList = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const pushList = (k, item, key = 'url') => {
  try { localStorage.setItem(k, JSON.stringify([item, ...readList(k).filter((x) => x[key] !== item[key])].slice(0, 24))); } catch {}
};

let packsCache = null;

/** Emoji / Stickers / GIF panel above the composer. */
export function MediaPanel({ emojis, onEmoji, onSend, onClose }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('recidivist.mediaTab') || 'emoji'; } catch { return 'emoji'; } });
  const setT = (t) => { setTab(t); try { localStorage.setItem('recidivist.mediaTab', t); } catch {} };
  return (
    <div className="media-panel" onMouseLeave={onClose}>
      <div className="mp-body">
        {tab === 'emoji' && <div className="mp-emoji">{emojis.map((e, i) => <button key={i} onClick={() => onEmoji(e)}>{e}</button>)}</div>}
        {tab === 'stickers' && <StickerTab onSend={onSend} />}
        {tab === 'gif' && <GifTab onSend={onSend} />}
      </div>
      <div className="mp-tabs">
        {[['emoji', Smile, 'Эмодзи'], ['stickers', Sticker, 'Стикеры'], ['gif', Film, 'GIF']].map(([k, I, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setT(k)}><I size={18} /> {l}</button>
        ))}
      </div>
    </div>
  );
}

function StickerTab({ onSend }) {
  const [packs, setPacks] = useState(packsCache);
  const [pack, setPack] = useState('recent');
  const recent = readList(RECENT_ST);
  useEffect(() => { if (!packsCache) api('/stickers/packs').then((r) => { packsCache = r.packs; setPacks(r.packs); }).catch(() => setPacks([])); }, []);
  useEffect(() => { if (packs && pack === 'recent' && !recent.length && packs[0]) setPack(packs[0].id); }, [packs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!packs) return <div className="center" style={{ padding: 30 }}><Spinner /></div>;
  const list = pack === 'recent' ? recent : packs.find((p) => p.id === pack)?.stickers || [];
  const send = (s) => { pushList(RECENT_ST, s); onSend({ kind: 'sticker', url: s.url, animation: s.animation }); };
  return (
    <>
      <div className="mp-packs">
        {recent.length > 0 && <button className={pack === 'recent' ? 'on' : ''} onClick={() => setPack('recent')} title="Недавние"><Clock size={18} /></button>}
        {packs.map((p) => <button key={p.id} className={pack === p.id ? 'on' : ''} onClick={() => setPack(p.id)} title={p.name}><img src={p.stickers[0]?.url} alt="" /></button>)}
      </div>
      <div className="mp-grid stickers">
        {list.map((s) => <button key={s.url} onClick={() => send(s)} title={s.title || ''}><img src={s.url} alt="" loading="lazy" /></button>)}
      </div>
    </>
  );
}

function GifTab({ onSend }) {
  const toast = useStore((s) => s.toast);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const recent = readList(RECENT_GIF);
  const fileRef = useRef();
  useEffect(() => {
    const t = setTimeout(() => {
      api(q.trim() ? `/gifs/search?q=${encodeURIComponent(q.trim())}` : '/gifs/trending').then(setData).catch(() => setData({ gifs: [], error: true }));
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q]);
  const send = (g) => { pushList(RECENT_GIF, g); onSend({ kind: 'gif', url: g.url, preview: g.preview, width: g.width, height: g.height }); };
  const uploadGif = async (f) => {
    if (!f) return;
    if (!/^(image\/gif|video\/mp4|video\/webm)$/.test(f.type)) return toast('Выберите GIF или короткое видео MP4', 'error');
    setBusy(true);
    try { const m = await upload(f); send({ url: m.url }); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const gifs = !q && recent.length ? [...recent, ...(data?.gifs || []).filter((g) => !recent.some((r) => r.url === g.url))] : data?.gifs || [];
  return (
    <>
      <div className="mp-search">
        <Search size={16} />
        <input placeholder={data?.disabled ? 'Поиск GIF выключен' : 'Поиск GIF'} value={q} onChange={(e) => setQ(e.target.value)} disabled={data?.disabled} />
        <button className="mp-up" disabled={busy} onClick={() => fileRef.current.click()} title="Загрузить GIF"><Upload size={16} /></button>
        <input ref={fileRef} type="file" accept="image/gif,video/mp4,video/webm" hidden onChange={(e) => { uploadGif(e.target.files[0]); e.target.value = ''; }} />
      </div>
      {!data ? <div className="center" style={{ padding: 30 }}><Spinner /></div> : (
        <div className="mp-grid gifs">
          {gifs.map((g) => (
            <button key={g.url} onClick={() => send(g)}>
              {/\.(gif|webp)$/i.test(g.url) ? <img src={mediaUrl(g.preview || g.url)} alt="" loading="lazy" /> : <video src={mediaUrl(g.preview || g.url)} autoPlay muted loop playsInline />}
            </button>
          ))}
          {!gifs.length && <div className="muted small center" style={{ gridColumn: '1 / -1', padding: 24 }}>{data.disabled ? 'Загрузите свой GIF кнопкой справа. Поиск включается в админке (ключ Tenor).' : data.error ? 'Не удалось загрузить GIF' : 'Ничего не найдено'}</div>}
        </div>
      )}
    </>
  );
}

/** Sticker / GIF rendering inside a message. */
export function StickerView({ media }) {
  const [play, setPlay] = useState(true);
  return (
    <div className="msg-sticker" onClick={() => setPlay(true)}>
      {media.animation && play ? <TgsPlayer src={media.animation} poster={media.url} size={170} loop={false} onDone={() => setPlay(false)} /> : <img src={mediaUrl(media.url)} alt="" draggable={false} />}
    </div>
  );
}
export function GifView({ media }) {
  const ratio = media.width && media.height ? media.width / media.height : 1.3;
  return (
    <div className="msg-gif" style={{ aspectRatio: ratio }}>
      {/\.(gif|webp)$/i.test(media.url) ? <img src={mediaUrl(media.url)} alt="GIF" /> : <video src={mediaUrl(media.url)} autoPlay muted loop playsInline />}
      <span className="gif-tag">GIF</span>
    </div>
  );
}
