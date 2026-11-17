import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../lib/store';
import { usePerf } from '../../lib/perf';
import { e2eReady } from '../../lib/e2e';
import { kv } from '../../lib/db';
import { Avatar, Press, T } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { C } from '../../lib/theme';

function Row({ title, sub, right, onPress, danger }: any) {
  return (
    <Press scale={0.99} onPress={onPress} disabled={!onPress && !right} style={s.row}>
      <View style={{ flex: 1 }}><T style={danger ? { color: '#ff5a5f' } : undefined}>{title}</T>{sub ? <T dim size={13}>{sub}</T> : null}</View>
      {right ?? (onPress ? <Icon name="chevron" size={20} color={C.text3} /> : null)}
    </Press>
  );
}
const Group = ({ title, children, foot }: any) => (
  <View style={{ marginBottom: 18 }}>
    {title && <T dim size={13} style={{ paddingHorizontal: 16, marginBottom: 6, textTransform: 'uppercase' }}>{title}</T>}
    <View style={s.group}>{children}</View>
    {foot && <T dim size={12} style={{ paddingHorizontal: 16, marginTop: 6 }}>{foot}</T>}
  </View>
);

export default function Settings() {
  const insets = useSafeAreaInsets();
  const me = useStore((st) => st.me);
  const logout = useStore((st) => st.logout);
  const low = usePerf((p) => p.low);
  const setLow = usePerf((p) => p.setLow);
  const proxy = kv.get<any>('proxy', {});
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 130, paddingHorizontal: 12 }}>
      <T bold size={32} style={{ paddingHorizontal: 4, marginBottom: 14 }}>Настройки</T>
      <Press onPress={() => router.push('/profile')} style={[s.group, s.me]}>
        <Avatar uri={me?.avatar} name={me?.displayName} id={me?.id} size={60} />
        <View style={{ flex: 1 }}><T bold size={18}>{me?.displayName}</T><T dim>{me?.username ? `@${me.username}` : me?.email}</T></View>
      </Press>
      <Group title="Производительность" foot="Отключает размытие, частицы и бесконечные анимации — для максимальной плавности и экономии батареи.">
        <Row title="Режим производительности" right={<Switch value={low} onValueChange={setLow} trackColor={{ true: C.green }} />} />
      </Group>
      <Group title="Сеть и безопасность">
        <Row title="Прокси" sub={proxy.enabled ? `${proxy.type?.toUpperCase()} ${proxy.host}:${proxy.port}` : 'выключен'} onPress={() => router.push('/settings/proxy')} />
        <Row title="Сквозное шифрование" sub={e2eReady() ? 'Ключ на устройстве — секретные сообщения доступны (🔒 в чате)' : 'Войдите по сид-фразе, чтобы получить ключ'} />
      </Group>
      <Group>
        <Row title="Выйти" danger onPress={() => Alert.alert('Выйти из аккаунта?', 'Для входа понадобится сид-фраза.', [{ text: 'Отмена' }, { text: 'Выйти', style: 'destructive', onPress: logout }])} />
      </Group>
      <T dim size={12} style={{ textAlign: 'center' }}>Recidivist для iOS / Android</T>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  group: { backgroundColor: C.bg2, borderRadius: 22, overflow: 'hidden' },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginBottom: 18 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 54, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
});
