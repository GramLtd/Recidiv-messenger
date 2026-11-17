import { createAudioPlayer, setAudioModeAsync, AudioPlayer, AudioStatus } from 'expo-audio';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { mediaUrl } from './config';
import { api } from './api';

/*
 * One shared player for the whole app (same model as the web's player.js): a queue with its own play
 * order (shuffle), repeat off/all/one, seek, sleep timer, mini-player state and lock-screen "Now Playing".
 */
export type Track = { id?: number; url: string; stream?: string; title?: string; artist?: string; duration?: number; cover?: string | null; source?: string };

let p: AudioPlayer | null = null;
let sleepTimer: any = null;
let loadSeq = 0;

const shuffled = (n: number, keep: number) => {
  const rest = [...Array(n).keys()].filter((i) => i !== keep);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return [keep, ...rest];
};

function ensure(): AudioPlayer {
  if (p) return p;
  setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' }).catch(() => {});
  p = createAudioPlayer(null, { updateInterval: 250 });
  p.addListener('playbackStatusUpdate', (s: AudioStatus) => {
    const st = usePlayer.getState();
    const patch: Partial<S> = {};
    if (Math.abs((s.currentTime || 0) - st.time) >= 0.2) patch.time = s.currentTime || 0;
    if (s.duration && Math.abs(s.duration - st.duration) > 0.5) patch.duration = s.duration;
    if (s.playing !== st.playing) patch.playing = s.playing;
    if (s.isBuffering !== st.buffering) patch.buffering = s.isBuffering && !s.playing;
    if (Object.keys(patch).length) usePlayer.setState(patch);
    if (s.didJustFinish) st.next(true);
  });
  return p;
}

function lockScreen(t: Track) {
  if (!p || Platform.OS === 'web') return;
  try {
    p.setActiveForLockScreen(true, {
      title: t.title || 'Без названия',
      artist: t.artist || 'Recidivist',
      artworkUrl: t.cover ? mediaUrl(t.cover) : undefined,
    }, { showSeekForward: true, showSeekBackward: true });
  } catch {}
}

type S = {
  queue: Track[]; order: number[]; pos: number;
  playing: boolean; buffering: boolean; time: number; duration: number;
  shuffle: boolean; repeat: 'off' | 'all' | 'one'; sleepAt: number | null;
  current: Track | null;
  upNext: () => Track[];
  playQueue: (tracks: Track[], start?: number) => void;
  playTrack: (t: Track) => void;
  toggle: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  jumpTo: (t: Track) => void;
  seek: (sec: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setSleep: (min: number) => void;
  stop: () => void;
  _load: (autoplay: boolean) => Promise<void>;
};

const cur = (s: Pick<S, 'queue' | 'order' | 'pos'>) => (s.pos >= 0 ? s.queue[s.order[s.pos]] || null : null);

export const usePlayer = create<S>((set, get) => ({
  queue: [], order: [], pos: -1,
  playing: false, buffering: false, time: 0, duration: 0,
  shuffle: false, repeat: 'off', sleepAt: null,
  current: null,

  upNext: () => { const { queue, order, pos } = get(); return order.slice(pos + 1).map((i) => queue[i]); },

  playQueue: (tracks, start = 0) => {
    if (!tracks.length) return;
    const sh = get().shuffle;
    const order = sh ? shuffled(tracks.length, start) : [...tracks.keys()];
    const next = { queue: tracks, order, pos: sh ? 0 : start };
    set({ ...next, current: cur(next) });
    get()._load(true);
  },
  playTrack: (t) => {
    const c = get().current;
    if (c && c.url === t.url) return get().toggle();
    get().playQueue([t], 0);
  },
  _load: async (autoplay) => {
    const t = get().current;
    if (!t) return;
    const seq = ++loadSeq;
    const pl = ensure();
    set({ time: 0, duration: t.duration || 0, buffering: true });
    let src = t.stream || t.url;
    // saved Deezer previews expire — resolve a fresh link right before playing (as on the web)
    if (src.startsWith('deezer:')) {
      try { src = (await api(`/music/resolve?src=${encodeURIComponent(src)}`)).url; } catch { set({ playing: false, buffering: false }); return; }
      if (seq !== loadSeq) return;
    }
    pl.replace({ uri: mediaUrl(src) });
    if (autoplay) { pl.play(); set({ playing: true }); }
    lockScreen(t);
  },
  toggle: () => {
    if (!p || !get().current) return;
    if (p.playing) { p.pause(); set({ playing: false }); } else { p.play(); set({ playing: true }); }
  },
  next: (auto = false) => {
    const { pos, order, repeat } = get();
    if (!order.length) return;
    if (auto && repeat === 'one') { p?.seekTo(0); p?.play(); return; }
    let np = pos;
    if (pos + 1 < order.length) np = pos + 1;
    else if (repeat === 'all' || !auto) np = 0;
    else { p?.pause(); p?.seekTo(0); set({ playing: false, time: 0 }); return; }
    set({ pos: np, current: cur({ ...get(), pos: np }) });
    get()._load(true);
  },
  prev: () => {
    if (p && (p.currentTime || 0) > 3) { p.seekTo(0); set({ time: 0 }); return; }
    const { pos, order } = get();
    if (!order.length) return;
    const np = pos > 0 ? pos - 1 : order.length - 1;
    set({ pos: np, current: cur({ ...get(), pos: np }) });
    get()._load(true);
  },
  jumpTo: (t) => {
    const { queue, order } = get();
    const at = order.indexOf(queue.indexOf(t));
    if (at < 0) return;
    set({ pos: at, current: cur({ ...get(), pos: at }) });
    get()._load(true);
  },
  seek: (sec) => { if (p && Number.isFinite(sec)) { p.seekTo(Math.max(0, sec)); set({ time: sec }); } },
  toggleShuffle: () => {
    const { shuffle, queue, order, pos } = get();
    if (!queue.length) return set({ shuffle: !shuffle });
    const idx = order[pos];
    if (!shuffle) set({ shuffle: true, order: shuffled(queue.length, idx), pos: 0 });
    else set({ shuffle: false, order: [...queue.keys()], pos: idx });
  },
  cycleRepeat: () => set({ repeat: ({ off: 'all', all: 'one', one: 'off' } as const)[get().repeat] }),
  setSleep: (min) => {
    clearTimeout(sleepTimer);
    if (!min) return set({ sleepAt: null });
    sleepTimer = setTimeout(() => { p?.pause(); set({ sleepAt: null, playing: false }); }, min * 60_000);
    set({ sleepAt: Date.now() + min * 60_000 });
  },
  stop: () => {
    loadSeq++;
    if (p) { p.pause(); try { p.clearLockScreenControls(); } catch {} }
    set({ queue: [], order: [], pos: -1, current: null, playing: false, time: 0, duration: 0 });
  },
}));

export const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

export function titleFromFile(name = '') {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base || 'Без названия' };
}

const COVER_GRADIENTS: [string, string][] = [
  ['#7a4a1f', '#3d3d1f'], ['#5a1f7a', '#1f2a5a'], ['#7a1f2e', '#2a0a14'], ['#1f5a7a', '#0a1f2a'],
  ['#2e7a1f', '#14290a'], ['#7a6a1f', '#2a240a'], ['#1f7a6a', '#0a2a24'], ['#4a1f7a', '#7a1f5a'],
];
export const coverColors = (t?: Track | null): [string, string] => {
  const k = [...(String(t?.title || '') + (t?.artist || ''))].reduce((a, c) => a + c.charCodeAt(0), 0);
  return COVER_GRADIENTS[k % COVER_GRADIENTS.length];
};
