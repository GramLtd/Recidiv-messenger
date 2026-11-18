import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Headphones, LogOut, Mic, MicOff, Minimize2, Phone, PhoneOff, RefreshCw, Video, VideoOff } from 'lucide-react-native';
import { useCall, acceptCall, declineCall, hangup, toggleMute, toggleCam, flipCam, useRoom, leaveRoom, toggleRoomMute, wireCalls } from '../lib/calls';
import { StreamView } from '../lib/webrtc';
import { useStore } from '../lib/store';
import { C } from '../lib/theme';
import { Avatar, T } from './ui';

function Btn({ onPress, children, color = 'rgba(255,255,255,0.16)', size = 64 }: any) {
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
      {children}
    </Pressable>
  );
}

function useTimer(start?: number) {
  const [, t] = useState(0);
  useEffect(() => { if (!start) return undefined; const i = setInterval(() => t((x) => x + 1), 1000); return () => clearInterval(i); }, [start]);
  if (!start) return '';
  const s = Math.floor((Date.now() - start) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Full-screen call (incoming / outgoing / active), minimisable, and the voice-room bar. Mounted once in the root layout. */
export function CallLayer() {
  const insets = useSafeAreaInsets();
  useEffect(() => { wireCalls(); }, []);
  const { call, local, remote, muted, camOff } = useCall();
  const room = useRoom();
  const me = useStore((s) => s.me);
  const [mini, setMini] = useState(false);
  const time = useTimer(call?.status === 'active' ? call.startedAt : undefined);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (call && (call.status === 'ringing' || call.status === 'calling')) {
      pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1, false);
      if (call.dir === 'in') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else pulse.value = 0;
    if (!call) setMini(false);
  }, [call?.status, !!call]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.5 * (1 - pulse.value), transform: [{ scale: 1 + pulse.value * 0.6 }] }));
  const remoteVideo = !!remote?.getVideoTracks?.().length;
  const ringing = call?.dir === 'in' && call.status === 'ringing';
  const status = !call ? '' : call.status === 'calling' ? 'Вызов…' : call.status === 'ringing' ? (call.video ? 'Входящий видеозвонок' : 'Входящий звонок') : call.status === 'connecting' ? 'Соединение…' : time;
  return (
    <>
      {call && !mini && (
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient colors={['#3a1420', '#0b0b0d']} style={StyleSheet.absoluteFill} />
          {remoteVideo && <StreamView stream={remote} style={StyleSheet.absoluteFill} />}
          {!remoteVideo && remote && <View style={{ width: 1, height: 1, opacity: 0 }}><StreamView stream={remote} style={{ width: 1, height: 1 }} /></View>}
          <View style={[st.top, { paddingTop: insets.top + 8 }]}>
            {!ringing && <Pressable onPress={() => setMini(true)} style={st.round}><Minimize2 size={18} color="#fff" /></Pressable>}
          </View>
          {!remoteVideo && (
            <View style={st.center}>
              <View>
                <Animated.View style={[st.ring, ring]} />
                <Avatar uri={call.peer?.avatar} name={call.peer?.displayName} id={call.peer?.id} size={120} />
              </View>
              <T w={800} size={26} color="#fff" style={{ marginTop: 16 }}>{call.peer?.displayName}</T>
              <T color="rgba(255,255,255,0.75)">{status}</T>
            </View>
          )}
          {remoteVideo && <View style={[st.badge, { top: insets.top + 12 }]}><T w={700} color="#fff">{call.peer?.displayName} · {status}</T></View>}
          {local && !camOff && local.getVideoTracks?.().length > 0 && <StreamView stream={local} mirror style={[st.self, { top: insets.top + 60 }]} />}
          <View style={[st.controls, { paddingBottom: insets.bottom + 30 }]}>
            {ringing ? (
              <>
                <Btn onPress={declineCall} color="#ff3b30"><PhoneOff size={26} color="#fff" /></Btn>
                <Btn onPress={acceptCall} color="#34c759">{call.video ? <Video size={26} color="#fff" /> : <Phone size={26} color="#fff" />}</Btn>
              </>
            ) : (
              <>
                <Btn onPress={toggleMute} color={muted ? '#fff' : undefined}>{muted ? <MicOff size={24} color="#111" /> : <Mic size={24} color="#fff" />}</Btn>
                <Btn onPress={toggleCam} color={!camOff ? '#fff' : undefined}>{camOff ? <VideoOff size={24} color="#fff" /> : <Video size={24} color="#111" />}</Btn>
                {!camOff && <Btn onPress={flipCam}><RefreshCw size={22} color="#fff" /></Btn>}
                <Btn onPress={hangup} color="#ff3b30"><PhoneOff size={26} color="#fff" /></Btn>
              </>
            )}
          </View>
        </View>
      )}
      {call && mini && (
        <Pressable onPress={() => setMini(false)} style={[st.pill, { top: insets.top + 6 }]}>
          <View style={st.dot} />
          <T w={700} color="#fff" style={{ flex: 1 }} numberOfLines={1}>{call.peer?.displayName} · {status}</T>
          <Pressable onPress={hangup} hitSlop={10}><PhoneOff size={18} color="#fff" /></Pressable>
          {remote && <View style={{ width: 1, height: 1, opacity: 0 }}><StreamView stream={remote} style={{ width: 1, height: 1 }} /></View>}
        </Pressable>
      )}
      {room.chatId && (
        <View style={[st.room, { bottom: insets.bottom + 90 }]}>
          <Headphones size={18} color={C.text} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={700} size={13} numberOfLines={1}>Голосовая комната · {room.title}</T>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
              <Avatar uri={me?.avatar} name={me?.displayName} id={me?.id} size={24} />
              {Object.entries(room.peers).map(([id, p]: any) => (
                <View key={id}>
                  <Avatar uri={p.user?.avatar} name={p.user?.displayName} id={p.user?.id} size={24} />
                  {p.stream && <View style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}><StreamView stream={p.stream} style={{ width: 1, height: 1 }} /></View>}
                </View>
              ))}
            </View>
          </View>
          <Btn size={38} onPress={toggleRoomMute} color={room.muted ? '#fff' : 'rgba(255,255,255,0.1)'}>{room.muted ? <MicOff size={17} color="#111" /> : <Mic size={17} color={C.text} />}</Btn>
          <Btn size={38} onPress={leaveRoom} color="#ff3b30"><LogOut size={17} color="#fff" /></Btn>
        </View>
      )}
    </>
  );
}

const st = StyleSheet.create({
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row' },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  ring: { position: 'absolute', left: -10, top: -10, right: -10, bottom: -10, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.35)' },
  badge: { position: 'absolute', alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  self: { position: 'absolute', right: 16, width: 110, height: 150, borderRadius: 16, overflow: 'hidden' },
  controls: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'center', gap: 22 },
  pill: { position: 'absolute', left: 12, right: 12, height: 44, borderRadius: 22, backgroundColor: '#2fb553', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  room: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 20, backgroundColor: 'rgba(28,28,30,0.95)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.15)' },
});
