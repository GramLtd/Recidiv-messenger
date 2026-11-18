import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { C } from '../lib/theme';
import { Btn, Glass, Press, T } from '../components/ui';

/** Scan the QR from the desktop / web login screen («Подключить устройство»). */
export const qrIdFrom = (data: string) => {
  const m = String(data || '').match(/(?:qr-login\?id=|qr-login\/|\/qr\/)([A-Za-z0-9_-]{20,})/);
  return m ? m[1] : null;
};

export default function QrScan() {
  const insets = useSafeAreaInsets();
  const [perm, ask] = useCameraPermissions();
  const [bad, setBad] = useState(false);
  const done = useRef(false);
  const onScan = ({ data }: { data: string }) => {
    if (done.current) return;
    const id = qrIdFrom(data);
    if (!id) { setBad(true); return; }
    done.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace({ pathname: '/qr-login', params: { id } });
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {perm?.granted ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
      ) : (
        <View style={st.center}>
          <T w={700} size={17} center>Нужен доступ к камере</T>
          <T dim center style={{ marginTop: 6, marginBottom: 16 }}>Чтобы отсканировать QR-код со страницы входа.</T>
          <Btn title={perm?.canAskAgain === false ? 'Открыть настройки' : 'Разрешить'} onPress={() => (perm?.canAskAgain === false ? Linking.openSettings() : ask())} style={{ alignSelf: 'stretch' }} />
        </View>
      )}
      {perm?.granted && (
        <View pointerEvents="none" style={st.center}>
          <View style={st.frame}>
            <View style={[st.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 22 }]} />
            <View style={[st.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 22 }]} />
            <View style={[st.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 22 }]} />
            <View style={[st.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 22 }]} />
          </View>
          <Glass radius={16} style={{ marginTop: 26, paddingHorizontal: 16, paddingVertical: 10 }}>
            <T w={600} center color="#fff">{bad ? 'Это не код входа Recidivist' : 'Наведите камеру на QR-код на экране компьютера'}</T>
          </Glass>
        </View>
      )}
      <Press onPress={() => router.back()} scale={0.9} style={{ position: 'absolute', top: insets.top + 10, left: 16 }}>
        <Glass radius={20} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><X size={20} color="#fff" /></Glass>
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  center: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 28 },
  frame: { width: 250, height: 250 },
  corner: { position: 'absolute', width: 54, height: 54, borderColor: C.accent },
});
