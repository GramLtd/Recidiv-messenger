import React, { ReactNode, useEffect, useId } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, StyleProp, TextStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedViewBase from '@react-native-masked-view/masked-view';
import Svg, { Defs, LinearGradient as SvgLinear, Path, Stop, RadialGradient, Rect } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BadgeCheck } from 'lucide-react-native';
import { C, BASE, webSpring } from '../lib/theme';
import { mediaUrl } from '../lib/config';
import { usePerf } from '../lib/perf';
import { useFont, fontStyle } from '../lib/fonts';
import { colorFor, initials } from '../lib/util';

export const MaskedView = MaskedViewBase as any;

/* ------------------------------------------------------------------ text */
type TP = { children?: ReactNode; style?: StyleProp<TextStyle>; dim?: boolean; muted?: boolean; bold?: boolean; w?: number; size?: number; color?: string; numberOfLines?: number; center?: boolean; selectable?: boolean; onPress?: () => void; fit?: boolean };
/** Text in the user's interface font (Settings → Шрифты), web sizes (base 15). */
export function T({ children, style, dim, muted, bold, w, size, color, numberOfLines, center, selectable, onPress, fit }: TP) {
  const font = useFont((s) => s.id);
  const weight = w ?? (bold ? 700 : 400);
  return (
    <Text
      onPress={onPress}
      selectable={selectable}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? 0.7 : undefined}
      style={[{ color: color ?? (dim ? C.text2 : muted ? C.text3 : C.text), fontSize: size ?? BASE, lineHeight: undefined }, fontStyle(font, weight, size ?? BASE), center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ glass */
/**
 * Web `.lg` liquid glass: backdrop blur(24px) saturate(1.9) + rgba(255,255,255,.09) fill,
 * inset .5px white .22 edge, inset top highlight .16, soft shadow. No dark underlay.
 */
export function Glass({ children, style, radius = 22, fill = C.glass, edge = C.glassEdge, hi = C.glassHi, intensity = 30, shadow = true }: {
  children?: ReactNode; style?: StyleProp<ViewStyle>; radius?: number; fill?: string; edge?: string; hi?: string; intensity?: number; shadow?: boolean;
}) {
  const low = usePerf((s) => s.low);
  return (
    <View style={[shadow && st.glassShadow, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', zIndex: -1 }]} pointerEvents="none">
        {low ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(38,38,42,0.96)' }]} /> : <BlurView tint="systemUltraThinMaterialDark" intensity={intensity} style={StyleSheet.absoluteFill} />}
        {!low && <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />}
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 0.5, borderColor: edge }]} />
        <LinearGradient colors={[hi, 'rgba(255,255,255,0)']} locations={[0, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.min(radius, 14), borderTopLeftRadius: radius, borderTopRightRadius: radius }} />
      </View>
      {children}
    </View>
  );
}

/** Web `.glass-icon` round button. */
export function GlassIcon({ children, onPress, size = 40, style }: { children: ReactNode; onPress?: () => void; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Press onPress={onPress} scale={0.9} style={style}>
      <Glass radius={size / 2} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{children}</Glass>
    </Press>
  );
}

/** Web `.pill` (glass, 14px radius, bold small text). */
export function Pill({ children, onPress, on, style }: { children: ReactNode; onPress?: () => void; on?: boolean; style?: StyleProp<ViewStyle> }) {
  const inner = (
    <Glass radius={14} fill="rgba(255,255,255,0.1)" edge="rgba(255,255,255,0.16)" hi="rgba(255,255,255,0.2)" shadow={false} style={st.pill}>
      {typeof children === 'string' ? <T w={700} size={12.3} color={on ? C.online : C.text}>{children}</T> : children}
    </Glass>
  );
  return onPress ? <Press onPress={onPress} scale={0.95}>{inner}</Press> : inner;
}

/** Primary (accent) button — web `.btn`: accent fill, top sheen, inset white edge, coloured shadow. */
export function AccentFill({ radius, style, children, color = C.accent }: { radius: number; style?: StyleProp<ViewStyle>; children?: ReactNode; color?: string }) {
  return (
    <View style={[{ borderRadius: radius, backgroundColor: color, shadowColor: color, shadowOpacity: 0.55, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }, style]}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.35)' }]} />
      </View>
      {children}
    </View>
  );
}

export function Btn({ title, icon, onPress, secondary, style, disabled, height = 44, color }: { title?: string; icon?: ReactNode; onPress?: () => void; secondary?: boolean; style?: StyleProp<ViewStyle>; disabled?: boolean; height?: number; color?: string }) {
  const inner = (
    <View style={[st.btnInner, { height }]}>
      {icon}
      {title ? <T w={700} size={13.5} color={color ?? (secondary ? C.text : '#fff')} numberOfLines={1}>{title}</T> : null}
    </View>
  );
  return (
    <Press onPress={onPress} scale={0.95} disabled={disabled} style={style}>
      {secondary ? <Glass radius={height / 2}>{inner}</Glass> : <AccentFill radius={height / 2}>{inner}</AccentFill>}
    </Press>
  );
}
export const GlassButton = ({ title, onPress, icon, style, accent }: { title?: string; onPress?: () => void; icon?: ReactNode; style?: StyleProp<ViewStyle>; accent?: boolean }) =>
  <Btn title={title} onPress={onPress} icon={icon} style={style} secondary={!accent} />;

/* ------------------------------------------------------------------ press */
const APressable = Animated.createAnimatedComponent(Pressable);
/** Pressable with the web's springy press (scale .95 → back with var(--spring)). */
export function Press({ onPress, onLongPress, style, children, scale = 0.95, haptic, disabled, hitSlop = 6 }: {
  onPress?: () => void; onLongPress?: () => void; style?: StyleProp<ViewStyle>; children?: ReactNode; scale?: number; haptic?: boolean; disabled?: boolean; hitSlop?: number;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => { s.value = withTiming(scale, { duration: 110 }); }}
      onPressOut={() => { s.value = withSpring(1, webSpring); }}
      onPress={() => { if (haptic) Haptics.selectionAsync(); onPress?.(); }}
      onLongPress={onLongPress ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLongPress(); } : undefined}
      delayLongPress={320}
      style={[a, style, disabled && { opacity: 0.45 }]}
    >
      {children}
    </APressable>
  );
}

