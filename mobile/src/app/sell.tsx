import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../lib/api';
import { cache } from '../lib/db';
import { useFont, fontStyle } from '../lib/fonts';
import { fmtNum } from '../lib/util';
import { C } from '../lib/theme';
import { Btn, Radial, Spark, T } from '../components/ui';
import { CollectibleArt } from '../components/GiftArt';
import { SheetHead, sheetStyle } from '../components/Sheets';

/** Put a collectible gift or a username on the market (web SellModal). */
export default function Sell() {
  const { userGiftId, username } = useLocalSearchParams<{ userGiftId?: string; username?: string }>();
  const font = useFont((s) => s.id);
  const [ug, setUg] = useState<any>(() => (userGiftId ? cache.get<any>(`api:/user-gifts/${userGiftId}`)?.userGift : null));
  const [fee, setFee] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/config/public').then((r) => setFee(r.marketFeePercent)).catch(() => {});
    if (userGiftId) api(`/user-gifts/${userGiftId}`).then((r) => setUg(r.userGift)).catch(() => {});
  }, []);
  const n = Number(price) || 0;
  const cut = fee != null ? Math.floor((n * fee) / 100) : 0;
  const submit = async () => {
    setBusy(true);
    try {
      await api('/market/listings', { body: userGiftId ? { kind: 'gift', userGiftId: Number(userGiftId), price: n } : { kind: 'username', username, price: n } });
      Alert.alert('Выставлено на маркет');
      router.back();
    } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={sheetStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHead title="Продать на маркете" />
      <View style={{ padding: 16, gap: 12, alignItems: 'center' }}>
        {ug?.collectible ? <CollectibleArt col={ug.collectible} style={{ width: 120, height: 120, borderRadius: 16 }} />
          : <View style={{ alignSelf: 'stretch', height: 110, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
              <Radial inner={`rgba(${C.accentRgb},0.6)`} outer="#000" cx="30%" cy="20%" stop={0.8} style={StyleSheet.absoluteFill} /><T w={800} size={20} color="#fff">@{username}</T></View>}
        <T w={700}>{ug ? `${ug.gift.name} #${ug.collectible?.number}` : `@${username}`}</T>
        <TextInput autoFocus keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} placeholder="Цена" placeholderTextColor={C.text3}
          style={[st.input, fontStyle(font, 700, 22)]} />
        {fee != null && n > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <T size={13} dim>Комиссия {fee}%:</T><Spark amount={cut} size={13} /><T size={13} dim>· вы получите</T><Spark amount={n - cut} size={13} />
          </View>
        )}
        <Btn height={50} style={{ alignSelf: 'stretch' }} disabled={busy || !(n > 0)} title={n > 0 ? `Выставить за ✦ ${fmtNum(n)}` : 'Выставить'} onPress={submit} />
      </View>
    </KeyboardAvoidingView>
  );
}
const st = StyleSheet.create({ input: { alignSelf: 'stretch', textAlign: 'center', height: 60, borderRadius: 16, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text } });
