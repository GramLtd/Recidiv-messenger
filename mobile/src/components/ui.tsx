import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, StyleProp, TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { C } from '../lib/theme';
import { mediaUrl } from '../lib/config';
import { usePerf } from '../lib/perf';

/** Liquid glass: real backdrop blur with a hairline edge; no extra underlay. Solid fallback in performance mode. */
export function Glass({ children, style, radius = 22, intensity = 40 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; intensity?: number }) {
  const low = usePerf((s) => s.low);
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassEdge }, style]}>
      {low ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(40,40,44,0.92)' }]} /> : <BlurView tint="systemChromeMaterialDark" intensity={intensity} style={StyleSheet.absoluteFill} />}
      {children}
    </View>
  );
}

const APressable = Animated.createAnimatedComponent(Pressable);
/** Pressable with a springy scale-down, like native buttons. */
export function Press({ onPress, onLongPress, style, children, scale = 0.94, haptic, disabled, hitSlop = 8 }: {
  onPress?: () => void; onLongPress?: () => void; style?: StyleProp<ViewStyle>; children?: ReactNode; scale?: number; haptic?: boolean; disabled?: boolean; hitSlop?: number;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => { s.value = withSpring(scale, { damping: 20, stiffness: 400 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
      onPress={() => { if (haptic) Haptics.selectionAsync(); onPress?.(); }}
      onLongPress={onLongPress ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLongPress(); } : undefined}
      delayLongPress={320}
      style={[a, style, disabled && { opacity: 0.45 }]}
    >
      {children}
    </APressable>
  );
}

export function GlassButton({ title, onPress, icon, style, accent }: { title?: string; onPress?: () => void; icon?: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) {
  const inner = <View style={st.btnInner}>{icon}{title ? <Text style={[st.btnText, accent && { color: '#fff' }]}>{title}</Text> : null}</View>;
  return (
    <Press onPress={onPress} haptic style={style}>
      {accent ? <View style={[st.btnAccent]}>{inner}</View> : <Glass radius={24}>{inner}</Glass>}
    </Press>
  );
}

const colors = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774'];
export function Avatar({ uri, name, id = 0, size = 44 }: { uri?: string | null; name?: string; id?: number; size?: number }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  if (uri) return <Image source={{ uri: mediaUrl(uri) }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.bg3 }} contentFit="cover" transition={150} cachePolicy="memory-disk" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[id % colors.length], alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}

export const T = ({ children, style, dim, bold, size, numberOfLines }: { children?: ReactNode; style?: StyleProp<TextStyle>; dim?: boolean; bold?: boolean; size?: number; numberOfLines?: number }) => (
  <Text numberOfLines={numberOfLines} style={[{ color: dim ? C.text2 : C.text, fontWeight: bold ? '700' : '400', fontSize: size || 16 }, style]}>{children}</Text>
);

export const st = StyleSheet.create({
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, height: 48 },
  btnText: { color: C.text, fontWeight: '700', fontSize: 16 },
  btnAccent: { borderRadius: 24, backgroundColor: C.accent, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.35)' },
});