/* ------------------------------------------------------------------ entrance animations */
/** Web `riseIn`: from opacity 0, translateY 12, scale .98 (blur is dropped on native). */
export function Rise({ children, delay = 0, style, dy = 12, duration = 450 }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle>; dy?: number; duration?: number }) {
  const low = usePerf((s) => s.low);
  const p = useSharedValue(low ? 1 : 0);
  useEffect(() => { if (!low) p.value = withDelay(delay, withTiming(1, { duration, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })); }, []);
  const a = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * dy }, { scale: 0.98 + p.value * 0.02 }] }));
  return <Animated.View style={[a, style]}>{children}</Animated.View>;
}

/* ------------------------------------------------------------------ fades */
/** Dim + progressive blur behind the status bar so content fades out under it. */
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
      <LinearGradient colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0)']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

/* ------------------------------------------------------------------ avatar & badges */
/** Web Avatar: photo, or initials on a 160° gradient of the user's colour. */
export function Avatar({ uri, name, id = 0, size = 44, online, emoji }: { uri?: string | null; name?: string; id?: number; size?: number; online?: boolean; emoji?: string }) {
  const col = colorFor(id);
  return (
    <View style={{ width: size, height: size }}>
      {uri && !emoji ? (
        <Image source={{ uri: mediaUrl(uri) }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#222' }} contentFit="cover" transition={120} cachePolicy="memory-disk" />
      ) : (
        <LinearGradient colors={[col, shade(col, 0.6)]} start={{ x: 0.33, y: 0 }} end={{ x: 0.67, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
          <T w={600} size={size * 0.38} color="#fff">{emoji || initials(name || '')}</T>
        </LinearGradient>
      )}
      {online && <View style={{ position: 'absolute', right: 1, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: C.green, borderWidth: 2.5, borderColor: C.bg }} />}
    </View>
  );
}
/** color-mix(in srgb, c k, #000) */
export function shade(hex: string, k: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((n >> 16) & 255) * k); const g = Math.round(((n >> 8) & 255) * k); const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

export const Verified = ({ size = 16 }: { size?: number }) => <BadgeCheck size={size} fill={C.accent} color={C.bg} strokeWidth={2} />;

const SPARK_D = 'M12 1.5c.6 4.9 2.4 7.9 10.5 10.5C14.4 14.6 12.6 17.6 12 22.5c-.6-4.9-2.4-7.9-10.5-10.5C9.6 9.4 11.4 6.4 12 1.5z';
/** Premium badge: the currency spark with the web's gradient. */
export const PremiumStar = ({ size = 15 }: { size?: number }) => <PremiumStarInner size={size} />;
function PremiumStarInner({ size }: { size: number }) {
  const gid = `ps${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Defs><SvgLinear id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#ffb3a0" /><Stop offset="0.45" stopColor={C.accent} /><Stop offset="1" stopColor="#ff7a1a" /></SvgLinear></Defs>
    <Path fill={`url(#${gid})`} d={SPARK_D} />
  </Svg>
  );
}
export const SparkIcon = ({ size = 20, color = 'currentColor', fill = 'none', stroke = 2 }: { size?: number; color?: string; fill?: string; stroke?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={fill !== 'none' ? 0 : stroke} strokeLinejoin="round">
    <Path d="M12 2.5c.6 4.6 2.3 7.4 9.5 9.5-7.2 2.1-8.9 4.9-9.5 9.5-.6-4.6-2.3-7.4-9.5-9.5 7.2-2.1 8.9-4.9 9.5-9.5z" fill={fill === 'none' ? 'none' : fill} />
  </Svg>
);
/** Currency: ✦ symbol (accent) + amount. */
export function Spark({ amount, size = BASE, color = C.accent, amountColor }: { amount?: number; size?: number; color?: string; amountColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.22 }}>
      <T size={size * 1.45} color={color} w={700} style={{ lineHeight: size * 1.2 }}>✦</T>
      {amount !== undefined && <T size={size} w={700} color={amountColor ?? color}>{Number(amount).toLocaleString('ru-RU')}</T>}
    </View>
  );
}

/**
 * react-native-svg on iOS ignores the alpha of rgba()/#rrggbbaa stop colours (a 30%-transparent stop becomes solid),
 * so split every colour into an opaque stopColor + stopOpacity.
 */
export function stopProps(c: string): { stopColor: string; stopOpacity: number } {
  const m = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/i);
  if (m) return { stopColor: `rgb(${m[1]},${m[2]},${m[3]})`, stopOpacity: m[4] !== undefined ? Number(m[4]) : 1 };
  const h = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i);
  if (h) return { stopColor: `#${h[1]}`, stopOpacity: parseInt(h[2], 16) / 255 };
  return { stopColor: c, stopOpacity: 1 };
}

