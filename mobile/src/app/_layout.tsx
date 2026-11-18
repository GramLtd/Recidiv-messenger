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
import { LockGate } from '../components/LockScreen';
import { initLock } from '../lib/lock';

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent } };

export default function Root() {
  const booted = useStore((s) => s.booted);
  const me = useStore((s) => s.me);
  const segments = useSegments();
  useEffect(() => { useStore.getState().boot(); initLock(); }, []);
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
            <Stack.Screen name="settings/[page]" />
            <Stack.Screen name="post/[id]" />
            <Stack.Screen name="music" />
            <Stack.Screen name="qr-scan" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="qr-login" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.62, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="u/[name]" options={{ animation: 'none' }} />
            <Stack.Screen name="shop" options={{ presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="market" options={{ presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="transfer" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="sell" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.65, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="gift-premium" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="gift-transfer" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="newchat" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.9, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="topup" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.8, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg2 } }} />
            <Stack.Screen name="passcode" options={{ presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: C.bg } }} />
            <Stack.Screen name="media" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
            <Stack.Screen name="story/[userId]" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: true }} />
            <Stack.Screen name="gift/[id]" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.85, 1], sheetGrabberVisible: true, sheetCornerRadius: 30, contentStyle: { backgroundColor: C.bg2 } }} />
          </Stack>
        )}
        {/* dim + blur under the status bar on every screen */}
        <TopFade />
        {me && <LockGate />}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Any render error shows its message (instead of closing the app) with a retry button. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <ScrollView contentInsetAdjustmentBehavior="never" style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 24, paddingTop: 80, gap: 14 }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>Что-то пошло не так</Text>
      <Text selectable style={{ color: C.text2, fontSize: 14 }}>{String(error?.message || error)}</Text>
      <Text onPress={() => { retry(); }} style={{ color: C.accent, fontSize: 17, fontWeight: '600', marginTop: 10 }}>Повторить</Text>
      <Text onPress={() => router.replace('/(tabs)/chats')} style={{ color: C.accent, fontSize: 17, fontWeight: '600' }}>К чатам</Text>
    </ScrollView>
  );
}
