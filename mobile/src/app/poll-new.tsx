import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, Plus, X } from 'lucide-react-native';
import { useStore } from '../lib/store';
import { useFont, fontStyle } from '../lib/fonts';
import { C } from '../lib/theme';
import { Btn, Press, T } from '../components/ui';
import { Switch } from '../components/Settings';
import { SheetHead, sheetStyle } from '../components/Sheets';

/** Create a poll / quiz (same options as the web). */
export default function PollNew() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const font = useFont((s) => s.id);
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [anonymous, setAnonymous] = useState(true);
  const [multiple, setMultiple] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [expl, setExpl] = useState('');
  const [busy, setBusy] = useState(false);
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const send = async () => {
    const chat = useStore.getState().chats.find((c) => c.id === Number(chatId));
    if (!chat) return;
    setBusy(true);
    try {
      await useStore.getState().send(chat, { text: q.trim(), media: { kind: 'poll', question: q.trim(), options: clean, anonymous, multiple: !quiz && multiple, quiz, correct: Math.min(correct, clean.length - 1), explanation: quiz ? expl : undefined } });
      router.back();
    } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  const input = [st.input, fontStyle(font, 400, 15)];
  return (
    <KeyboardAvoidingView style={sheetStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHead title={quiz ? 'Новая викторина' : 'Новый опрос'} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 10 }} keyboardShouldPersistTaps="handled">
        <T size={12} w={600} dim>ВОПРОС</T>
        <TextInput value={q} onChangeText={setQ} maxLength={255} autoFocus placeholder="О чём спросить?" placeholderTextColor={C.text3} style={input} />
        <T size={12} w={600} dim style={{ marginTop: 6 }}>ВАРИАНТЫ{quiz ? ' — ОТМЕТЬТЕ ПРАВИЛЬНЫЙ' : ''}</T>
        {opts.map((o, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {quiz && <Pressable onPress={() => setCorrect(i)} style={[st.radio, correct === i && { backgroundColor: '#34c759', borderColor: '#34c759' }]}>{correct === i && <Check size={13} color="#fff" strokeWidth={3} />}</Pressable>}
            <TextInput value={o} onChangeText={(v) => setOpts(opts.map((x, k) => (k === i ? v : x)))} maxLength={100} placeholder={`Вариант ${i + 1}`} placeholderTextColor={C.text3} style={[input, { flex: 1 }]} />
            {opts.length > 2 && <Press scale={0.85} onPress={() => { setOpts(opts.filter((_, k) => k !== i)); if (correct >= i && correct > 0) setCorrect(correct - 1); }}><X size={18} color={C.text2} /></Press>}
          </View>
        ))}
        {opts.length < 10 && <Press scale={0.96} onPress={() => setOpts([...opts, ''])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}><Plus size={16} color={C.accent} /><T w={600} color={C.accent}>Добавить вариант</T></Press>}
        <View style={st.row}><T style={{ flex: 1 }}>Анонимное голосование</T><Switch on={anonymous} onChange={setAnonymous} /></View>
        {!quiz && <View style={st.row}><T style={{ flex: 1 }}>Несколько ответов</T><Switch on={multiple} onChange={setMultiple} /></View>}
        <View style={st.row}><T style={{ flex: 1 }}>Викторина</T><Switch on={quiz} onChange={setQuiz} /></View>
        {quiz && <TextInput value={expl} onChangeText={setExpl} maxLength={200} placeholder="Пояснение после ответа (необязательно)" placeholderTextColor={C.text3} style={input} />}
        <Btn title="Отправить" height={50} disabled={busy || !q.trim() || clean.length < 2} onPress={send} style={{ marginTop: 8 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  input: { height: 46, borderRadius: 14, paddingHorizontal: 12, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.text3, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
});
