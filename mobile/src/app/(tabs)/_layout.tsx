import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Tabs, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass, Press, Avatar } from '../../components/ui';
import { useStore } from '../../lib/store';
import { C } from '../../lib/theme';

const ITEMS = [
  { name: 'feed', label: 'Лента', glyph: '▤' },
  { name: 'chats', label: 'Чаты', glyph: '◯' },
  { name: '+', label: '', glyph: '+' },
  { name: 'profile', label: 'Профиль', glyph: '' },
  { name: 'settings', label: 'Настройки', glyph: '⚙' },
];

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const me = useStore((s) => s.me);
  const unread = useStore((s) => s.chats.reduce((n: number, c: any) => n + (c.muted ? 0 : c.unread || 0), 0));
  const current = state.routes[state.index]?.name;
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(10, insets.bottom - 6) }]}>
      <Glass radius={32} intensity={55} style={s.bar}>
        <View style={s.row}>
          {ITEMS.map((it) => {
            if (it.name === '+') {
              return (
                <Press key="+" haptic onPress={() => router.push('/compose')} style={s.plus}>
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '600', marginTop: -2 }}>+</Text>
                </Press>
              );
            }
            const on = current === it.name;
            return (
              <Press key={it.name} haptic onPress={() => navigation.navigate(it.name)} style={[s.item, on && s.itemOn]}>
                {it.name === 'profile' ? <Avatar uri={me?.avatar} name={me?.displayName} id={me?.id} size={26} /> : <Text style={{ fontSize: 22, color: on ? '#fff' : C.text2 }}>{it.glyph}</Text>}
                <Text style={[s.label, on && { color: '#fff' }]}>{it.label}</Text>
                {it.name === 'chats' && unread > 0 && <View style={s.badge}><Text style={s.badgeT}>{unread > 99 ? '99+' : unread}</Text></View>}
              </Press>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12 },
  bar: { height: 66 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  item: { flex: 1, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', gap: 2 },
  itemOn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  label: { fontSize: 10.5, fontWeight: '600', color: C.text2 },
  plus: { width: 54, height: 42, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginHorizontal: 6 },
  badge: { position: 'absolute', top: 4, right: '22%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '700' },
});

export const unstable_settings = { initialRouteName: 'chats' };
