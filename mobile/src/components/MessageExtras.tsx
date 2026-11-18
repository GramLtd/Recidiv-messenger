import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { create } from 'zustand';
import { Check, Languages } from 'lucide-react-native';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/config';
import { useStore } from '../lib/store';
import { C } from '../lib/theme';
import { Avatar, T } from './ui';

const plural = (n: number, [a, b, c]: [string, string, string]) => { const m10 = n % 10; const m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

function Bar({ frac, color }: { frac: number; color: string }) {
  const w = useSharedValue(0);
  useEffect(() => { w.value = withTiming(frac, { duration: 650, easing: Easing.bezier(0.32, 0.72, 0, 1) }); }, [frac]);
  const st = useAnimatedStyle(() => ({ width: `${w.value * 100}%` as any }));
  return <View style={s.barTrack}><Animated.View style={[s.barFill, { backgroundColor: color }, st]} /></View>;
}

/** Poll / quiz in a bubble — same behaviour as the web. */
export function PollView({ m, out }: { m: any; out: boolean }) {
  const p = m.media;
  const me = useStore((st) => st.me);
  const [pick, setPick] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const voted = p.mine?.length > 0;
  const results = voted || p.closed;
  const fg = out ? '#fff' : C.text;
  const dim = out ? 'rgba(255,255,255,0.7)' : C.text2;
  const vote = async (options: number[]) => {
    if (busy) return;
    setBusy(true);
    try { useStore.getState().upsertMessage((await api(`/messages/${m.id}/vote`, { body: { options } })).message); setPick([]); Haptics.selectionAsync(); } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  const tap = (i: number) => {
    if (results && !(p.multiple && !p.closed)) return;
    if (p.multiple) setPick((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]));
    else vote([i]);
  };
  const max = Math.max(1, ...p.counts);
  return (
    <View style={{ minWidth: 240, gap: 2 }}>
      <T w={700} color={fg}>{p.question}</T>
      <T size={12} color={dim} style={{ marginBottom: 6 }}>{p.quiz ? 'Викторина' : p.anonymous ? 'Анонимный опрос' : 'Опрос'}{p.multiple ? ' · несколько ответов' : ''}{p.closed ? ' · завершён' : ''}</T>
      {p.options.map((o: string, i: number) => {
        const pct = p.total ? Math.round((p.counts[i] / p.total) * 100) : 0;
        const mine = p.mine?.includes(i);
        const right = p.quiz && results && p.correct === i;
        const wrong = p.quiz && mine && p.correct !== i;
        const barColor = right ? '#34c759' : wrong ? '#ff453a' : fg;
        return (
          <Pressable key={i} onPress={() => tap(i)} style={({ pressed }) => [s.opt, pressed && !results && { opacity: 0.6 }]}>
            {results ? <T w={700} size={13} color={fg} style={{ width: 40, textAlign: 'right' }}>{pct}%</T>
              : <View style={[s.radio, p.multiple && { borderRadius: 6 }, { borderColor: dim }, pick.includes(i) && { backgroundColor: C.accent, borderColor: C.accent }]}>{pick.includes(i) && <Check size={12} color="#fff" strokeWidth={3} />}</View>}
            <View style={{ flex: 1, gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <T color={fg} style={{ flexShrink: 1 }}>{o}</T>
                {(mine || right) && <Check size={14} color={right ? '#34c759' : fg} strokeWidth={3} />}
              </View>
              {results && <Bar frac={p.counts[i] / max} color={barColor} />}
            </View>
            {results && !p.anonymous && p.voters?.[i]?.length > 0 && (
              <View style={{ flexDirection: 'row' }}>{p.voters[i].map((u: any, k: number) => <View key={u.id} style={{ marginLeft: k ? -6 : 0 }}><Avatar uri={u.avatar} name={u.displayName} id={u.id} size={18} /></View>)}</View>
            )}
          </Pressable>
        );
      })}
      {p.quiz && results && !!p.explanation && <View style={s.expl}><T size={13} color={fg}>💡 {p.explanation}</T></View>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {p.multiple && !p.closed && pick.length > 0
          ? <Pressable onPress={() => vote(pick)} style={s.voteBtn}><T w={700} size={13} color="#fff">Голосовать</T></Pressable>
          : <T size={12} color={dim}>{p.total ? `${p.total} ${plural(p.total, ['голос', 'голоса', 'голосов'])}` : 'Пока никто не голосовал'}</T>}
        {voted && !p.quiz && !p.closed && <T size={12} color={dim} style={{ textDecorationLine: 'underline' }} onPress={() => vote([])}>Отменить голос</T>}
        {m.sender?.id === me?.id && !p.closed && (
          <T size={12} color={dim} style={{ textDecorationLine: 'underline' }} onPress={() => Alert.alert('Завершить опрос?', 'Голосовать больше будет нельзя.', [{ text: 'Отмена' }, { text: 'Завершить', style: 'destructive', onPress: async () => { try { useStore.getState().upsertMessage((await api(`/messages/${m.id}/close-poll`, { body: {} })).message); } catch (e: any) { Alert.alert(e.message); } } }])}>Завершить</T>
        )}
      </View>
    </View>
  );
}

/* link preview */
const cache = new Map<string, any>();
const firstUrl = (t: string) => String(t || '').match(/https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"»]/)?.[0];
export function LinkPreview({ text, out }: { text: string; out: boolean }) {
  const url = firstUrl(text);
  const [p, setP] = useState<any>(() => (url ? cache.get(url) : null));
  useEffect(() => {
    if (!url) return undefined;
    if (cache.has(url)) { const v = cache.get(url); if (!v?.then) { setP(v); return undefined; } }
    let alive = true;
    const req = cache.get(url)?.then ? cache.get(url) : api(`/link-preview?url=${encodeURIComponent(url)}`).then((r) => r.preview).catch(() => null);
    cache.set(url, req);
    req.then((v: any) => { cache.set(url, v); if (alive) setP(v); });
    return () => { alive = false; };
  }, [url]);
  if (!p || p.then) return null;
  return (
    <Pressable onPress={() => Linking.openURL(p.url)} style={[s.lp, { borderLeftColor: out ? '#fff' : C.accent, backgroundColor: out ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.06)' }]}>
      <T w={700} size={12} color={out ? '#fff' : C.accent}>{p.site}</T>
      {!!p.title && <T w={700} size={13.5} numberOfLines={2}>{p.title}</T>}
      {!!p.description && <T size={12.5} dim numberOfLines={3}>{p.description}</T>}
      {!!p.image && <Image source={{ uri: mediaUrl(p.image) }} style={s.lpImg} contentFit="cover" cachePolicy="memory-disk" />}
    </Pressable>
  );
}

/* translation */
export const useTranslations = create<Record<number, any>>(() => ({}));
export async function translateMessage(m: any) {
  const cur = useTranslations.getState()[m.id];
  if (cur && cur !== 'loading') { useTranslations.setState({ [m.id]: undefined }); return; }
  useTranslations.setState({ [m.id]: 'loading' });
  try {
    const to = /[а-яё]/i.test(m.text) && !/[a-z]{4}/i.test(String(m.text).replace(/https?:\/\/\S+/g, '')) ? 'en' : 'ru';
    useTranslations.setState({ [m.id]: await api('/translate', { body: { text: m.text, to } }) });
  } catch (e: any) { useTranslations.setState({ [m.id]: undefined }); Alert.alert(e.message); }
}
export function TranslationView({ id, out }: { id: number; out: boolean }) {
  const t = useTranslations((st) => st[id]);
  if (!t) return null;
  return (
    <View style={[s.tr, { borderTopColor: out ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)' }]}>
      <Languages size={13} color={out ? 'rgba(255,255,255,0.75)' : C.text2} style={{ marginTop: 3 }} />
      <T size={14} style={{ flex: 1 }}>{t === 'loading' ? 'Переводим…' : t.text}</T>
    </View>
  );
}

const s = StyleSheet.create({
  opt: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  expl: { marginTop: 6, padding: 8, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)' },
  voteBtn: { paddingHorizontal: 14, height: 30, borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  lp: { marginTop: 6, paddingVertical: 6, paddingLeft: 9, paddingRight: 10, borderLeftWidth: 3, borderRadius: 8, gap: 2, maxWidth: 300 },
  lpImg: { marginTop: 6, width: '100%', height: 150, borderRadius: 8 },
  tr: { flexDirection: 'row', gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth },
});
