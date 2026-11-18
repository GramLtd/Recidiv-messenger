import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useFont, fontStyle } from '../lib/fonts';
import { C } from '../lib/theme';
import { Btn, Pill, Rise, T } from '../components/ui';
import { SheetHead, sheetStyle } from '../components/Sheets';

const PRESETS: [string, string][] = [
  ['🎧', 'Слушаю музыку'], ['💼', 'На работе'], ['📚', 'Учусь'], ['🎮', 'Играю'], ['🌙', 'Сплю'], ['✈️', 'В отъезде'],
  ['🏋️', 'В зале'], ['🍿', 'Смотрю кино'], ['🔕', 'Не беспокоить'], ['🤒', 'Болею'], ['🎉', 'Праздную'], ['💎', 'Торгую на маркете'],
];
const EMOJIS = ['😎', '🔥', '❤️', '✦', '⭐', '💤', '☕', '🎵', '🚀', '👑', '🍀', '💸', '🧠', '🎯', '😈', '🫡'];
const DURATIONS: [string, number | 'today'][] = [['1 час', 3600_000], ['4 часа', 4 * 3600_000], ['До конца дня', 'today'], ['Неделя', 7 * 86400_000], ['Без срока', 0]];

/** Emoji status (same as the web): emoji + optional text + how long to show it. */
export default function StatusSheet() {
  const me = useStore((s) => s.me);
  const font = useFont((s) => s.id);
  const [emoji, setEmoji] = useState(me?.emojiStatus || '🎧');
  const [text, setText] = useState(me?.statusText || '');
  const [dur, setDur] = useState<number | 'today'>(4 * 3600_000);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const until = () => { if (dur === 'today') { const t = new Date(); t.setHours(23, 59, 0, 0); return t.getTime(); } return dur ? Date.now() + dur : null; };
  const save = async (clear = false) => {
    setBusy(true);
    try {
      const r = await api('/me/status', { body: clear ? { emoji: null } : { emoji, text, until: until() } });
      useStore.getState().setMe(r.user);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <View style={sheetStyle}>
      <SheetHead title="Статус" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Rise style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={st.big}><T size={40}>{emoji}</T></View>
          <TextInput value={text} onChangeText={setText} maxLength={70} placeholder="Что у вас сейчас? (необязательно)" placeholderTextColor={C.text3}
            style={[st.input, fontStyle(font, 400, 15)]} />
        </Rise>
        <View style={st.grid}>
          {EMOJIS.map((e) => (
            <Pressable key={e} onPress={() => { Haptics.selectionAsync(); setEmoji(e); }} style={[st.cell, e === emoji && st.cellOn]}><T size={24}>{e}</T></Pressable>
          ))}
        </View>
        <T size={12} w={600} dim>БЫСТРЫЙ ВЫБОР</T>
        <View style={st.wrap}>{PRESETS.map(([e, t]) => <Pill key={t} onPress={() => { setEmoji(e); setText(t); }}>{`${e} ${t}`}</Pill>)}</View>
        <T size={12} w={600} dim>СКОЛЬКО ПОКАЗЫВАТЬ</T>
        <View style={st.wrap}>{DURATIONS.map(([l, d]) => <Pill key={l} on={dur === d} onPress={() => setDur(d)}>{l}</Pill>)}</View>
        <Btn title="Сохранить" height={50} disabled={busy} onPress={() => save()} style={{ marginTop: 6 }} />
        {!!me.emojiStatus && <Btn secondary title="Убрать статус" disabled={busy} onPress={() => save(true)} />}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  big: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 12, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: '11.5%', aspectRatio: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cellOn: { backgroundColor: `rgba(${C.accentRgb},0.22)` },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
