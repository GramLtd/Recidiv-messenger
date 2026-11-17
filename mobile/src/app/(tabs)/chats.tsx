import React, { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../../lib/store';
import { Avatar, Glass, Press, T } from '../../components/ui';
import { C } from '../../lib/theme';

export const chatTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const ChatRow = React.memo(function ChatRow({ c }: { c: any }) {
  const lm = c.lastMessage;
  return (
    <Press scale={0.98} onPress={() => router.push(`/chat/${c.id}`)} style={s.row}>
      <Avatar uri={c.avatar} name={c.title} id={c.peer?.id || c.id} size={56} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T bold numberOfLines={1} style={{ flex: 1 }}>{c.title}{c.peer?.premium ? ' ✦' : ''}{c.muted ? ' 🔕' : ''}</T>
          <T dim size={13}>{chatTime(lm?.createdAt)}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <T dim numberOfLines={1} size={15} style={{ flex: 1 }}>{lm?.text || (c.type === 'saved' ? 'Ваше облако' : 'Нет сообщений')}</T>
          {c.unread > 0 && <View style={s.badge}><T size={12} bold style={{ color: '#fff' }}>{c.unread}</T></View>}
        </View>
      </View>
    </Press>
  );
});

export default function Chats() {
  const insets = useSafeAreaInsets();
  const chats = useStore((st) => st.chats);
  const refresh = useStore((st) => st.refreshChats);
  const [q, setQ] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refresh().catch(() => {}); setRefreshing(false); }, [refresh]);
  const list = q ? chats.filter((c) => c.title?.toLowerCase().includes(q.toLowerCase())) : chats;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={list}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => <ChatRow c={item} />}
        contentContainerStyle={{ paddingTop: insets.top + 110, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text2} progressViewOffset={insets.top + 100} />}
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
      />
      <View style={[s.head, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <T bold size={32}>Чаты</T>
        <Glass radius={14} style={{ marginTop: 10 }}>
          <TextInput placeholder="Поиск" placeholderTextColor={C.text2} value={q} onChangeText={setQ} style={s.search} />
        </Glass>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  head: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.82)' },
  search: { height: 40, paddingHorizontal: 14, color: C.text, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
