// Tiny synthesized UI sounds (no audio files): a soft "swoosh" when a message is sent
// and a gentle two-note "tick" for incoming messages in the open chat.
import { loadTheme } from './theme.js';

let ctx;
function audio() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return null;
  if (!ctx) ctx = new C();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function playSend() {
  if (loadTheme().sendSound === false) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  // swoosh: band-passed noise sweeping upwards
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.22);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.18);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.22);
  // pop at the end
  const o = ac.createOscillator();
  const og = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(700, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(1400, t + 0.19);
  og.gain.setValueAtTime(0.0001, t + 0.12);
  og.gain.exponentialRampToValueAtTime(0.12, t + 0.14);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(og).connect(ac.destination);
  o.start(t + 0.12);
  o.stop(t + 0.26);
}

export function playIncoming() {
  if (loadTheme().inSound === false) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [[880, 0], [1320, 0.08]].forEach(([f, d]) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
    o.connect(g).connect(ac.destination);
    o.start(t + d);
    o.stop(t + d + 0.18);
  });
}
