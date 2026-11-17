import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { fmtNum } from '../lib/util';
import { C } from '../lib/theme';
import { Radial, Rise, T } from './ui';

export function WalletCard({ amount, owner }: { amount: number; owner: string }) {
  return (
    <Rise>
      <View style={st.wcard}>
        <LinearGradient colors={['#1a1a1d', '#050505']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Radial inner={`rgba(${C.accentRgb},0.55)`} outer="rgba(0,0,0,0)" cx="80%" cy="120%" stop={0.55} style={StyleSheet.absoluteFill} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <Image source={require('../../assets/brand-icon.png')} style={{ width: 46, height: 46, borderRadius: 14 }} />
          <View style={{ flex: 1 }}>
            <T w={900} size={24} color="#ffe3e6" style={{ letterSpacing: -0.5 }}>Recidivist</T>
            <View style={st.wtag}><T w={800} size={9.3} color="#111" style={{ letterSpacing: 2 }}>CARD</T></View>
          </View>
          <LinearGradient colors={['#e8e8e8', '#9a9a9a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.wchip} />
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <T w={900} size={39} color="#fff" style={{ letterSpacing: -0.8 }}>{fmtNum(amount || 0)}</T>
          <T w={800} size={13} color={C.accent}>✦ Искры</T>
        </View>
        <T w={700} color="rgba(255,255,255,0.85)" style={{ marginTop: 2 }}>{owner}</T>
      </View>
    </Rise>
  );
}

const st = StyleSheet.create({
  wcard: { borderRadius: 26, padding: 20, aspectRatio: 1.6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  wtag: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.85)' },
  wchip: { width: 44, height: 34, borderRadius: 8 },
});
