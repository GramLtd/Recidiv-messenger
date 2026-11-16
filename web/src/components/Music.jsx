import { useEffect, useRef, useState } from 'react';
import {
  Music2, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Plus, Search, Trash2, ListMusic, Moon, Heart, X, Mic, Check,
} from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload, mediaUrl, API_ORIGIN, getToken } from '../api.js';
import { usePlayer, fmtTime, audioDuration, coverGradient } from '../player.js';
import { Spinner, useAction } from './common.jsx';

export function Cover({ track, size = 48, radius = 12, big }) {
  return (
    <div className="cover" style={{ width: size, height: size, borderRadius: radius, background: track?.cover ? `center/cover url(${mediaUrl(track.cover)})` : coverGradient(track) }}>
      {!track?.cover && <Music2 size={big || typeof size !== 'number' ? 84 : size * 0.45} strokeWidth={big ? 1.6 : 2} color="rgba(255,255,255,.85)" />}
    </div>
  );
}

function Progress() {
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const [drag, setDrag] = useState(null);
  const v = drag ?? time;
  const pct = duration ? (v / duration) * 100 : 0;
  return (
    <div className="progress">
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.5}
        value={v}
        style={{ '--pct': `${pct}%` }}
        onChange={(e) => setDrag(Number(e.target.value))}
        onPointerUp={() => { if (drag != null) seek(drag); setDrag(null); }}
        onKeyUp={() => { if (drag != null) seek(drag); setDrag(null); }}
      />
      <div className="row small muted" style={{ justifyContent: 'space-between' }}>
        <span>{fmtTime(v)}</span>
        <span>{fmtTime(duration)}</span>
      </div>
    </div>
  );
}

const SLEEP_OPTIONS = [0, 15, 30, 45, 60, 90];

