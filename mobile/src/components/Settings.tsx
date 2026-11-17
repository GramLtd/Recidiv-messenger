import React, { ReactNode, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check } from 'lucide-react-native';
import { C } from '../lib/theme';
import { usePerf } from '../lib/perf';
import { Press, Rise, T } from './ui';

/** Web `.set-group-wrap` */
export function Group({ title, children, footer, delay = 0 }: { title?: string; children: ReactNode; footer?: string; delay?: number }) {
  return (
    <Rise delay={delay} style={{ marginBottom: 16 }}>
      {!!title && <T size={12} w={600} dim style={st.groupTitle}>{title.toUpperCase()}</T>}
      <View style={st.group}>{React.Children.toArray(children).filter(Boolean).map((c, i) => <View key={i} style={i > 0 ? st.sepWrap : undefined}>{i > 0 && <View style={[st.sep, { left: hasIcon(c) ? 60 : 14 }]} />}{c}</View>)}</View>
      {!!footer && <T size={12} dim style={st.foot}>{footer}</T>}
    </Rise>
  );
}
const hasIcon = (c: any) => !!c?.props?.icon;

/** Web `.set-row`: coloured icon square, title/sub, value, chevron. */
export function Row({ icon: Icon, color, title, sub, value, onPress, right, danger, index = 0 }: {
  icon?: any; color?: string | string[]; title: ReactNode; sub?: ReactNode; value?: ReactNode; onPress?: () => void; right?: ReactNode; danger?: boolean; index?: number;
}) {
  const low = usePerf((s) => s.low);
  const e = useSharedValue(low ? 1 : 0);
  useEffect(() => { if (!low) e.value = withDelay(index * 25, withTiming(1, { duration: 350, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })); }, []);
  const a = useAnimatedStyle(() => ({ opacity: e.value, transform: [{ translateX: (1 - e.value) * -8 }] }));
  return (
    <Animated.View style={a}>
      <Pressable onPress={onPress ? () => { Haptics.selectionAsync(); onPress(); } : undefined} disabled={!onPress} style={({ pressed }) => [st.row, pressed && onPress && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
        {Icon && <IconSq color={color}><Icon size={18} color="#fff" /></IconSq>}
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? <T color={danger ? C.danger : C.text}>{title}</T> : title}
          {sub ? (typeof sub === 'string' ? <T size={12} dim>{sub}</T> : sub) : null}
        </View>
        {value !== undefined && value !== null && value !== '' && (typeof value === 'string' ? <T size={14.3} dim numberOfLines={1} style={{ maxWidth: '45%' }}>{value}</T> : value)}
        {right}
        {onPress && !right && <T size={22.5} color={C.text3} style={{ marginLeft: 2, marginTop: -2 }}>›</T>}
      </Pressable>
    </Animated.View>
  );
}
export function IconSq({ color = '#8e8e93', children, size = 32 }: { color?: string | string[]; children: ReactNode; size?: number }) {
  const inner = <View style={[StyleSheet.absoluteFill, { borderRadius: 9, borderTopWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)' }]} />;
  if (Array.isArray(color)) return <LinearGradient colors={color as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.ico, { width: size, height: size }]}>{inner}{children}</LinearGradient>;
  return <View style={[st.ico, { width: size, height: size, backgroundColor: color }]}>{inner}{children}</View>;
}

/** Web `.check` radio. */
export const Radio = ({ on }: { on: boolean }) => (
  <View style={[st.check, on && { backgroundColor: C.accent, borderColor: C.accent }]}>{on && <Check size={14} color="#fff" strokeWidth={3} />}</View>
);

/** iOS switch exactly like the web `.switch` (51×31, green when on, thumb stretches on press). */
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const x = useSharedValue(on ? 1 : 0);
  const press = useSharedValue(0);
  useEffect(() => { x.value = withTiming(on ? 1 : 0, { duration: 350, easing: Easing.bezier(0.32, 0.72, 0, 1) }); }, [on]);
  const track = useAnimatedStyle(() => ({ backgroundColor: x.value > 0.5 ? '#34c759' : 'rgba(120,120,128,0.32)' }));
  const thumb = useAnimatedStyle(() => ({ width: 27 + 6 * press.value, transform: [{ translateX: x.value * (20 - 6 * press.value) }] }));
  return (
    <Pressable
      onPressIn={() => { press.value = withTiming(1, { duration: 200 }); }}
      onPressOut={() => { press.value = withSpring(0); }}
      onPress={() => { Haptics.selectionAsync(); onChange(!on); }}
      hitSlop={8}
    >
      <Animated.View style={[st.sw, track]}><Animated.View style={[st.thumb, thumb]} /></Animated.View>
    </Pressable>
  );
}

/** A pushed settings page: glass back button + title, scrolling body (web `.settings-page`). */
export function Page({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.head, { paddingTop: insets.top + 6 }]}>
        <Press scale={0.85} onPress={() => router.back()} style={{ width: 36, height: 40, justifyContent: 'center' }}><ArrowLeft size={24} color={C.text2} /></Press>
        <T w={800} size={18.75} numberOfLines={1} style={{ flex: 1, letterSpacing: -0.2 }}>{title}</T>
        {right}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  groupTitle: { letterSpacing: 0.5, paddingHorizontal: 14, paddingBottom: 6 },
  foot: { paddingHorizontal: 14, paddingTop: 6, lineHeight: 17 },
  group: { borderRadius: 22, overflow: 'hidden', backgroundColor: C.group, borderWidth: 1, borderColor: C.border },
  sepWrap: { position: 'relative' },
  sep: { position: 'absolute', top: 0, right: 0, height: 1, backgroundColor: C.border, zIndex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 8, paddingHorizontal: 14 },
  ico: { borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.text3, alignItems: 'center', justifyContent: 'center' },
  sw: { width: 51, height: 31, borderRadius: 16, padding: 2 },
  thumb: { height: 27, borderRadius: 14, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 3 } },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 12, minHeight: 56, paddingBottom: 4 },
});