/** Radial gradient box (CSS radial-gradient(circle, a, b)). */
export function Radial({ inner, outer, style, cx = '50%', cy = '50%', stop = 0.78, radius, mid, midStop = 0.38, r = '70%' }: { inner: string; outer: string; style?: StyleProp<ViewStyle>; cx?: string; cy?: string; stop?: number; radius?: number; mid?: string; midStop?: number; r?: string }) {
  const gid = `rg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View style={[{ overflow: 'hidden', borderRadius: radius }, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs><RadialGradient id={gid} cx={cx} cy={cy} r={r}>{[<Stop key="a" offset="0" {...stopProps(inner)} />, ...(mid ? [<Stop key="m" offset={String(midStop)} {...stopProps(mid)} />] : []), <Stop key="b" offset={String(stop)} {...stopProps(outer)} />, <Stop key="c" offset="1" {...stopProps(outer)} />]}</RadialGradient></Defs>
        <Rect width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

/** Collectible worn next to the name. */
export function WornGift({ gift, size = 20 }: { gift: any; size?: number }) {
  if (!gift) return null;
  return (
    <View style={{ width: size, height: size, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }}>
      <Radial inner={gift.center || '#444'} outer={gift.edge || '#000'} style={StyleSheet.absoluteFill} stop={1} />
      <Image source={{ uri: mediaUrl(gift.image || emoji3d(gift.emoji)) }} style={{ width: '82%', height: '82%', margin: '9%' }} contentFit="contain" />
    </View>
  );
}
export const emojiCode = (e: string) => [...String(e || '')].map((c) => c.codePointAt(0)!.toString(16)).join('-');
export const emoji3d = (e: string) => `/emoji3d/${emojiCode(e)}.webp`;

const st = StyleSheet.create({
  glassShadow: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 7, shadowOffset: { width: 0, height: 4 } },
  pill: { paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
});
