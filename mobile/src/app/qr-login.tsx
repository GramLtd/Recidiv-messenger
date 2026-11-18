import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Monitor, ShieldCheck } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { C } from '../lib/theme';
import { Btn, Glass, Rise, T } from '../components/ui';

/** Confirm a desktop / web login requested by QR (opened by the scanner or the recidivist://qr-login link). */
export default function QrLoginConfirm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useStore((s) => s.me);
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState('');
  const [state, setState] = useState<'ask' | 'busy' | 'done'>('ask');
  useEffect(() => {
    if (!me) { setErr('Сначала войдите в аккаунт на этом телефоне'); return; }
    api(`/auth/qr/${id}/info`).then(setInfo).catch((e) => setErr(e.message));
  }, [id, !!me]);
  const approve = async () => {
    setState('busy');
    try { await api(`/auth/qr/${id}/approve`, { body: {} }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setState('done'); setTimeout(() => router.back(), 1400); } catch (e: any) { setErr(e.message); setState('ask'); }
  };
  return (
    <View style={st.wrap}>
      <Rise style={{ alignItems: 'center', gap: 14, width: '100%' }}>
        <View style={st.icon}>{state === 'done' ? <ShieldCheck size={44} color="#34c759" /> : <Monitor size={44} color="#fff" />}</View>
        {err ? (
          <>
            <T w={800} size={21} center>Не получилось</T>
            <T dim center>{err}</T>
            <Btn secondary title="Закрыть" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 10 }} />
          </>
        ) : !info ? <ActivityIndicator color={C.accent} /> : state === 'done' ? (
          <>
            <T w={800} size={21} center>Готово</T>
            <T dim center>Вы вошли на «{info.device}». Сеанс появится в «Устройствах».</T>
          </>
        ) : (
          <>
            <T w={800} size={21} center>Войти на этом устройстве?</T>
            <Glass radius={18} style={{ alignSelf: 'stretch', padding: 14, gap: 4 }}>
              <T w={700}>{info.device}</T>
              <T size={13} dim>Получит доступ к аккаунту {me?.displayName}. Подтверждайте, только если это ваш компьютер и вы видите код на нём прямо сейчас.</T>
            </Glass>
            <Btn title={state === 'busy' ? 'Входим…' : 'Подтвердить вход'} disabled={state === 'busy'} onPress={approve} style={{ alignSelf: 'stretch', marginTop: 6 }} height={50} />
            <Btn secondary title="Отмена" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
          </>
        )}
      </Rise>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg2, padding: 24, paddingTop: 40, alignItems: 'center' },
  icon: { width: 86, height: 86, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});
