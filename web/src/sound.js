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

// Send sound: /sounds/sent.mp3, decoded once and played through Web Audio (instant, works on iOS).
let sentBuf = null;
let sentLoading = null;
function loadSent(ac) {
  if (sentBuf || sentLoading) return sentLoading;
  sentLoading = fetch('/sounds/sent.mp3')
    .then((r) => r.arrayBuffer())
    .then((b) => new Promise((res, rej) => ac.decodeAudioData(b, res, rej)))
    .then((buf) => { sentBuf = buf; })
    .catch(() => { sentLoading = null; });
  return sentLoading;
}
// warm up on the first tap so the very first message already has sound
document.addEventListener('pointerdown', () => { const ac = audio(); if (ac) loadSent(ac); }, { once: true, passive: true });

export function playSend() {
  if (loadTheme().sendSound === false) return;
  const ac = audio();
  if (!ac) return;
  const play = () => {
    if (!sentBuf) return;
    const src = ac.createBufferSource();
    src.buffer = sentBuf;
    src.connect(ac.destination);
    src.start();
  };
  if (sentBuf) play();
  else loadSent(ac)?.then(play);
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
