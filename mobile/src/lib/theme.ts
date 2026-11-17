/** Same palette as the web client (OLED theme, red accent). */
export const C = {
  bg: '#000000', bg2: '#0b0b0b', bg3: '#151515', group: '#111113', hover: '#141414',
  text: '#f2f2f2', text2: '#8c8c8c', text3: '#5c5c5c', border: '#1c1c1c',
  accent: '#ff2d3d', accentRgb: '255,45,61',
  bubbleIn: '#161616', bubbleOut: '#3d0b0f', bubbleOutMeta: '#c55a63', inputBg: '#121212',
  green: '#2ecc71', online: '#3be38a', danger: '#ff453a',
  glass: 'rgba(255,255,255,0.09)', glassEdge: 'rgba(255,255,255,0.22)', glassHi: 'rgba(255,255,255,0.16)',
};
export const BASE = 15; // web --font-size
export const spring = { damping: 18, stiffness: 220, mass: 0.9 };
/** CSS var(--spring) = cubic-bezier(.3,1.5,.45,1) ≈ a bouncy spring */
export const webSpring = { damping: 11, stiffness: 170, mass: 0.8 };
