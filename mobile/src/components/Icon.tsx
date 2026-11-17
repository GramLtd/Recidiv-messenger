import React from 'react';
import { Text } from 'react-native';

/** Tiny glyph icons (SF-like) so the app has no icon-font dependency. */
const G: Record<string, string> = {
  back: '‹', search: '⌕', plus: '+', send: '➤', close: '✕', more: '•••', heart: '♥', reply: '↩', edit: '✎', trash: '🗑', forward: '↪', copy: '⧉', lock: '🔒', spark: '✦', check: '✓',
};
export const Icon = ({ name, size = 22, color = '#fff' }: { name: keyof typeof G | string; size?: number; color?: string }) => (
  <Text style={{ fontSize: size, color, lineHeight: size * 1.15, fontWeight: '600' }}>{G[name] ?? name}</Text>
);
