import 'react-native-get-random-values';
import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, ThemeProvider } from 'expo-router';
import { useStore } from '../lib/store';
import { onNotificationTap, requestNotifications } from '../lib/notify';
import { C } from '../lib/theme';
import { TopFade } from '../components/ui';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

export default function Root() {
  const booted = useStore((s) => s.booted);
  const me = useStore((s) => s.me);
  const segments = useSegments();
  useEffect(() => { useStore.getState().boot(); }, []);
  useEffect(() => {
    if (!booted) return;
    const inAuth = segments[0] === 'login';
    if (!me && !inAuth) router.replace('/login');
    else if (me && inAuth) router.replace('/(tabs)/chats');
  }, [booted, me, segments]);
  useEffect(() => {
    if (!me) return undefined;
    requestNotifications().catch(() => {});
    const sub = onNotificationTap((id) => router.push(`/chat/${id}`));
    return () => sub.remove();
  }, [me]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        {!booted ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          // native stack: real iOS push transitions + full-screen swipe-back
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, fullScreenGestureEnabled: true, animation: 'default' }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ animation: 'fade' }} />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="user/[id]" />
            <Stack.Screen name="compose" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="forward" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="settings/proxy" />
          </Stack>
        )}
        {/* dim + blur under the status bar on every screen */}
        <TopFade />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Any render error shows its message (instead of closing the app) with a retry button. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>Что-то пошло не так</Text>
      <Text selectable style={{ color: C.text2, fontSize: 14 }}>{String(error?.message || error)}</Text>
      <Text onPress={() => { retry(); }} style={{ color: C.accent, fontSize: 17, fontWeight: '600', marginTop: 10 }}>Повторить</Text>
      <Text onPress={() => router.replace('/(tabs)/chats')} style={{ color: C.accent, fontSize: 17, fontWeight: '600' }}>К чатам</Text>
    </ScrollView>
  );
}
