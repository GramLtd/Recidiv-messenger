import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useFont, fontStyle } from '../lib/fonts';
import { C } from '../lib/theme';
import { Avatar, Btn, T } from '../components/ui';
import { SheetHead, UserPicker, sheetStyle } from '../components/Sheets';

/** New private chat / group / channel (web NewChatModal). */
export default function NewChat() {
  const { type = 'private' } = useLocalSearchParams<{ type?: string }>();
  const font = useFont((s) => s.id);
  const [sel, setSel] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const open = (chat: any) => { useStore.getState().upsertChat(chat); useStore.getState().refreshChats().catch(() => {}); router.back(); setTimeout(() => router.push(`/chat/${chat.id}`), 250); };
  if (type === 'private') {
    return (
      <View style={sheetStyle}>
        <SheetHead title="Новое сообщение" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <UserPicker onPick={async (u) => { try { open((await api('/chats/private', { body: { userId: u.id } })).chat); } catch (e: any) { Alert.alert(e.message); } }} />
        </ScrollView>
      </View>
    );
  }
  const channel = type === 'channel';
  const create = async () => {
    setBusy(true);
    try { open((await api(`/chats/${type}`, { body: { title, username: channel && username ? username : undefined, memberIds: sel.map((u) => u.id) } })).chat); }
    catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={sheetStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHead title={channel ? 'Новый канал' : 'Новая группа'} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20, gap: 10 }} keyboardShouldPersistTaps="handled">
        <TextInput value={title} onChangeText={setTitle} maxLength={128} placeholder={channel ? 'Название канала' : 'Название группы'} placeholderTextColor={C.text3} style={[st.input, fontStyle(font, 600, 16)]} />
        {channel && <TextInput value={username} onChangeText={(v) => setUsername(v.replace(/[^a-zA-Z0-9_]/g, ''))} autoCapitalize="none" placeholder="Публичная ссылка @username (необязательно)" placeholderTextColor={C.text3} style={[st.input, fontStyle(font, 400, 15)]} />}
        {sel.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {sel.map((u) => <View key={u.id} style={{ alignItems: 'center', width: 60 }}><Avatar uri={u.avatar} name={u.displayName} id={u.id} size={44} /><T size={11} numberOfLines={1}>{u.displayName}</T></View>)}
          </ScrollView>
        )}
        <T size={12} w={600} dim style={{ paddingHorizontal: 6, marginTop: 4 }}>{channel ? 'ПОДПИСЧИКИ (НЕОБЯЗАТЕЛЬНО)' : 'УЧАСТНИКИ'}</T>
        <UserPicker single={false} selected={sel} onPick={(u) => setSel((l) => (l.some((x) => x.id === u.id) ? l.filter((x) => x.id !== u.id) : [...l, u]))} />
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: 30 }}><Btn height={50} disabled={busy || !title.trim()} title="Создать" onPress={create} /></View>
    </KeyboardAvoidingView>
  );
}
const st = StyleSheet.create({ input: { height: 48, borderRadius: 14, paddingHorizontal: 14, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text } });
