import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Gavel } from 'lucide-react-native';
import { api } from '../lib/api';
import { useFont, fontStyle } from '../lib/fonts';
import { C } from '../lib/theme';
import { Btn, Pill, T } from '../components/ui';
import { CollectibleArt } from '../components/GiftArt';
import { SheetHead, sheetStyle } from '../components/Sheets';

/** Start an auction for a collectible gift or a username. */
export default function AuctionNew() {
  const { userGiftId, username } = useLocalSearchParams<{ userGiftId?: string; username?: string }>();
  const font = useFont((s) => s.id);
  const [ug, setUg] = useState<any>(null);
  const [price, setPrice] = useState('');
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (userGiftId) api(`/user-gifts/${userGiftId}`).then((r) => setUg(r.userGift)).catch(() => {}); }, [userGiftId]);
  const create = async () => {
    setBusy(true);
    try {
      await api('/auctions', { body: userGiftId ? { kind: 'gift', userGiftId: Number(userGiftId), startPrice: Number(price), hours } : { kind: 'username', username, startPrice: Number(price), hours } });
      Alert.alert('Аукцион запущен 🔨'); router.back();
    } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={sheetStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHead title="Аукцион" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 12 }} keyboardShouldPersistTaps="handled">
        {ug?.collectible ? <CollectibleArt col={ug.collectible} style={{ height: 170, borderRadius: 18 }} /> : username ? <View style={st.uname}><T w={800} size={22}>@{username}</T></View> : null}
        <T size={12} w={600} dim>СТАРТОВАЯ ЦЕНА</T>
        <TextInput value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" autoFocus placeholder="Например, 500" placeholderTextColor={C.text3} style={[st.input, fontStyle(font, 600, 16)]} />
        <T size={12} w={600} dim>ДЛИТЕЛЬНОСТЬ</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[[1, '1 час'], [6, '6 часов'], [12, '12 часов'], [24, 'Сутки'], [72, '3 дня']].map(([h, l]) => <Pill key={h} on={hours === h} onPress={() => setHours(h as number)}>{l as string}</Pill>)}</View>
        <T size={12} dim>Покупатели делают ставки; победитель получает лот, вы — сумму ставки минус комиссия маркета. Отменить можно, пока нет ставок.</T>
        <Btn title="Запустить аукцион" icon={<Gavel size={16} color="#fff" />} height={50} disabled={busy || !Number(price)} onPress={create} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const st = StyleSheet.create({
  uname: { height: 120, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  input: { height: 46, borderRadius: 14, paddingHorizontal: 12, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
});
