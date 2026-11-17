import React, { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Bookmark, Check, CheckCheck, Megaphone, Pin, Plus, Search, SquarePen, Users, VolumeX, X } from 'lucide-react-native';
import { useStore } from '../../lib/store';
import { api } from '../../lib/api';
import { useFont, fontStyle } from '../../lib/fonts';
import { chatTime } from '../../lib/util';
import { C } from '../../lib/theme';
import { Avatar, Glass, PremiumStar, Press, Rise, T, Verified, WornGift } from '../../components/ui';
import { StyledName } from '../../components/Profile';

export { chatTime };

/** Story ring (web .story-ring: conic accent→orange, grey when seen). */
function Ring({ seen, children, size }: { seen?: boolean; children: React.ReactNode; size: number }) {
  return seen
    ? <View style={{ padding: 2.5, borderRadius: size, backgroundColor: C.text3 }}><View style={{ borderRadius: size, borderWidth: 2.5, borderColor: C.bg }}>{children}</View></View>
    : <LinearGradient colors={[C.accent, '#ff9a3d', C.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 2.5, borderRadius: size }}><View style={{ borderRadius: size, borderWidth: 2.5, borderColor: C.bg }}>{children}</View></LinearGradient>;
}

function StoriesBar() {
  const me = useStore((s) => s.me);
  const [feed, setFeed] = useState<any[]>([]);
  useEffect(() => { api('/stories').then((r) => setFeed(r.feed || [])).catch(() => {}); }, []);
  const mine = feed.find((f) => f.isMe);
  const others = feed.filter((f) => !f.isMe);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.stories}>
      <Press scale={0.92} onPress={() => (mine ? router.push(`/story/${me.id}`) : Alert.alert('Истории', 'Публикация историй скоро появится в приложении.'))} style={st.chip}>
        <View>
          {mine ? <Ring seen={mine.allViewed} size={70}><Avatar uri={me.avatar} name={me.displayName} id={me.id} size={58} /></Ring> : <Avatar uri={me.avatar} name={me.displayName} id={me.id} size={58} />}
          <View style={st.storyAdd}><Plus size={12} color="#fff" strokeWidth={3} /></View>
        </View>
        <T size={11.3} dim numberOfLines={1}>Моя</T>
      </Press>
      {others.map((f) => (
        <Press key={f.user.id} scale={0.92} onPress={() => router.push(`/story/${f.user.id}`)} style={st.chip}>
          <Ring seen={f.allViewed} size={70}><Avatar uri={f.user.avatar} name={f.user.displayName} id={f.user.id} size={58} /></Ring>
          <T size={11.3} dim numberOfLines={1}>{f.user.displayName.split(' ')[0]}</T>
        </Press>
      ))}
    </ScrollView>
  );
}

const ChatRow = React.memo(function ChatRow({ c, index, meId, editing, onAction }: { c: any; index: number; meId: number; editing: boolean; onAction: (c: any, k: string) => void }) {
  const lm = c.lastMessage;
  const own = lm && lm.senderId === meId;
  const read = own && c.peerReadId >= lm.id;
  const typing = useStore((s) => (s.typing[c.id] || 0) > Date.now());
  const menu = () => {
    const opts: [string, string][] = [['pin', c.pinned ? 'Открепить' : 'Закрепить'], ['mute', c.muted ? 'Включить звук' : 'Без звука'], ['leave', c.type === 'private' ? 'Удалить чат' : c.type === 'channel' ? 'Покинуть канал' : 'Покинуть группу']];
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...opts.map((o) => o[1]), 'Отмена'], cancelButtonIndex: 3, destructiveButtonIndex: 2 }, (i) => opts[i] && onAction(c, opts[i][0]));
    else Alert.alert(c.title, '', [...opts.map(([k, l]) => ({ text: l, onPress: () => onAction(c, k) })), { text: 'Отмена', style: 'cancel' as const }]);
  };
  return (
    <Rise delay={Math.min(index, 14) * 28} duration={300} dy={8}>
      <Press scale={0.97} onPress={() => (editing ? menu() : router.push(`/chat/${c.id}`))} onLongPress={menu} style={st.row}>
        {c.type === 'saved' ? <Avatar name="" id={c.id} size={54} emoji="🔖" /> : <Avatar uri={c.avatar} name={c.title} id={c.peer?.id || c.id} size={54} online={c.peer?.online} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={st.top}>
            <View style={st.name}>
              {c.type === 'group' && <Users size={15} color={C.text2} />}
              {c.type === 'channel' && <Megaphone size={15} color={C.text2} />}
              {c.peer ? <StyledName user={{ ...c.peer, displayName: c.title }} w={600} /> : <T w={600} numberOfLines={1} style={{ flexShrink: 1 }}>{c.title}</T>}
              {c.peer?.verified && <Verified size={15} />}
              {c.peer?.premium && <PremiumStar size={14} />}
              {c.peer?.wornGift && <WornGift gift={c.peer.wornGift} size={18} />}
              {c.muted && <VolumeX size={14} color={C.text2} />}
            </View>
            <View style={st.time}>
              {own && c.type !== 'saved' && c.type !== 'channel' && (read ? <CheckCheck size={16} color={C.accent} /> : <Check size={16} color={C.accent} />)}
              <T size={11.7} dim>{lm ? chatTime(lm.createdAt) : ''}</T>
            </View>
          </View>
          <View style={st.bottom}>
            <T size={14} dim numberOfLines={1} style={{ flex: 1 }}>
              {typing ? <T size={14} color={C.accent}>печатает…</T> : lm ? (
                <>{c.type === 'group' && lm.senderName && lm.type !== 'system' ? <T size={14}>{own ? 'Вы' : lm.senderName.split(' ')[0]}: </T> : null}{lm.type === 'secret' ? '🔒 Зашифрованное сообщение' : lm.text || (lm.type === 'image' ? 'Фото' : lm.type === 'voice' ? 'Голосовое сообщение' : lm.type === 'sticker' ? 'Стикер' : lm.type === 'gif' ? 'GIF' : lm.type === 'gift' ? 'Подарок' : 'Медиа')}</>
              ) : c.type === 'saved' ? 'Сохраняйте сюда сообщения' : 'Нет сообщений'}
            </T>
            {c.pinned && !c.unread && <Pin size={14} color={C.text3} />}
            {c.unread > 0 && <View style={[st.badge, c.muted && { backgroundColor: C.text3 }]}><T w={600} size={11.7} color="#fff">{c.unread > 999 ? '999+' : c.unread}</T></View>}
          </View>
        </View>
      </Press>
    </Rise>
  );
});

