import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kv } from '../../lib/db';
import { applyProxy } from '../../lib/proxy';
import { connect } from '../../lib/socket';
import { GlassButton, Press, T } from '../../components/ui';
import { C } from '../../lib/theme';

/** Telegram-style proxy settings: HTTP or SOCKS5, applied to all app traffic. */
export default function ProxyScreen() {
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<any>(() => ({ enabled: false, type: 'socks5', host: '', port: '1080', user: '', pass: '', ...kv.get('proxy', {}) }));
  const set = (k: string) => (v: any) => setP({ ...p, [k]: v });
  const save = async () => {
    if (p.enabled && (!p.host || !Number(p.port))) return Alert.alert('Укажите адрес и порт');
    kv.set('proxy', p);
    const ok = await applyProxy(p);
    connect();
    Alert.alert('Прокси', ok ? (p.enabled ? 'Прокси включён' : 'Прокси выключен') : 'Сохранено. Перезапустите приложение, чтобы применить.');
    router.back();
  };
  return (
    <ScrollView contentInsetAdjustmentBehavior="never" style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Press onPress={() => router.back()}><T size={30}>‹</T></Press>
        <T bold size={24}>Прокси</T>
      </View>
      <View style={s.card}>
        <View style={s.row}><T style={{ flex: 1 }}>Использовать прокси</T><Switch value={p.enabled} onValueChange={set('enabled')} trackColor={{ true: C.green }} /></View>
        <View style={[s.row, { gap: 8 }]}>
          {['socks5', 'http'].map((t) => (
            <Press key={t} onPress={() => set('type')(t)} style={[s.chip, p.type === t && { backgroundColor: C.accent }]}><T bold size={14}>{t.toUpperCase()}</T></Press>
          ))}
        </View>
        {[['host', 'Сервер (IP или домен)'], ['port', 'Порт'], ['user', 'Логин (необязательно)'], ['pass', 'Пароль (необязательно)']].map(([k, l]) => (
          <TextInput key={k} value={String(p[k] || '')} onChangeText={set(k)} placeholder={l} placeholderTextColor={C.text2} autoCapitalize="none" autoCorrect={false}
            keyboardType={k === 'port' ? 'number-pad' : 'default'} secureTextEntry={k === 'pass'} style={s.input} />
        ))}
      </View>
      <T dim size={13}>Весь трафик приложения (сообщения, медиа, обновления) пойдёт через прокси. Сообщения при этом получают постоянное соединение через long-polling.</T>
      <GlassButton title="Сохранить" accent onPress={save} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: C.bg2, borderRadius: 22, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 14, backgroundColor: C.bg3 },
  input: { height: 46, borderRadius: 14, backgroundColor: C.bg3, color: C.text, paddingHorizontal: 14, fontSize: 16 },
});
