import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { fmtNum } from '../lib/util';
import { C } from '../lib/theme';
import { Btn, Radial, T } from './ui';
import { CollectibleArt } from './GiftArt';

/*
 * Telegram-like gift upgrade (same choreography as the web): slot-machine spin that slows down, model → backdrop →
 * pattern lock one by one (haptic tick each), then flash + shock ring + sparks and the final card.
 */
const pick = <T,>(l: T[]) => l[Math.floor(Math.random() * l.length)];
const LOCK = { model: 1700, backdrop: 2300, symbol: 2900 };
const REVEAL_AT = 3150;
const W = Dimensions.get('window').width;
const CARD = Math.min(320, W - 48);
const A = (c: string, hex2: string) => (/^#[0-9a-f]{6}$/i.test(c) ? `${c}${hex2}` : 'rgba(255,255,255,0.25)');

function Spark({ p, a, d, s, white }: { p: SharedValue<number>; a: number; d: number; s: number; white: boolean }) {
  const st = useAnimatedStyle(() => {
    const v = p.value;
    return { opacity: v < 0.7 ? 1 : (1 - v) / 0.3, transform: [{ translateX: Math.cos(a) * d * v }, { translateY: Math.sin(a) * d * v }, { scale: 0.2 + 0.8 * v }, { rotate: `${v * 200}deg` }] };
  });
  return <Animated.View style={[{ position: 'absolute', width: s, height: s, marginLeft: -s / 2, marginTop: -s / 2, borderRadius: s / 2, backgroundColor: white ? '#fff' : 'rgba(255,230,200,0.95)' }, st]} />;
}

export function UpgradeReveal({ attrs, gift, request, onDone, onError }: { attrs: any; gift: any; request: Promise<any>; onDone: (ug: any) => void; onError: (e: any) => void }) {
  const t0 = useRef(Date.now()).current;
  const res = useRef<any>(null);
  const [result, setResult] = useState<any>(null);
  const [look, setLook] = useState(() => ({ m: pick(attrs.models), b: pick(attrs.backdrops), s: pick(attrs.symbols) }) as any);
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<'spin' | 'reveal'>('spin');

  const shake = useSharedValue(0);
  const pop = useSharedValue(0);
  const burst = useSharedValue(0);
  const glow = useSharedValue(0.6);

  useEffect(() => {
    request.then((r) => { res.current = r.userGift; setResult(r.userGift); }).catch(onError);
    shake.value = withRepeat(withTiming(1, { duration: 90, easing: Easing.inOut(Easing.sin) }), -1, true);
    glow.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
    let timer: any;
    let alive = true;
    const prev: Record<string, boolean> = {};
    const step = () => {
      if (!alive) return;
      const el = Date.now() - t0;
      const col = res.current?.collectible;
      const lk = { model: !!col && el >= LOCK.model, backdrop: !!col && el >= LOCK.backdrop, symbol: !!col && el >= LOCK.symbol };
      (['model', 'backdrop', 'symbol'] as const).forEach((k) => { if (lk[k] && !prev[k]) { prev[k] = true; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } });
      setLocked(lk);
      setLook((p: any) => ({
        m: lk.model ? col.model : pick(attrs.models.length > 1 ? attrs.models.filter((x: any) => x !== p.m) : attrs.models),
        b: lk.backdrop ? col.backdrop : pick(attrs.backdrops.length > 1 ? attrs.backdrops.filter((x: any) => x !== p.b) : attrs.backdrops),
        s: lk.symbol ? col.symbol : pick(attrs.symbols.length > 1 ? attrs.symbols.filter((x: any) => x !== p.s) : attrs.symbols),
      }));
      if (col && el >= REVEAL_AT) {
        setPhase('reveal');
        shake.value = withTiming(0, { duration: 80 });
        pop.value = 0.82; pop.value = withSpring(1, { damping: 9, stiffness: 160 });
        burst.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
        glow.value = withSequence(withTiming(1.6, { duration: 250 }), withTiming(1, { duration: 700 }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }
      const pr = Math.min(1, el / REVEAL_AT);
      timer = setTimeout(step, 70 + pr * pr * 260);
    };
    step();
    return () => { alive = false; clearTimeout(timer); };
  }, []);

  const cardSt = useAnimatedStyle(() => (phase === 'spin'
    ? { transform: [{ translateY: (shake.value - 0.5) * 4 }, { rotate: `${(shake.value - 0.5) * 1.2}deg` }, { scale: 0.985 }] }
    : { transform: [{ scale: pop.value }] }));
  const flashSt = useAnimatedStyle(() => ({ opacity: burst.value === 0 ? 0 : Math.max(0, 1 - burst.value * 2.2), transform: [{ scale: 0.4 + burst.value * 1.6 }] }));
  const ringSt = useAnimatedStyle(() => ({ opacity: burst.value === 0 ? 0 : Math.max(0, 1 - burst.value), transform: [{ scale: 0.3 + burst.value * 2.4 }] }));
  const glowSt = useAnimatedStyle(() => ({ transform: [{ scale: glow.value }] }));
  const textSt = useAnimatedStyle(() => ({ opacity: phase === 'reveal' ? Math.min(1, burst.value * 2.5) : 1, transform: [{ translateY: phase === 'reveal' ? (1 - Math.min(1, burst.value * 2.5)) * 12 : 0 }] }));

  const sparks = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ a: (i / 26) * Math.PI * 2 + Math.random() * 0.3, d: 130 + Math.random() * 140, s: 4 + Math.random() * 6, white: i % 3 === 0 })), []);
  const col = result?.collectible;
  const shown = phase === 'reveal' && col ? col : { model: { ...look.m, image: look.m?.image || gift.image }, backdrop: look.b, symbol: look.s };
  const tint = (phase === 'reveal' ? col?.backdrop?.center : look.b?.center) || '#ffffff';

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => { if (phase === 'reveal') onDone(result); }}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
      <Pressable style={st.center} onPress={() => { if (phase === 'reveal') onDone(result); }}>
        <Animated.View pointerEvents="none" style={[st.glow, glowSt]}>
          <Radial inner={A(tint, '88')} outer="rgba(0,0,0,0)" stop={0.6} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[st.ring, { borderColor: /^#/.test(tint) ? tint : '#fff' }, ringSt]} />
        <View pointerEvents="none" style={st.sparks}>{phase === 'reveal' && sparks.map((p, i) => <Spark key={i} p={burst} {...p} />)}</View>
        <Animated.View style={[st.card, cardSt]}>
          <CollectibleArt col={shown} style={StyleSheet.absoluteFill} pattern={phase === 'reveal'} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st.flash, flashSt]} />
        </Animated.View>
        <Animated.View style={[{ alignItems: 'center', gap: 4, marginTop: 18 }, textSt]}>
          <T w={800} size={23} color="#fff" center>{phase === 'reveal' ? 'Подарок улучшен!' : 'Улучшаем подарок…'}</T>
          <T w={600} color="rgba(255,255,255,0.7)">{gift.name}{phase === 'reveal' && col ? ` #${fmtNum(col.number)}` : ''}</T>
        </Animated.View>
        <View style={st.slots}>
          {([['Модель', 'model', shown.model], ['Фон', 'backdrop', shown.backdrop], ['Узор', 'symbol', shown.symbol]] as const).map(([label, k, v]: any) => {
            const on = locked[k] || phase === 'reveal';
            return (
              <View key={k} style={[st.slot, on && { backgroundColor: A(tint, '38'), borderColor: A(tint, 'aa') }]}>
                <T size={11} color="rgba(255,255,255,0.55)">{label}</T>
                <T w={700} size={12.5} color="#fff" numberOfLines={1}>{k === 'symbol' ? `${v?.emoji || ''} ${v?.name || ''}` : v?.name}</T>
                {on && v?.chance != null && <View style={st.chip}><T size={10.5} w={700} color="rgba(255,255,255,0.8)">{v.chance}%</T></View>}
              </View>
            );
          })}
        </View>
        {phase === 'reveal' && <Btn title="Отлично" height={50} onPress={() => onDone(result)} style={{ width: CARD, marginTop: 18 }} />}
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  glow: { position: 'absolute', width: W * 1.4, height: W * 1.4, top: '50%', left: '50%', marginLeft: -W * 0.7, marginTop: -W * 0.9 },
  ring: { position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 3, top: '50%', left: '50%', marginLeft: -130, marginTop: -230 },
  sparks: { position: 'absolute', top: '50%', left: '50%', marginTop: -100, width: 0, height: 0 },
  card: { width: CARD, height: CARD, borderRadius: 28, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  flash: { backgroundColor: '#fff', borderRadius: 28 },
  slots: { flexDirection: 'row', gap: 8, width: CARD, marginTop: 14 },
  slot: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', minWidth: 0 },
  chip: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.12)' },
});
