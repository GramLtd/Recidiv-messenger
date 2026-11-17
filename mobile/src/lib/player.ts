import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import { create } from 'zustand';
import { mediaUrl } from './config';

/** One shared music player (profile tracks), plays in background like the web mini-player. */
let p: AudioPlayer | null = null;
let timer: any = null;
type S = { current: any | null; playing: boolean; time: number; playTrack: (t: any) => void };
export const usePlayer = create<S>((set, get) => ({
  current: null, playing: false, time: 0,
  playTrack: (t) => {
    if (!p) { p = createAudioPlayer(null); setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true }).catch(() => {}); }
    const cur = get().current;
    if (cur?.url === t.url) {
      if (p.playing) { p.pause(); set({ playing: false }); } else { p.play(); set({ playing: true }); }
      return;
    }
    p.replace({ uri: mediaUrl(t.url) });
    p.play();
    set({ current: t, playing: true, time: 0 });
    clearInterval(timer);
    timer = setInterval(() => { if (p) set({ time: Math.floor(p.currentTime || 0), playing: p.playing }); }, 500);
  },
}));
export const fmtTime = (s: number) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`;
