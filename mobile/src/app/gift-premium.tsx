import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useCached } from '../lib/useCached';
import { fmtNum } from '../lib/util';
import { C } from '../lib/theme';
import { Btn, Glass, Press, SparkIcon, T } from '../components/ui';
import { SheetHead, sheetStyle } from '../components/Sheets';

/** Gift Recidivist Premium to someone (web GiftPremiumModal). */
export default function GiftPremium() {
  const p = useLocalSearchParams<{ toUserId: string; toName?: string }>();
  const [data] = useCached<any>('/premium');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const price = (data?.price || 0) * months;
  const buy = async () => {
    setBusy(true);
    try { const r = await api('/premium/buy', { body: { months, toUserId: Number(p.toUserId) } }); if (r.user) useStore.getState().setMe(r.user); Alert.alert(`Premium подарен ${p.toName || ''} ⭐`); router.back(); }
    catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <View style={sheetStyle}>
      <SheetHead title="Подарить Premium" />
      <View style={{ padding: 16, gap: 12, alignItems: 'center' }}>
        <LinearGradient colors={['#5b2bff', '#ff4f7b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.star}><SparkIcon size={44} fill="#fff" /></LinearGradient>
        <T w={700} size={16}>{p.toName}</T>
        <T size={13} dim center style={{ lineHeight: 18 }}>Получатель получит искру у имени, своё оформление имени и профиля, особые шрифты и расширенные лимиты.</T>
        <Glass radius={999} shadow={false} style={st.seg}>
          {[1, 3, 12].map((m) => (
            <Press key={m} scale={0.95} onPress={() => setMonths(m)} style={[st.segBtn, months === m && st.segOn]}><T w={700} color={months === m ? C.text : C.text2}>{m} мес.</T></Press>
          ))}
        </Glass>
        <Btn height={50} style={{ alignSelf: 'stretch' }} disabled={busy || !data} title={`Подарить за ✦ ${fmtNum(price)}`} onPress={buy} />
      </View>
    </View>
  );
}
const st = StyleSheet.create({
  star: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  seg: { alignSelf: 'stretch', flexDirection: 'row', padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
});