/** Heart = "this track plays in my profile". */
function ProfileHeart({ track }) {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const toast = useStore((s) => s.toast);
  const on = track.id && me.profileTrackId === track.id;
  const toggle = async () => {
    if (!track.id) return toast('Сначала добавьте трек в «Мою музыку»');
    try {
      await api('/me/profile-track', { body: { trackId: on ? null : track.id } });
      setMe({ profileTrackId: on ? null : track.id });
      toast(on ? 'Трек убран из профиля' : 'Трек теперь играет в вашем профиле ❤️');
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  return (
    <button className={`heart-btn ${on ? 'on' : ''}`} onClick={toggle} title={on ? 'Убрать из профиля' : 'Поставить в профиль'} key={on ? 'on' : 'off'}>
      <Heart size={26} fill={on ? 'var(--accent)' : 'none'} color={on ? 'var(--accent)' : 'currentColor'} />
    </button>
  );
}

export function NowPlaying() {
  const p = usePlayer();
  const track = p.current();
  const [showQueue, setShowQueue] = useState(true);
  const [sleepMenu, setSleepMenu] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!p.sleepAt) return;
    const t = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, [p.sleepAt]);
  if (!track) return null;
  const upNext = p.upNext();
  const sleepLeft = p.sleepAt ? Math.max(1, Math.round((p.sleepAt - Date.now()) / 60_000)) : 0;
  return (
    <div className="now-playing">
      <div className={`np-cover ${p.playing ? 'playing' : ''}`}>
        <Cover track={track} size="100%" radius={22} big />
      </div>
      <div className="row" style={{ marginTop: 18, alignItems: 'flex-start' }}>
        <div className="grow">
          <div className="np-title ellipsis">{track.title}</div>
          <div className="np-artist ellipsis">{track.artist || 'Неизвестный исполнитель'}</div>
        </div>
        <ProfileHeart track={track} />
      </div>
      <Progress />
      <div className="np-controls">
        <button className={`icon-btn ${p.shuffle ? 'active' : ''}`} onClick={p.toggleShuffle}><Shuffle size={22} /></button>
        <button className="icon-btn big" onClick={p.prev}><SkipBack size={28} fill="currentColor" /></button>
        <button className="play-btn" onClick={p.toggle}>{p.playing ? <Pause size={34} fill="currentColor" /> : <Play size={34} fill="currentColor" style={{ marginLeft: 4 }} />}</button>
        <button className="icon-btn big" onClick={() => p.next()}><SkipForward size={28} fill="currentColor" /></button>
        <button className={`icon-btn ${p.repeat !== 'off' ? 'active' : ''}`} onClick={p.cycleRepeat}>{p.repeat === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}</button>
      </div>
      <div className="row" style={{ gap: 10, marginTop: 6 }}>
        <button className={`glass-btn grow ${showQueue ? 'on' : ''}`} onClick={() => setShowQueue(!showQueue)}>
          <ListMusic size={18} /><span><small>Очередь</small>{upNext.length} {upNext.length === 1 ? 'трек' : 'треков'}</span>
        </button>
        <div style={{ position: 'relative' }} className="grow">
          <button className={`glass-btn ${p.sleepAt ? 'on' : ''}`} style={{ width: '100%' }} onClick={() => setSleepMenu(!sleepMenu)}>
            <Moon size={18} /><span><small>Таймер сна</small>{p.sleepAt ? `${sleepLeft} мин` : 'Выкл'}</span>
          </button>
          {sleepMenu && (
            <div className="ctx-menu" style={{ position: 'absolute', bottom: '110%', right: 0, top: 'auto', left: 'auto' }}>
              {SLEEP_OPTIONS.map((m) => (
                <button key={m} className="menu-item" onClick={() => { p.setSleep(m); setSleepMenu(false); }}>{m ? `${m} минут` : 'Выключить'}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {showQueue && upNext.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 18, justifyContent: 'space-between' }}>
            <b>Далее в очереди</b>
            <span className="small muted">{p.shuffle ? 'перемешано' : 'по порядку'}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            {upNext.slice(0, 30).map((t, i) => (
              <TrackRow key={`${t.url}-${i}`} track={t} onClick={() => p.jumpTo(t)} style={{ animationDelay: `${i * 25}ms` }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const SOURCE_LABEL = { deezer: 'превью 30с', archive: 'Archive', jamendo: 'Jamendo' };

/** Search open sources by name + recognise a song playing nearby (Shazam-like). */
function MusicSearch({ onSaved }) {
  const toast = useStore((s) => s.toast);
  const playQueue = usePlayer((s) => s.playQueue);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [saved, setSaved] = useState({});
  useEffect(() => {
    if (q.trim().length < 2) { setData(null); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      api(`/music/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => setData(r))
        .catch((e) => e.name !== 'AbortError' && toast(e.message, 'error'))
        .finally(() => setLoading(false));
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  const recognize = async () => {
    if (listening) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast('Нет доступа к микрофону', 'error');
    }
    setListening(true);
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      try {
        const fd = new FormData();
        fd.append('file', new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), 'sample.webm');
        const res = await fetch(`${API_ORIGIN}/api/music/recognize`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Ошибка распознавания');
        if (!d.match) toast('Не удалось узнать трек 😕');
        else {
          toast(`Это ${d.match.artist} — ${d.match.title}`);
          setQ(`${d.match.artist} ${d.match.title}`);
        }
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        setListening(false);
      }
    };
    rec.start();
    setTimeout(() => rec.state !== 'inactive' && rec.stop(), 8000);
  };

  const save = async (t) => {
    try {
      const { track } = await api('/music', { body: { url: t.url, title: t.title, artist: t.artist, duration: t.duration, cover: t.cover } });
      setSaved((x) => ({ ...x, [t.id]: true }));
      onSaved?.(track);
      toast('Добавлено в «Мою музыку» 🎵');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const results = data?.results || [];
  return (
    <div className="music-search">
      <div className="row" style={{ gap: 8 }}>
        <div className="search-box grow">
          <Search size={18} />
          <input placeholder="Исполнитель или название трека" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {q && <button className="icon-btn" style={{ position: 'absolute', right: 2, top: 1 }} onClick={() => setQ('')}><X size={18} /></button>}
        </div>
        <button className={`shazam-btn ${listening ? 'on' : ''}`} onClick={recognize} title="Распознать песню рядом">
          <Mic size={22} />
        </button>
      </div>
      {listening && <div className="listening"><span /><span /><span />Слушаю… поднесите телефон к источнику звука</div>}
      {loading && <div className="center" style={{ padding: 24 }}><Spinner /></div>}
      {!loading && data && !results.length && <div className="muted center small" style={{ padding: 24 }}>Ничего не нашли</div>}
      {!loading && results.map((t, i) => (
        <TrackRow
          key={t.id + i}
          track={t}
          style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}
          onClick={() => playQueue(results, i)}
          extra={<button className={`icon-btn ${saved[t.id] ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); if (!saved[t.id]) save(t); }}>{saved[t.id] ? <Check size={18} /> : <Plus size={20} />}</button>}
        />
      ))}
      {!q && (
        <div className="muted small" style={{ padding: '18px 4px', lineHeight: 1.5 }}>
          Ищем по открытым источникам: Internet Archive и Jamendo (полные треки под свободными лицензиями) и Deezer (30-секундные превью).
          Кнопка с микрофоном узнаёт песню, которая играет рядом.
        </div>
      )}
      {data?.sources && (
        <div className="tiny muted center" style={{ marginTop: 10 }}>
          {data.sources.filter((x) => x.enabled).map((x) => `${x.name}${x.ok ? '' : ' (недоступен)'}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

export function TrackRow({ track, onClick, onDelete, style, extra }) {
  const cur = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const active = cur?.url === track.url;
  return (
    <div className={`track-row ${active ? 'active' : ''}`} onClick={onClick} style={style}>
      <div style={{ position: 'relative' }}>
        <Cover track={track} size={48} />
        {active && <div className={`eq ${playing ? 'on' : ''}`}><i /><i /><i /></div>}
      </div>
      <div className="grow">
        <div className="ellipsis bold">{track.title}</div>
        <div className="ellipsis small muted">
          {track.source && <span className={`src-tag ${track.source}`}>{SOURCE_LABEL[track.source]}</span>}
          {track.artist || 'Неизвестный исполнитель'}
        </div>
      </div>
      <span className="small muted">{fmtTime(track.duration)}</span>
      {extra}
      {onDelete && <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onDelete(); }}><Trash2 size={17} /></button>}
    </div>
  );
}

export async function uploadTracks(files, toast, onProgress) {
  const added = [];
  for (const f of files) {
    if (!f.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(f.name)) continue;
    try {
      const duration = await audioDuration(f);
      const up = await upload(f, onProgress);
      const { track } = await api('/music', { body: { url: up.url, fileName: f.name, duration } });
      added.push(track);
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  return added;
}

export function MusicPage() {
  const toast = useStore((s) => s.toast);
  const playQueue = usePlayer((s) => s.playQueue);
  const current = usePlayer((s) => s.current());
  const [tracks, setTracks] = useState(null);
  const [q, setQ] = useState('');
  const [progress, setProgress] = useState(null);
  const [mode, setMode] = useState('library');
  const fileRef = useRef();
  const [run] = useAction();

  const bodyRef = useRef();
  useEffect(() => { api('/music').then((r) => setTracks(r.tracks)).catch(() => setTracks([])); }, []);
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }, [current?.url]);

  const add = async (files) => {
    setProgress(0);
    const added = await uploadTracks(files, toast, setProgress);
    setProgress(null);
    if (added.length) {
      setTracks((t) => [...added.reverse(), ...(t || [])]);
      toast(`Добавлено треков: ${added.length}`);
    }
  };
  const del = (t) => confirm(`Удалить «${t.title}»?`) && run(async () => { await api.del(`/music/${t.id}`); setTracks((x) => x.filter((y) => y.id !== t.id)); });

  const ql = q.trim().toLowerCase();
  const list = (tracks || []).filter((t) => !ql || t.title.toLowerCase().includes(ql) || t.artist?.toLowerCase().includes(ql));

  return (
    <div className="page">
      <div className="page-head">
        <h3>Музыка</h3>
        <button className="icon-btn" onClick={() => fileRef.current.click()} title="Загрузить треки"><Plus size={24} /></button>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.m4a,.flac,.ogg,.wav" multiple hidden onChange={(e) => { add([...e.target.files]); e.target.value = ''; }} />
      </div>
      <div className="page-body" ref={bodyRef}>
        {progress !== null && <div className="upload-progress" style={{ width: `${progress * 100}%`, marginBottom: 10 }} />}
        {current && <NowPlaying />}
        <div className="tabs" style={{ marginTop: current ? 22 : 4 }}>
          <button className={mode === 'library' ? 'on' : ''} onClick={() => setMode('library')}>Моя музыка</button>
          <button className={mode === 'search' ? 'on' : ''} onClick={() => setMode('search')}><Search size={14} style={{ verticalAlign: -2 }} /> Поиск</button>
        </div>
        {mode === 'search' ? <MusicSearch onSaved={(t) => setTracks((x) => [t, ...(x || [])])} /> : <>
        {current || tracks?.length ? null : (
          <div className="music-empty">
            <div className="cover" style={{ width: 120, height: 120, borderRadius: 28, background: coverGradient({ title: 'r' }) }}><Music2 size={52} color="#fff" /></div>
            <div className="bold" style={{ fontSize: '1.1em' }}>Ваша музыка</div>
            <div className="small muted" style={{ textAlign: 'center' }}>Загружайте свои треки (mp3, m4a, flac…) и слушайте их прямо в Recidivist.<br />Названия берутся из имени файла «Исполнитель - Трек».</div>
            <button className="btn" onClick={() => fileRef.current.click()}><Plus size={18} /> Загрузить треки</button>
          </div>
        )}
        {tracks?.length > 0 && (
          <>
            <div className="row" style={{ marginTop: 6, marginBottom: 8 }}>
              <b className="grow">Мои треки · {tracks.length}</b>
              <button className="btn sm secondary" onClick={() => playQueue(list, 0)}><Play size={15} fill="currentColor" /> Слушать</button>
              <button className="btn sm secondary" onClick={() => { usePlayer.setState({ shuffle: true }); playQueue(list, Math.floor(Math.random() * list.length)); }}><Shuffle size={15} /></button>
            </div>
            <div className="search-box" style={{ marginBottom: 8 }}>
              <Search size={18} />
              <input placeholder="Поиск по трекам" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button className="icon-btn" style={{ position: 'absolute', right: 2, top: 1 }} onClick={() => setQ('')}><X size={18} /></button>}
            </div>
            {list.map((t, i) => <TrackRow key={t.id} track={t} onClick={() => playQueue(list, i)} onDelete={() => del(t)} style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }} />)}
          </>
        )}
        {tracks === null && <div className="center" style={{ padding: 30 }}><Spinner /></div>}
        </>}
      </div>
    </div>
  );
}

/** Small bar above the bottom navigation while something is playing. */
export function MiniPlayer({ onOpen }) {
  const track = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const { toggle, next, stop } = usePlayer.getState();
  if (!track) return null;
  return (
    <div className="mini-player" onClick={onOpen}>
      <div className="mini-progress" style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} />
      <Cover track={track} size={40} radius={10} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis bold small">{track.title}</div>
        <div className="ellipsis tiny muted">{track.artist || 'Неизвестный исполнитель'}</div>
      </div>
      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); toggle(); }}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</button>
      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); next(); }}><SkipForward size={20} fill="currentColor" /></button>
      <button className="icon-btn" onClick={(e) => { e.stopPropagation(); stop(); }}><X size={18} /></button>
    </div>
  );
}

/** Audio file inside a chat bubble: plays through the global player, can be saved to "My music". */
export function AudioMessage({ media }) {
  const toast = useStore((s) => s.toast);
  const playTrack = usePlayer((s) => s.playTrack);
  const cur = usePlayer((s) => s.current());
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const track = { url: media.url, title: media.title || media.name || 'Аудио', artist: media.artist || '', duration: media.duration || 0 };
  const active = cur?.url === track.url;
  const save = async (e) => {
    e.stopPropagation();
    try {
      await api('/music', { body: { url: media.url, title: track.title, artist: track.artist, duration: track.duration, fileName: media.name } });
      toast('Добавлено в «Мою музыку» 🎵');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <div className="audio-msg" onClick={() => playTrack(track)}>
      <button className="audio-play">{active && playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />}</button>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ellipsis bold">{track.title}</div>
        <div className="ellipsis small muted">{active ? `${fmtTime(time)} / ${fmtTime(track.duration)}` : `${track.artist ? `${track.artist} · ` : ''}${fmtTime(track.duration)}`}</div>
      </div>
      <button className="icon-btn" title="В мою музыку" onClick={save}><Plus size={20} /></button>
    </div>
  );
}
