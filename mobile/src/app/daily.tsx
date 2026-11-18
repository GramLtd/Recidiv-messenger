import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { CalendarCheck, Check } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { C } from '../lib/theme';
import { Btn, Rise, Spark, T } from '../components/ui';
import { SheetHead, sheetStyle } from '../components/Sheets';

/** Daily reward with a 7-day streak (same as the web). */
export default function Daily() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<number | null>(null);
  const s = useSharedValue(1);
  const hero = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  useEffect(() => { api('/daily').then(setD).catch(() => {}); }, []);
  const claim = async () => {
    setBusy(true);
    try {
      const r = await api('/daily/claim', { body: {} });
      setD(r); setGot(r.amount);
      s.value = withSequence(withTiming(1.18, { duration: 160 }), withSpring(1, { damping: 6 }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      api('/auth/me').then((x) => useStore.getState().setMe(x.user)).catch(() => {});
    } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <View style={sheetStyle}>
      <SheetHead title="Ежедневная награда" />
      {!d ? <ActivityIndicator color={C.accent} style={{ padding: 40 }} /> : (
        <View style={{ paddingHorizontal: 16, gap: 14, alignItems: 'center' }}>
          <Animated.View style={[st.hero, hero]}><CalendarCheck size={40} color="#fff" />{got != null && <View style={st.plus}><T w={800} color="#fff">+{got}</T></View>}</Animated.View>
          <T w={700} size={17} center>{d.streak ? `Серия: ${d.streak} подряд` : 'Заходите каждый день'}</T>
          <T size={13} dim center>Чем дольше серия, тем больше награда. Пропуск дня обнуляет серию.</T>
          <View style={st.days}>
            {d.rewards.map((v: number, i: number) => {
              const done = d.claimedToday ? i < ((d.streak - 1) % d.rewards.length) + 1 : i < d.streak % d.rewards.length;
              const next = !d.claimedToday && i === d.streak % d.rewards.length;
              return (
                <Rise key={i} delay={i * 40} style={[st.day, done && st.dayDone, next && st.dayNext]}>
                  <T size={10} dim>День {i + 1}</T>
                  {done ? <Check size={16} color="#34c759" /> : <Spark amount={v} size={11} />}
                </Rise>
              );
            })}
          </View>
          <Btn height={50} disabled={busy || !d.canClaim} title={d.canClaim ? `Забрать ✦ ${d.nextReward}` : 'Получено — приходите завтра'} onPress={claim} style={{ alignSelf: 'stretch' }} />
        </View>
      )}
    </View>
  );
}
const st = StyleSheet.create({
  hero: { width: 84, height: 84, borderRadius: 26, backgroundColor: '#2fb553', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  plus: { position: 'absolute', top: -10, right: -20, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, backgroundColor: C.accent },
  days: { flexDirection: 'row', gap: 5, alignSelf: 'stretch' },
  day: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  dayDone: { backgroundColor: 'rgba(52,199,89,0.15)' },
  dayNext: { borderWidth: 1.5, borderColor: C.accent, backgroundColor: `rgba(${C.accentRgb},0.12)` },
});
