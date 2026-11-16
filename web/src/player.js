import { create } from 'zustand';
import { mediaUrl, api } from './api.js';

/** One <audio> for the whole app, so music keeps playing while you switch chats and tabs. */
const audio = typeof Audio !== 'undefined' ? new Audio() : null;
if (audio) audio.preload = 'metadata';

let sleepTimer = null;

const shuffled = (n, keep) => {
  const rest = [...Array(n).keys()].filter((i) => i !== keep);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [keep, ...rest];
};

export const usePlayer = create((set, get) => ({
  queue: [], // tracks: { id?, url, title, artist, duration, cover }
  order: [], // play order (indices into queue), differs from natural order when shuffling
  pos: -1, // position in `order`
  playing: false,
  time: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off', // off | all | one
  sleepAt: null,

  current() {
    const { queue, order, pos } = get();
    return pos >= 0 ? queue[order[pos]] : null;
  },
  upNext() {
    const { queue, order, pos } = get();
    return order.slice(pos + 1).map((i) => queue[i]);
  },

  playQueue(tracks, start = 0) {
    const order = get().shuffle ? shuffled(tracks.length, start) : [...tracks.keys()];
    set({ queue: tracks, order, pos: get().shuffle ? 0 : start });
    get()._load(true);
  },
  playTrack(track) {
    const cur = get().current();
    if (cur && cur.url === track.url) return get().toggle();
    get().playQueue([track], 0);
  },
  async _load(autoplay) {
    const t = get().current();
    if (!audio || !t) return;
    set({ time: 0, duration: t.duration || 0 });
    let src = t.stream || t.url;
    // Saved Deezer previews expire — get a fresh link right before playing.
    if (src.startsWith('deezer:')) {
      try {
        src = (await api(`/music/resolve?src=${encodeURIComponent(src)}`)).url;
      } catch {
        set({ playing: false });
        return;
      }
      if (get().current() !== t) return;
    }
    audio.src = mediaUrl(src);
    if (autoplay) audio.play().catch(() => set({ playing: false }));
    updateMediaSession(t);
  },
  toggle() {
    if (!audio || !get().current()) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  },
  next(auto = false) {
    const { pos, order, repeat } = get();
    if (auto && repeat === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (pos + 1 < order.length) set({ pos: pos + 1 });
    else if (repeat === 'all' || !auto) set({ pos: 0 });
    else {
      set({ playing: false });
      return;
    }
    get()._load(true);
  },
  prev() {
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const { pos, order } = get();
    set({ pos: pos > 0 ? pos - 1 : order.length - 1 });
    get()._load(true);
  },
  jumpTo(track) {
    const { queue, order } = get();
    const qi = queue.indexOf(track);
    const p = order.indexOf(qi);
    if (p >= 0) {
      set({ pos: p });
      get()._load(true);
    }
  },
  seek(t) {
    if (audio && Number.isFinite(t)) audio.currentTime = t;
  },
  toggleShuffle() {
    const { shuffle, queue, order, pos } = get();
    const curIdx = order[pos];
    if (!queue.length) return set({ shuffle: !shuffle });
    if (!shuffle) set({ shuffle: true, order: shuffled(queue.length, curIdx), pos: 0 });
    else set({ shuffle: false, order: [...queue.keys()], pos: curIdx });
  },
  cycleRepeat() {
    set({ repeat: { off: 'all', all: 'one', one: 'off' }[get().repeat] });
  },
  setSleep(minutes) {
    clearTimeout(sleepTimer);
    if (!minutes) return set({ sleepAt: null });
    const at = Date.now() + minutes * 60_000;
    sleepTimer = setTimeout(() => {
      audio?.pause();
      set({ sleepAt: null });
    }, minutes * 60_000);
    set({ sleepAt: at });
  },
  stop() {
    audio?.pause();
    set({ queue: [], order: [], pos: -1, playing: false, time: 0 });
  },
}));

if (audio) {
  let last = 0;
  audio.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - last > 250) {
      last = now;
      usePlayer.setState({ time: audio.currentTime });
    }
  });
  audio.addEventListener('loadedmetadata', () => usePlayer.setState({ duration: audio.duration || 0 }));
  audio.addEventListener('play', () => usePlayer.setState({ playing: true }));
  audio.addEventListener('pause', () => usePlayer.setState({ playing: false }));
  audio.addEventListener('ended', () => usePlayer.getState().next(true));
}

function updateMediaSession(t) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || 'Без названия',
      artist: t.artist || 'Recidivist',
      artwork: t.cover
        ? [{ src: new URL(mediaUrl(t.cover), location.href).href, sizes: '512x512' }]
        : [
            { src: `${location.origin}/icon-512.png`, sizes: '512x512', type: 'image/png' },
            { src: `${location.origin}/icon-192.png`, sizes: '192x192', type: 'image/png' },
          ],
    });
    const p = usePlayer.getState();
    navigator.mediaSession.setActionHandler('play', () => audio.play());
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('nexttrack', () => p.next());
    navigator.mediaSession.setActionHandler('previoustrack', () => p.prev());
    navigator.mediaSession.setActionHandler('seekto', (e) => p.seek(e.seekTime));
  } catch {}
}

export const fmtTime = (s) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** Read duration of a local audio file before uploading it. */
export function audioDuration(file) {
  return new Promise((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (d) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? Math.round(d) : 0);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(a.duration);
    a.onerror = () => finish(0);
    setTimeout(() => finish(0), 4000); // some formats never report metadata
    a.src = url;
  });
}

export function titleFromFile(name = '') {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base || 'Без названия' };
}

const COVER_GRADIENTS = [
  ['#7a4a1f', '#3d3d1f'], ['#5a1f7a', '#1f2a5a'], ['#7a1f2e', '#2a0a14'], ['#1f5a7a', '#0a1f2a'],
  ['#2e7a1f', '#14290a'], ['#7a6a1f', '#2a240a'], ['#1f7a6a', '#0a2a24'], ['#4a1f7a', '#7a1f5a'],
];
export const coverGradient = (t) => {
  const k = [...String(t?.title || '') + (t?.artist || '')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const [a, b] = COVER_GRADIENTS[k % COVER_GRADIENTS.length];
  return `linear-gradient(145deg, ${a}, ${b})`;
};
