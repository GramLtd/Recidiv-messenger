import React, { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { api } from '../../lib/api';
import { cache } from '../../lib/db';
import { mediaUrl } from '../../lib/config';
import { useStore } from '../../lib/store';
import { Avatar, Press, T } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { C } from '../../lib/theme';
import { chatTime } from './chats';

const Post = React.memo(function Post({ p, onChange, onRemove }: any) {
  const meId = useStore((s) => s.me?.id);
  const [heart, setHeart] = useState(false);
  if (p.kind === 'channel') {
    return (
      <Press scale={0.99} onPress={() => { useStore.getState().refreshChats().catch(() => {}); router.push(`/chat/${p.chat.id}`); }} style={s.post}>
        <View style={s.head}><Avatar uri={p.chat.avatar} name={p.chat.title} id={p.chat.id} size={40} /><View style={{ flex: 1 }}><T bold>{p.chat.title} <T size={12} style={{ color: C.accent }}>канал</T></T><T dim size={13}>{chatTime(p.createdAt)}</T></View></View>
        {!!p.text && <T style={{ marginTop: 8 }}>{p.text}</T>}
      </Press>
    );
  }
  const like = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!p.liked) { setHeart(true); setTimeout(() => setHeart(false), 700); }
    onChange({ ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) });
    const r = await api(`/posts/${p.id}/like`, { body: {} }).catch(() => null);
    if (r) onChange(r.post);
  };
  const menu = () => {
    if (p.author.id !== meId) return;
    const opts = ['Изменить', 'Удалить', 'Отмена'];
    const handle = async (i: number) => {
      if (i === 0) router.push({ pathname: '/compose', params: { editId: String(p.id), text: p.text } });
      if (i === 1) Alert.alert('Удалить пост?', '', [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: async () => { await api.del(`/posts/${p.id}`); onRemove(p); } }]);
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: opts, destructiveButtonIndex: 1, cancelButtonIndex: 2 }, handle);
    else Alert.alert('Пост', '', [{ text: 'Изменить', onPress: () => handle(0) }, { text: 'Удалить', style: 'destructive', onPress: () => handle(1) }, { text: 'Отмена' }]);
  };
  return (
    <Press scale={1} onLongPress={menu} style={s.post}>
      <View style={s.head}>
        <Press onPress={() => router.push(`/user/${p.author.id}`)}><Avatar uri={p.author.avatar} name={p.author.displayName} id={p.author.id} size={40} /></Press>
        <View style={{ flex: 1 }}>
          <T bold>{p.author.displayName}{p.author.premium ? ' ✦' : ''}</T>
          <T dim size={13}>{chatTime(p.createdAt)}{p.edited ? ' · изменено' : ''}</T>
        </View>
        {p.author.id === meId && <Press onPress={menu}><Icon name="more" size={22} color={C.text2} /></Press>}
      </View>
      {!!p.text && <T style={{ marginTop: 8, lineHeight: 22 }}>{p.text}</T>}
      {p.media?.[0] && (
        <Press scale={1} onLongPress={menu} onPress={() => {}} style={{ marginTop: 10 }}>
          <Image source={{ uri: mediaUrl(p.media[0].url) }} style={{ width: '100%', aspectRatio: 1, borderRadius: 18 }} contentFit="cover" cachePolicy="memory-disk" />
          {heart && <Animated.View entering={ZoomIn.springify()} style={s.bigHeart}><T size={90}>❤️</T></Animated.View>}
        </Press>
      )}
      <View style={s.actions}>
        <Press onPress={like} haptic scale={0.8} style={s.act}><Icon name="heart" size={21} color={p.liked ? '#ff3b5c' : C.text2} fill={p.liked ? '#ff3b5c' : 'none'} /><T size={14} style={{ color: p.liked ? '#ff3b5c' : C.text2 }}>{p.likes || ''}</T></Press>
        <View style={s.act}><Icon name="comment" size={20} color={C.text2} /><T dim size={14}>{p.comments || ''}</T></View>
        <View style={s.act}><Icon name="repost" size={20} color={C.text2} /><T dim size={14}>{p.reposts || ''}</T></View>
        <View style={{ flex: 1 }} />
        <View style={s.act}><Icon name="eye" size={16} color={C.text2} /><T dim size={13}>{p.views}</T></View>
      </View>
    </Press>
  );
});

export default function Feed() {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<any[]>(() => cache.get('feed') || []);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => { const r = await api('/feed'); setPosts(r.posts); cache.set('feed', r.posts); }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);
  const change = (np: any) => setPosts((l) => l.map((x) => (x.id === np.id ? np : x)));
  const remove = (op: any) => setPosts((l) => l.filter((x) => x.id !== op.id));
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={posts}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item, index }) => <Animated.View entering={index < 8 ? FadeInDown.delay(index * 40).springify().damping(18) : undefined}><Post p={item} onChange={change} onRemove={remove} /></Animated.View>}
        ListHeaderComponent={<T bold size={32} style={{ paddingHorizontal: 16, paddingBottom: 6 }}>Лента</T>}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 130 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} tintColor={C.text2} />}
        removeClippedSubviews
        windowSize={7}
      />
    </View>
  );
}

const s = StyleSheet.create({
  post: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 10 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bigHeart: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
});
