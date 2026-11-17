import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View, Linking } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useStore } from '../lib/store';
import { isValid } from '../lib/seed';
import { GlassButton, T } from '../components/ui';
import { C } from '../lib/theme';
import { API_URL } from '../lib/config';

export default function Login() {
  const login = useStore((s) => s.login);
  const [phrase, setPhrase] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr('');
    if (!isValid(phrase)) return setErr('Проверьте 12 слов и их порядок');
    setBusy(true);
    try { await login(phrase); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 22, gap: 16 }}>
        <Animated.View entering={FadeIn.duration(600)} style={{ alignItems: 'center' }}>
          <Image source={require('../../assets/icon.png')} style={{ width: 110, height: 110, borderRadius: 32 }} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(120).springify()}><T bold size={32} style={{ textAlign: 'center' }}>Recidivist</T></Animated.View>
        <Animated.View entering={FadeInDown.delay(200).springify()}><T dim style={{ textAlign: 'center' }}>Войдите по сид-фразе из 12 слов. Фраза не покидает устройство.</T></Animated.View>
        <Animated.View entering={FadeInDown.delay(280).springify()}>
          <TextInput
            value={phrase} onChangeText={setPhrase} placeholder="слово1 слово2 … слово12" placeholderTextColor={C.text3}
            autoCapitalize="none" autoCorrect={false} multiline secureTextEntry={false}
            style={s.input}
          />
        </Animated.View>
        {!!err && <T style={{ color: '#ff5a5f', textAlign: 'center' }}>{err}</T>}
        <Animated.View entering={FadeInDown.delay(360).springify()} style={{ gap: 10 }}>
          <GlassButton title={busy ? 'Проверяем…' : 'Войти'} accent onPress={go} />
          <GlassButton title="Создать аккаунт" onPress={() => Linking.openURL(API_URL)} />
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({ input: { minHeight: 110, borderRadius: 18, padding: 14, color: C.text, fontSize: 17, backgroundColor: C.bg3, textAlignVertical: 'top' } });
