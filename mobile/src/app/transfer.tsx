import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useFont, fontStyle } from '../lib/fonts';
import { fmtNum } from '../lib/util';
import { playSend } from '../lib/sound';
import { C } from '../lib/theme';
import { Avatar, Btn, Press, Spark, T } from '../components/ui';
import { SheetHead, UserPicker, sheetStyle } from '../components/Sheets';

/** Send sparks to a person (web TransferModal). */
export default function Transfer() {
  const p = useLocalSearchParams<{ toUserId?: string; toName?: string; toAvatar?: string }>();
  const me = useStore((s) => s.me);
  const font = useFont((s) => s.id);
  const [to, setTo] = useState<any>(p.toUserId ? { id: Number(p.toUserId), displayName: p.toName, avatar: p.toAvatar || null } : null);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (!to) {
    return (
      <View style={sheetStyle}>
        <SheetHead title="Кому отправить искры?" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled"><UserPicker onPick={setTo} /></ScrollView>
      </View>
    );
  }
  const n = Number(amount) || 0;
  const send = async () => {
    setBusy(true);
    try { await api('/wallet/transfer', { body: { toUserId: to.id, amount: n, comment } }); playSend(); Alert.alert(`Отправлено ${fmtNum(n)} ✦ ${to.displayName}`); router.back(); }
    catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={sheetStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHead title="Отправить искры" />
      <View style={{ padding: 16, gap: 14, alignItems: 'center' }}>
        <Press onPress={() => setTo(null)} style={{ alignItems: 'center', gap: 6 }}>
          <Avatar uri={to.avatar} name={to.displayName} id={to.id} size={72} />
          <T w={700} size={16}>{to.displayName}</T>
          <T size={12.5} color={C.accent}>Изменить</T>
        </Press>
        <TextInput autoFocus keyboardType="number-pad" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} placeholder="0" placeholderTextColor={C.text3}
          style={[st.amount, fontStyle(font, 800, 34)]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><T size={13} dim>Ваш баланс:</T><Spark amount={me.balance} size={13} /></View>
        <TextInput value={comment} onChangeText={setComment} maxLength={140} placeholder="Комментарий (необязательно)" placeholderTextColor={C.text3} style={[st.input, fontStyle(font, 400, 15)]} />
        <Btn height={50} style={{ alignSelf: 'stretch' }} disabled={busy || !(n > 0) || n > me.balance} title={n > me.balance ? 'Недостаточно искр' : `Отправить ✦ ${fmtNum(n)}`} onPress={send} />
      </View>
    </KeyboardAvoidingView>
  );
}
const st = StyleSheet.create({
  amount: { color: C.text, textAlign: 'center', width: 220, alignSelf: 'center', height: 64, borderRadius: 18, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16 },
  input: { alignSelf: 'stretch', height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
});
