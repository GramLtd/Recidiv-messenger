const KEY = 'recidivist.theme';

export const BACKGROUNDS = [
  { id: 'oled', name: 'OLED чёрный' },
  { id: 'night', name: 'Ночь' },
  { id: 'graphite', name: 'Графит' },
  { id: 'light', name: 'Светлая' },
];

export const ACCENTS = [
  { id: 'red', color: '#ff2d3d', name: 'Красный' },
  { id: 'crimson', color: '#c8102e', name: 'Бордо' },
  { id: 'orange', color: '#ff7a1a', name: 'Оранжевый' },
  { id: 'gold', color: '#f5b400', name: 'Золото' },
  { id: 'green', color: '#2ecc71', name: 'Зелёный' },
  { id: 'cyan', color: '#1fb6ff', name: 'Голубой' },
  { id: 'blue', color: '#3a7bfd', name: 'Синий' },
  { id: 'violet', color: '#9b5cff', name: 'Фиолетовый' },
  { id: 'pink', color: '#ff3d9a', name: 'Розовый' },
];

export const DEFAULT_THEME = { bg: 'oled', accent: '#ff2d3d', fontSize: 15, bubbleRadius: 16 };

export function loadTheme() {
  try {
    return { ...DEFAULT_THEME, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULT_THEME;
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function applyTheme(t) {
  const root = document.documentElement;
  root.dataset.bg = t.bg;
  const [r, g, b] = hexToRgb(t.accent);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.style.setProperty('--font-size', `${t.fontSize}px`);
  root.style.setProperty('--bubble-radius', `${t.bubbleRadius}px`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#000');
}

export function saveTheme(t) {
  localStorage.setItem(KEY, JSON.stringify(t));
  applyTheme(t);
}