export default function Chats() {
  const insets = useSafeAreaInsets();
  const font = useFont((s) => s.id);
  const me = useStore((st) => st.me);
  const chats = useStore((st) => st.chats);
  const refresh = useStore((st) => st.refreshChats);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => { setRefreshing(true); await refresh().catch(() => {}); setRefreshing(false); }, [refresh]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return undefined; }
    const t = setTimeout(() => api(`/users/search?q=${encodeURIComponent(q.trim())}`).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const action = async (c: any, kind: string) => {
    try {
      if (kind === 'leave') { await api(`/chats/${c.id}/leave`, { body: {} }); useStore.setState({ chats: useStore.getState().chats.filter((x) => x.id !== c.id) }); return; }
      const r = await api(`/chats/${c.id}/settings`, { body: kind === 'pin' ? { pinned: !c.pinned } : { muted: !c.muted } });
      useStore.getState().upsertChat(r.chat);
      refresh().catch(() => {});
    } catch (e: any) { Alert.alert(e.message); }
  };
  const openUser = async (u: any) => { const r = await api('/chats/private', { body: { userId: u.id } }); useStore.getState().upsertChat(r.chat); setQ(''); setSearching(false); router.push(`/chat/${r.chat.id}`); };
  const local = q ? chats.filter((c) => c.title?.toLowerCase().includes(q.toLowerCase())) : chats;
  if (!me) return null;
  const header = (
    <View>
      <View style={st.head}>
        <Press scale={0.94} onPress={() => setEditing(!editing)}><Glass radius={20} style={st.pill}><T w={700} size={14.3} color={editing ? C.accent : C.text}>{editing ? 'Готово' : 'Изм.'}</T></Glass></Press>
        <View style={st.title}><Avatar uri={me.avatar} name={me.displayName} id={me.id} size={30} /><T w={800} size={17.3}>Чаты</T></View>
        <Press scale={0.92} onPress={() => router.push('/compose')}><Glass radius={21} style={st.round}><SquarePen size={20} color={C.text} /></Glass></Press>
        <Press scale={0.92} onPress={() => { if (searching) { setSearching(false); setQ(''); } else setSearching(true); }}><Glass radius={21} style={st.round}>{searching ? <X size={20} color={C.accent} /> : <Search size={20} color={C.text} />}</Glass></Press>
      </View>
      {searching && (
        <Rise style={{ paddingHorizontal: 12, paddingBottom: 8 }} duration={300}>
          <View style={st.search}>
            <Search size={18} color={C.text2} />
            <TextInput autoFocus placeholder="Поиск" placeholderTextColor={C.text2} value={q} onChangeText={setQ} style={[st.searchInput, fontStyle(font, 400, 15)]} />
          </View>
        </Rise>
      )}
      {!q && <StoriesBar />}
      {q && local.length > 0 && <T w={600} size={12.8} dim style={st.section}>Чаты</T>}
    </View>
  );
  const footer = q && results ? (
    <View>
      {results.users?.length > 0 && <T w={600} size={12.8} dim style={st.section}>Глобальный поиск</T>}
      {results.users?.map((u: any) => (
        <Press key={`u${u.id}`} scale={0.97} onPress={() => openUser(u)} style={st.row}>
          <Avatar uri={u.avatar} name={u.displayName} id={u.id} size={48} online={u.online} />
          <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><StyledName user={u} w={600} />{u.verified && <Verified size={15} />}{u.premium && <PremiumStar size={14} />}</View><T size={13} dim>{u.username ? `@${u.username}` : ''}</T></View>
        </Press>
      ))}
      {results.chats?.map((c: any) => (
        <Press key={`c${c.id}`} scale={0.97} onPress={() => { useStore.getState().upsertChat(c); router.push(`/chat/${c.id}`); }} style={st.row}>
          <Avatar uri={c.avatar} name={c.title} id={c.id} size={48} />
          <View style={{ flex: 1 }}><T w={700} numberOfLines={1}>{c.title}</T><T size={13} dim>@{c.username} · {c.memberCount} {c.type === 'channel' ? 'подписчиков' : 'участников'}</T></View>
        </Press>
      ))}
      {!results.users?.length && !results.chats?.length && !local.length && <T dim center style={{ padding: 30 }}>Ничего не найдено</T>}
    </View>
  ) : undefined;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={local}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item, index }) => <ChatRow c={item} index={index} meId={me.id} editing={editing} onAction={action} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingBottom: 120, paddingHorizontal: 6 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.text2} />}
        initialNumToRender={14}
        windowSize={9}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 6, minHeight: 58 },
  pill: { height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  round: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, backgroundColor: C.bg3, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: C.text, height: 42 },
  stories: { gap: 14, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 10 },
  chip: { width: 70, alignItems: 'center', gap: 4 },
  storyAdd: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  saved: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#3a8bff', alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  time: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 7, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
});
