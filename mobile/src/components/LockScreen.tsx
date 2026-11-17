import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Delete, ScanFace } from 'lucide-react-native';
import { checkPasscode, tryBiometrics, useLock } from '../lib/lock';
import { C } from '../lib/theme';
import { Glass, T } from './ui';

/** 4-digit PIN pad (web .pin-keys style). Used by the lock screen and by «set passcode». */
export function PinPad({ title, subtitle, onDone, bio }: { title: string; subtitle?: string; onDone: (code: string) => Promise<boolean | void> | boolean | void; bio?: () => void }) {
  const [code, setCode] = useState('');
  const shake = useSharedValue(0);
  const sh = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const press = async (d: string) => {
    Haptics.selectionAsync();
    const next = (code + d).slice(0, 4);
    setCode(next);
    if (next.length === 4) {
      const ok = await onDone(next);
      if (ok === false) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        shake.value = withSequence(withTiming(-12, { duration: 50 }), withTiming(12, { duration: 50 }), withTiming(-8, { duration: 50 }), withTiming(0, { duration: 50 }));
        setTimeout(() => setCode(''), 250);
      } else setCode('');
    }
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', bio ? 'bio' : '', '0', 'del'];
  return (
    <View style={st.pad}>
      <Image source={require('../../assets/icon.png')} style={st.logo} />
      <T w={800} size={20} center>{title}</T>
      {!!subtitle && <T dim center size={14}>{subtitle}</T>}
      <Animated.View style={[st.dots, sh]}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={[st.dot, i < code.length && st.dotOn]} />)}
      </Animated.View>
      <View style={st.keys}>
        {keys.map((k, i) => (
          <View key={i} style={st.keyCell}>
            {k === '' ? null : (
              <Pressable onPress={() => (k === 'del' ? setCode(code.slice(0, -1)) : k === 'bio' ? bio?.() : press(k))} hitSlop={4}>
                {({ pressed }) => (k === 'del' || k === 'bio'
                  ? <View style={[st.key, { opacity: pressed ? 0.5 : 1 }]}>{k === 'del' ? <Delete size={26} color={C.text} /> : <ScanFace size={28} color={C.text} />}</View>
                  : <Glass radius={36} style={[st.key, pressed && { transform: [{ scale: 0.92 }] }]}><T w={600} size={28}>{k}</T></Glass>)}
              </Pressable>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Lock screen over the whole app + privacy cover while the app sits in the switcher. */
export function LockGate() {
  const locked = useLock((s) => s.locked);
  const covered = useLock((s) => s.covered);
  const bio = useLock((s) => s.bio);
  const unlock = useLock((s) => s.unlock);
  useEffect(() => { if (locked && bio) tryBiometrics().then((ok) => ok && unlock()); }, [locked]);
  if (locked) {
    return (
      <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, zIndex: 1000 }]}>
        <PinPad title="Введите код-пароль" onDone={async (c) => { const ok = await checkPasscode(c); if (ok) unlock(); return ok; }}
          bio={bio ? () => tryBiometrics().then((ok) => ok && unlock()) : undefined} />
      </Animated.View>
    );
  }
  if (covered) {
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 1000, alignItems: 'center', justifyContent: 'center' }]} pointerEvents="none">
        <BlurView tint="dark" intensity={90} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
        <Image source={require('../../assets/icon.png')} style={{ width: 96, height: 96, borderRadius: 26 }} />
      </View>
    );
  }
  return null;
}

const st = StyleSheet.create({
  pad: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  logo: { width: 72, height: 72, borderRadius: 20, marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 16, marginVertical: 22 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: C.text2 },
  dotOn: { backgroundColor: C.accent, borderColor: C.accent },
  keys: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 92, justifyContent: 'center' },
  keyCell: { width: 92, height: 88, alignItems: 'center', justifyContent: 'center' },
  key: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
