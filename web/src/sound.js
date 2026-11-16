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

/** Soft, short "bloop" — a rounded sine glide with a quick fade, quiet by design. */
export function playSend() {
  if (loadTheme().sendSound === false) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.005;
  const out = ac.createGain();
  out.gain.value = 0.9;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  out.connect(lp).connect(ac.destination);
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(760, t + 0.07);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.07, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.15);
  // a faint airy tail so it doesn't sound like a beep
  const n = ac.createBufferSource();
  n.buffer = noiseBuffer(ac, 0.08);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.8;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.012, t + 0.015);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  n.connect(bp).connect(ng).connect(out);
  n.start(t);
  n.stop(t + 0.09);
}

export function playIncoming() {
  if (loadTheme().inSound === false) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  [[880, 0], [1320, 0.08]].forEach(([f, d]) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.045, t + d + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
    o.connect(g).connect(ac.destination);
    o.start(t + d);
    o.stop(t + d + 0.18);
  });
}
