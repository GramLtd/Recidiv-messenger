import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { checkPasscode, clearPasscode, setPasscode } from '../lib/lock';
import { C } from '../lib/theme';
import { PinPad } from '../components/LockScreen';
import { SheetHead } from '../components/Sheets';

/** Set (twice) or turn off the passcode. */
export default function Passcode() {
  const { mode = 'set' } = useLocalSearchParams<{ mode?: string }>();
  const [first, setFirst] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SheetHead title={mode === 'off' ? 'Выключить код-пароль' : 'Код-пароль'} />
      {mode === 'off' ? (
        <PinPad key="off" title="Введите текущий код" onDone={async (c) => { if (!(await checkPasscode(c))) return false; await clearPasscode(); router.back(); return true; }} />
      ) : first === null ? (
        <PinPad key="1" title="Придумайте код-пароль" subtitle="4 цифры" onDone={(c) => { setFirst(c); }} />
      ) : (
        <PinPad key="2" title="Повторите код" onDone={async (c) => {
          if (c !== first) { Alert.alert('Коды не совпали'); setFirst(null); return false; }
          await setPasscode(c); router.back(); return true;
        }} />
      )}
    </View>
  );
}
