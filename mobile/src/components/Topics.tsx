import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronLeft, Lock, Pin, Plus } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { dayLabel, membersLabel } from '../lib/util';
import { useFont, fontStyle } from '../lib/fonts';
import { C } from '../lib/theme';
import { Avatar, Glass, Press, T } from './ui';

const ICONS = ['💬', '🎁', '😂', '🎧', '🎮', '📢', '💡', '🔥', '📸', '💰', '⚽', '❓'];

export function TopicIcon({ t, size = 44 }: { t: any; size?: number }) {
  return (
    <LinearGradient colors={[t.color || '#6fb9f0', shade(t.color || '#6fb9f0')]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <T w={800} size={size * 0.48} color="#fff">{t.icon || t.title?.[0]}</T>
    </LinearGradient>
  );
}
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.7)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** Forum group: list of topics (like Telegram). Tapping one opens /chat/<id>?topic=<topicId>. */
export function TopicsView({ chat }: { chat: any }) {
  const insets = useSafeAreaInsets();
  const font = useFont((s) => s.id);
  const topics = useStore((s) => s.topics[chat.id]);
  const me = useStore((s) => s.me);
  const [creating, setCreating] = useState<any>(null);
  useEffect(() => { useStore.getState().loadTopics(chat.id); }, [chat.id]);
  const isAdmin = chat.role === 'owner' || chat.role === 'admin';
  const open = (t: any) => router.push({ pathname: '/chat/[id]', params: { id: String(chat.id), topic: String(t.id) } });
  const create = async () => {
    try {
      const { topic } = await api(`/chats/${chat.id}/topics`, { body: creating });
      setCreating(null);
      useStore.getState().patchTopic(chat.id, topic, true);
      open(topic);
    } catch (e: any) { Alert.alert(e.message); }
  };
  const act = async (t: any, body: any) => {
    try {
      if (body === 'delete') { await api(`/topics/${t.id}`, { method: 'DELETE' }); return; }
      useStore.getState().patchTopic(chat.id, (await api(`/topics/${t.id}`, { method: 'PATCH', body })).topic);
    } catch (e: any) { Alert.alert(e.message); }
  };
  const menu = (t: any) => {
    if (t.general || !(isAdmin || t.createdBy === me?.id)) return;
    const opts: [string, () => void][] = [];
    if (isAdmin) opts.push([t.pinned ? 'Открепить' : 'Закрепить', () => act(t, { pinned: !t.pinned })]);
    opts.push([t.closed ? 'Открыть тему' : 'Закрыть тему', () => act(t, { closed: !t.closed })]);
    opts.push(['Удалить тему', () => Alert.alert('Удалить тему?', `«${t.title}» и все сообщения в ней`, [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => act(t, 'delete') }])]);
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: t.title, options: [...opts.map((o) => o[0]), 'Отмена'], cancelButtonIndex: opts.length, destructiveButtonIndex: opts.length - 1 }, (i) => opts[i]?.[1]());
    else Alert.alert(t.title, '', [...opts.map(([text, onPress]) => ({ text, onPress })), { text: 'Отмена', style: 'cancel' as const }]);
  };
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={topics || []}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: insets.bottom + 100, paddingHorizontal: 12, gap: 6 }}
        renderItem={({ item: t, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 30).springify().damping(18)}>
            <Press onPress={() => open(t)} onLongPress={() => menu(t)} scale={0.98}>
              <Glass radius={16} style={st.row} shadow={false}>
                <TopicIcon t={t} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <T w={700} numberOfLines={1} style={{ flexShrink: 1 }}>{t.title}</T>
                    {t.closed && <Lock size={13} color={C.text2} />}
                    {t.pinned && !t.general && <Pin size={13} color={C.text2} />}
                    {t.lastMessage && <T size={12} color={C.text2} style={{ marginLeft: 'auto' }}>{dayLabel(t.lastMessage.createdAt)}</T>}
                  </View>
                  <T size={13.5} color={C.text2} numberOfLines={1}>
                    {t.lastMessage ? `${t.lastMessage.senderName ? `${t.lastMessage.senderName}: ` : ''}${t.lastMessage.text}` : 'Сообщений пока нет'}
                  </T>
                </View>
              </Glass>
            </Press>
          </Animated.View>
        )}
      />
      {chat.isMember !== false && (
        <View style={[st.newWrap, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
          <Press onPress={() => setCreating({ title: '', icon: '💬' })} scale={0.95}>
            <View style={st.newBtn}><Plus size={18} color="#fff" /><T w={700} color="#fff">Новая тема</T></View>
          </Press>
        </View>
      )}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 80 }} />
      <View style={[st.head, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Press onPress={() => router.back()} scale={0.95}>
          <Glass radius={23} style={st.back}><ChevronLeft size={24} color={C.text} /></Glass>
        </Press>
        <View style={{ flex: 1 }}>
          <Glass radius={23} style={st.title}>
            <T w={700} numberOfLines={1}>{chat.title}</T>
            <T size={11.7} color={C.text2} numberOfLines={1}>{membersLabel(chat)} · {Math.max(0, (topics?.length || 1) - 1)} тем</T>
          </Glass>
        </View>
        <Avatar uri={chat.avatar} name={chat.title} id={chat.id} size={44} />
      </View>
      <Modal visible={!!creating} transparent animationType="fade" onRequestClose={() => setCreating(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={st.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreating(null)} />
          {creating && (
            <Animated.View entering={FadeInDown.springify().damping(16)} style={st.sheet}>
              <T w={800} size={18} center>Новая тема</T>
              <View style={{ alignItems: 'center', marginVertical: 14 }}><TopicIcon t={{ ...creating, color: '#6fb9f0' }} size={72} /></View>
              <TextInput autoFocus maxLength={64} placeholder="Название темы" placeholderTextColor={C.text3} value={creating.title} onChangeText={(v) => setCreating({ ...creating, title: v })} onSubmitEditing={create}
                style={[{ height: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text }, fontStyle(font, 400, 16)]} />
              <View style={st.icons}>
                {ICONS.map((ic) => (
                  <Pressable key={ic} onPress={() => setCreating({ ...creating, icon: ic })} style={[st.ic, creating.icon === ic && { borderColor: C.accent, backgroundColor: 'rgba(255,45,85,0.15)' }]}><T size={22}>{ic}</T></Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                <Press onPress={() => setCreating(null)} style={{ flex: 1 }}><View style={[st.btn, { backgroundColor: 'rgba(255,255,255,0.08)' }]}><T w={700} color={C.accent}>Отмена</T></View></Press>
                <Press onPress={create} disabled={!creating.title.trim()} style={{ flex: 1 }}><View style={[st.btn, { backgroundColor: C.accent, opacity: creating.title.trim() ? 1 : 0.5 }]}><T w={700} color="#fff">Создать</T></View></Press>
              </View>
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 },
  head: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingBottom: 8 },
  back: { flexDirection: 'row', alignItems: 'center', height: 46, paddingLeft: 8, paddingRight: 12 },
  title: { height: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  newWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 48, paddingHorizontal: 22, borderRadius: 24, backgroundColor: C.accent, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 24, padding: 18, backgroundColor: '#141416', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12, justifyContent: 'center' },
  ic: { width: 46, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'transparent' },
  btn: { height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
