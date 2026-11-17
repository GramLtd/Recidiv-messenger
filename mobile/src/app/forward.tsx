import React from 'react';
import { FlatList, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import { Avatar, Press, T } from '../components/ui';

export default function Forward() {
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const chats = useStore((s) => s.chats).filter((c) => c.type !== 'channel' || c.role !== 'member');
  const go = async (c: any) => { await api(`/messages/${messageId}/forward`, { body: { chatId: c.id } }).catch((e) => alert(e.message)); router.back(); };
  return (
    <View style={{ flex: 1, paddingTop: 18 }}>
      <T bold size={20} style={{ paddingHorizontal: 18, marginBottom: 8 }}>Переслать в…</T>
      <FlatList data={chats} keyExtractor={(c) => String(c.id)} renderItem={({ item }) => (
        <Press onPress={() => go(item)} scale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 8 }}>
          <Avatar uri={item.avatar} name={item.title} id={item.peer?.id || item.id} size={44} />
          <T bold numberOfLines={1} style={{ flex: 1 }}>{item.title}</T>
        </Press>
      )} />
    </View>
  );
}
