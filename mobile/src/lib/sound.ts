import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import { kv } from './db';

/** The web client's send sound (/sounds/sent.mp3), preloaded once. */
let p: AudioPlayer | null = null;
export function playSend() {
  if (kv.get<any>('notify', {}).sendSound === false) return;
  try {
    if (!p) p = createAudioPlayer(require('../../assets/sent.mp3'));
    p.volume = 0.6;
    p.seekTo(0);
    p.play();
  } catch {}
}
