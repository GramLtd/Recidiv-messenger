import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { mediaUrl } from '../lib/config';
import { Radial, emoji3d, shade } from './ui';

// Telegram-like pattern (same as web GiftArt): symbols in concentric rings, smaller towards the edge.
const RINGS = [{ r: 30, n: 6, s: 10, o: 0.5 }, { r: 41, n: 10, s: 8.5, o: 0.42 }, { r: 51, n: 14, s: 7, o: 0.32 }, { r: 60, n: 18, s: 6, o: 0.22 }];
const PATTERN = RINGS.flatMap((ring, ri) => Array.from({ length: ring.n }, (_, i) => {
  const a = (i / ring.n) * Math.PI * 2 + ri * 0.4;
  return { x: 50 + Math.cos(a) * ring.r, y: 50 + Math.sin(a) * ring.r, s: ring.s, o: ring.o };
}));

/** Grid tiles: the three inner rings only (30 symbols instead of 48) — keeps long gift lists smooth. */
const PATTERN_LIGHT = PATTERN.slice(0, 30);

const hexMix = (hex: string, k: number) => (hex?.startsWith('#') ? shade(hex, k) : '#000');

export function GiftModel({ gift, model, size }: { gift?: any; model?: any; size: number | string }) {
  const src = model?.image || gift?.image || (model?.emoji || gift?.emoji ? emoji3d(model?.emoji || gift?.emoji) : null);
  if (!src) return null;
  return <Image source={{ uri: mediaUrl(src) }} style={{ width: size as any, height: size as any }} contentFit="contain" cachePolicy="memory-disk" />;
}

/** Collectible: radial backdrop + symbol pattern + model. */
export function CollectibleArt({ col, style, pattern = true, modelScale = 0.6, light }: { col: any; style?: StyleProp<ViewStyle>; pattern?: boolean; modelScale?: number; light?: boolean }) {
  const { backdrop, symbol, model } = col || {};
  const tint = backdrop?.pattern ? hexMix(backdrop.edge, 0.55) : '#000';
  return (
    <View style={[{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Radial inner={backdrop?.center || '#444'} outer={backdrop?.edge || '#000'} cy="46%" style={StyleSheet.absoluteFill} />
      {pattern && symbol?.emoji && (light ? PATTERN_LIGHT : PATTERN).map((p, i) => (
        <Image key={i} source={{ uri: mediaUrl(emoji3d(symbol.emoji)) }} tintColor={tint} contentFit="contain" cachePolicy="memory-disk" recyclingKey={symbol.emoji}
          style={{ position: 'absolute', left: `${p.x - p.s / 2}%`, top: `${p.y - p.s / 2}%`, width: `${p.s}%`, aspectRatio: 1, opacity: p.o }} />
      ))}
      <GiftModel model={model} size={`${modelScale * 100}%`} />
    </View>
  );
}

export function GiftArt({ ug, style }: { ug: any; style?: StyleProp<ViewStyle> }) {
  if (ug.collectible) return <CollectibleArt col={ug.collectible} style={style} />;
  return <View style={[{ alignItems: 'center', justifyContent: 'center' }, style]}><GiftModel gift={ug.gift} size="78%" /></View>;
}
