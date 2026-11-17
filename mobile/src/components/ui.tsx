import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, StyleProp, TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedViewBase from '@react-native-masked-view/masked-view';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { C } from '../lib/theme';
import { mediaUrl } from '../lib/config';
import { usePerf } from '../lib/perf';

/**
 * Liquid glass, like the web client: see-through backdrop blur + a faint white sheen + bright top edge.
 * No dark underlay. Performance mode swaps the blur for a flat translucent fill.
 */
export function Glass({ children, style, radius = 22, intensity = 28, strong }: { children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; intensity?: number; strong?: boolean }) {
  const low = usePerf((s) => s.low);
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)' }, style]}>
      {low
        ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(44,44,48,0.94)' }]} />
        : <BlurView tint="dark" intensity={intensity} style={StyleSheet.absoluteFill} />}
      {!low && <LinearGradient colors={strong ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.06)'] : ['rgba(255,255,255,0.13)', 'rgba(255,255,255,0.04)']} style={StyleSheet.absoluteFill} pointerEvents="none" />}
      <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', left: radius * 0.4, right: radius * 0.4, top: 0, height: 1 }} pointerEvents="none" />
      {children}
    </View>
  );
}

/** Dim + progressive blur behind the status bar / a floating header, so content fades out under it. */
export function TopFade({ height }: { height?: number }) {
  const insets = useSafeAreaInsets();
  const low = usePerf((s) => s.low);
  const h = height ?? insets.top + 12;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: h }}>
      {!low && (
        <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient colors={['#000', '#000', 'transparent']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />}>
          <BlurView tint="dark" intensity={22} style={StyleSheet.absoluteFill} />
        </MaskedView>
      )}
      <LinearGradient colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}
/** Same at the bottom (behind the composer / tab bar). */
export function BottomFade({ height }: { height: number }) {
  return (
    <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']} locations={[0, 0.5, 1]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }} />
  );
}

const MaskedView = MaskedViewBase as any;
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
      onPressOut={() => { s.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
      onPress={() => { if (haptic) Haptics.selectionAsync(); onPress?.(); }}
      onLongPress={onLongPress ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLongPress(); } : undefined}
      delayLongPress={320}
      style={[a, style, disabled && { opacity: 0.45 }]}
    >
      {children}
    </APressable>
  );
}

/** Accent pill with a glossy gradient (the web client's primary button). */
export function AccentFill({ radius, style, children }: { radius: number; style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden', backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.45, shadowRadius: 9, shadowOffset: { width: 0, height: 5 } }, style]}>
      <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', 'rgba(0,0,0,0.18)']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      {children}
    </View>
  );
}

export function GlassButton({ title, onPress, icon, style, accent }: { title?: string; onPress?: () => void; icon?: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) {
  const inner = <View style={st.btnInner}>{icon}{title ? <Text style={[st.btnText, accent && { color: '#fff' }]}>{title}</Text> : null}</View>;
  return (
    <Press onPress={onPress} haptic style={style}>
      {accent ? <AccentFill radius={24}>{inner}</AccentFill> : <Glass radius={24}>{inner}</Glass>}
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
});
