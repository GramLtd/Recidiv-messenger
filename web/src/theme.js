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

export const DEFAULT_THEME = { bg: 'oled', accent: '#ff2d3d', fontSize: 15, bubbleRadius: 16, font: 'system' };

// Interface fonts (Google Fonts, Cyrillic). `premium` ones are unlocked by Recidivist Premium.
export const FONTS = [
  { id: 'system', name: 'Системный', css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
  { id: 'rubik', name: 'Rubik', family: 'Rubik:wght@400;500;600;700;800;900' },
  { id: 'inter', name: 'Inter', family: 'Inter:wght@400;500;600;700;800;900' },
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat:wght@400;500;600;700;800;900' },
  { id: 'manrope', name: 'Manrope', family: 'Manrope:wght@400;500;600;700;800' },
  { id: 'nunito', name: 'Nunito', family: 'Nunito:wght@400;600;700;800;900' },
  { id: 'unbounded', name: 'Unbounded', family: 'Unbounded:wght@400;500;600;700;800', premium: true },
  { id: 'pixel', name: 'Minecraft (пиксели)', family: 'Press Start 2P', premium: true, scale: 0.72 },
  { id: 'mono', name: 'JetBrains Mono', family: 'JetBrains Mono:wght@400;600;700;800', premium: true },
];
const fontName = (f) => (f.family || '').split(':')[0];
function loadFont(f) {
  if (!f.family) return;
  const id = `font-${f.id}`;
  if (document.getElementById(id)) return;
  const l = document.createElement('link');
  l.id = id;
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+').replace(/%3A/g, ':').replace(/%3B/g, ';').replace(/%40/g, '@')}&display=swap&subset=cyrillic`;
  document.head.appendChild(l);
}

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
  root.classList.toggle('perf', !!t.perf);
  const [r, g, b] = hexToRgb(t.accent);
  root.style.setProperty('--accent', t.accent);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  const f = FONTS.find((x) => x.id === t.font) || FONTS[0];
  loadFont(f);
  root.style.setProperty('--font-family', f.css || `'${fontName(f)}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`);
  root.style.setProperty('--font-size', `${Math.round(t.fontSize * (f.scale || 1))}px`);
  root.style.setProperty('--bubble-radius', `${t.bubbleRadius}px`);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#000');
}

export function saveTheme(t) {
  localStorage.setItem(KEY, JSON.stringify(t));
  applyTheme(t);
}
