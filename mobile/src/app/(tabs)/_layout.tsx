import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { router } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger, useTabTrigger } from 'expo-router/ui';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { AccentFill, Avatar, Glass, Press } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useStore } from '../../lib/store';
import { C } from '../../lib/theme';

/*
 * Tabs are rendered by our own lightweight slot (plain views, no native screen container) and a floating
 * liquid-glass bar copied from the web client: sliding glass indicator, Lucide icons, accent "+" pill.
 */
const TABS = [
  { name: 'feed', href: '/feed', label: 'Лента', icon: 'feed' },
  { name: 'chats', href: '/chats', label: 'Чаты', icon: 'chats' },
  { name: '+', href: '', label: '', icon: 'plus' },
  { name: 'profile', href: '/profile', label: 'Профиль', icon: '' },
  { name: 'settings', href: '/settings', label: 'Настройки', icon: 'settings' },
] as const;
const ROUTES = TABS.filter((t) => t.name !== '+');

/** One tab's scene: kept mounted after first visit, fades/slides in when it becomes active. */
function Scene({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const o = useSharedValue(focused ? 1 : 0);
  useEffect(() => { o.value = focused ? withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }) : 0; }, [focused]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (1 - o.value) * 8 }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st, !focused && { display: 'none' }]} pointerEvents={focused ? 'auto' : 'none'}>
      {children}
    </Animated.View>
  );
}

function Item({ tab, index, onFocus }: { tab: (typeof TABS)[number]; index: number; onFocus: (i: number) => void }) {
  const { triggerProps, trigger } = useTabTrigger({ name: tab.name, href: tab.href as any });
  const me = useStore((s) => s.me);
  const unread = useStore((s) => s.chats.reduce((n: number, c: any) => n + (c.muted ? 0 : c.unread || 0), 0));
  const on = !!trigger?.isFocused;
  useEffect(() => { if (on) onFocus(index); }, [on]);
  const color = on ? '#fff' : C.text2;
  return (
    <Press scale={0.8} onPress={() => { Haptics.selectionAsync(); triggerProps.onPress?.(undefined as any); }} style={s.item}>
      {tab.name === 'profile'
        ? <View style={[s.ava, on && s.avaOn]}><Avatar uri={me?.avatar} name={me?.displayName} id={me?.id} size={24} /></View>
        : <Icon name={tab.icon as any} size={23} color={color} stroke={on ? 2.3 : 1.8} />}
      <Text numberOfLines={1} style={[s.label, { color }]}>{tab.label}</Text>
      {tab.name === 'chats' && unread > 0 && <View style={s.badge}><Text style={s.badgeT}>{unread > 99 ? '99+' : unread}</Text></View>}
    </Press>
  );
}

function TabBar() {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const x = useSharedValue(1);
  const slot = (w - 12) / TABS.length;
  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * slot }] }));
  const focus = (i: number) => { x.value = withSpring(i, { damping: 17, stiffness: 190, mass: 0.8 }); };
  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(12, insets.bottom - 4) }]}>
      <View style={s.shadow}>
        <Glass radius={33} intensity={30} strong style={s.bar}>
          <View style={s.row} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
            {w > 0 && (
              <Animated.View pointerEvents="none" style={[s.indicator, { width: slot }, ind]}>
                <LinearGradient colors={['rgba(255,255,255,0.24)', 'rgba(255,255,255,0.07)']} style={s.indInner} />
              </Animated.View>
            )}
            {TABS.map((t, i) => t.name === '+'
              ? (
                <Press key="+" scale={0.82} haptic onPress={() => router.push('/compose')} style={s.item}>
                  <AccentFill radius={19} style={s.plus}><Icon name="plus" size={24} stroke={2.6} /></AccentFill>
                </Press>
              )
              : <Item key={t.name} tab={t} index={i} onFocus={focus} />)}
          </View>
        </Glass>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs style={{ flex: 1, backgroundColor: C.bg }}>
      <TabSlot
        detachInactiveScreens={false}
        style={{ flex: 1 }}
        renderFn={(d, { isFocused, loaded }) => (!loaded && !isFocused ? null : <Scene key={d.route.key} focused={isFocused}>{d.render()}</Scene>)}
      />
      <TabList style={{ display: 'none' }}>
        {ROUTES.map((t) => <TabTrigger key={t.name} name={t.name} href={t.href as any} />)}
      </TabList>
      <TabBar />
    </Tabs>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10 },
  shadow: { borderRadius: 33, shadowColor: '#000', shadowOpacity: 0.65, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  bar: { height: 66 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  indicator: { position: 'absolute', left: 6, top: 6, bottom: 6, paddingHorizontal: 3 },
  indInner: { flex: 1, borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 10.5, fontWeight: '600' },
  plus: { width: 46, height: 38, alignItems: 'center', justifyContent: 'center' },
  ava: { borderRadius: 14, padding: 1.5 },
  avaOn: { backgroundColor: 'rgba(255,255,255,0.55)' },
  badge: { position: 'absolute', top: 6, left: '52%', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 2, borderColor: '#000' },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
