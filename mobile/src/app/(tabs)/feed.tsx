import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Eye, Hash } from 'lucide-react-native';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import { C } from '../../lib/theme';
import { Avatar, Glass, Press, Rise, T } from '../../components/ui';
import { PostCard, RichText, ago } from '../../components/Post';

const W = Dimensions.get('window').width;
const TABS: [string, string][] = [['all', 'Лента'], ['top', 'Тренды'], ['following', 'Подписки'], ['tags', 'Теги']];

/** Web `.seg`: glass segmented control with a sliding glossy indicator. */
function Seg({ tab, onChange }: { tab: string; onChange: (t: string) => void }) {
  const idx = TABS.findIndex((t) => t[0] === tab);
  const x = useSharedValue(idx);
  useEffect(() => { x.value = withTiming(idx, { duration: 450, easing: Easing.bezier(0.32, 0.72, 0, 1) }); }, [idx]);
  const w = (W - 28 - 8) / TABS.length;
  const ind = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * w }] }));
  return (
    <Glass radius={999} style={st.seg} shadow={false}>
      <Animated.View style={[st.segInd, { width: w }, ind]} />
      {TABS.map(([k, l]) => (
        <Press key={k} scale={0.95} onPress={() => onChange(k)} style={st.segBtn}><T w={700} size={13.5} numberOfLines={1} color={tab === k ? C.text : C.text2}>{l}</T></Press>
      ))}
    </Glass>
  );
}

function Composer() {
  const me = useStore((s) => s.me);
  return (
    <Press scale={0.98} onPress={() => router.push('/compose')}>
      <Glass radius={22} shadow={false} style={st.composer}>
        <Avatar uri={me?.avatar} name={me?.displayName} id={me?.id} size={40} />
        <T dim style={{ flex: 1, paddingVertical: 9 }}>Что нового?</T>
      </Glass>
    </Press>
  );
}

function ChannelItem({ p, index }: { p: any; index: number }) {
  const c = p.chat;
  const open = () => { useStore.getState().upsertChat(c); router.push(`/chat/${c.id}`); };
  return (
    <View style={{ paddingHorizontal: 12 }}>
      <Rise delay={Math.min(index, 10) * 40} style={st.post}>
        <Press scale={0.99} onPress={open}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar uri={c.avatar} name={c.title} id={c.id} size={42} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><T w={700} numberOfLines={1} style={{ flexShrink: 1 }}>{c.title}</T><View style={st.chanTag}><T w={700} size={10.5} color={C.accent}>канал</T></View></View>
              <T size={13} dim numberOfLines={1}>{c.username ? `@${c.username} · ` : ''}{ago(p.createdAt)}</T>
            </View>
          </View>
          {!!p.text && <View style={{ marginTop: 8, marginLeft: 52 }}><RichText text={p.text} /></View>}
        </Press>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 44 }}>
          <Press scale={0.9} onPress={open} style={st.pa}><T w={600} size={13.5} color={C.accent}>Открыть канал</T></Press>
          <View style={{ flex: 1 }} />
          <View style={st.pa}><Eye size={18} color={C.text3} /><T w={600} size={13.5} muted>{p.views || 0}</T></View>
        </View>
      </Rise>
    </View>
  );
}

export default function Feed() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('all');
  const [tag, setTag] = useState<string | null>(null);
  const [tags, setTags] = useState<any[] | null>(null);
  const [posts, setPosts] = useState<any[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const source = tab === 'following' ? '/feed?tab=following' : tab === 'top' ? '/feed?tab=top' : tag ? `/feed?tab=tag&tag=${encodeURIComponent(tag)}` : '/feed';
  const load = useCallback(async () => {
    const r = await api(source);
    setPosts(r.posts);
  }, [source]);
  useEffect(() => { if (tab !== 'tags' || tag) { setPosts(null); load().catch(() => setPosts([])); } }, [source, tab]);
  useEffect(() => { if (tab === 'tags' && !tags) api('/tags/trending').then((r) => setTags(r.tags)).catch(() => setTags([])); }, [tab]);
  const change = (np: any) => setPosts((l) => (l || []).map((x) => (x.id === np.id ? np : x)));
  const remove = (op: any) => setPosts((l) => (l || []).filter((x) => x.id !== op.id));
  const header = (
    <View>
      <View style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 8 }}><Seg tab={tab} onChange={(t) => { setTab(t); if (t !== 'tags') setTag(null); }} /></View>
      {tab === 'all' && <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}><Composer /></View>}
      {tag && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Hash size={20} color={C.accent} /><T w={700} style={{ flex: 1 }}>{tag}</T>
          <Press onPress={() => setTag(null)}><Glass radius={16} style={st.chip}><T w={700} size={13}>Все теги</T></Glass></Press>
        </View>
      )}
      {tab === 'tags' && !tag && (
        <View style={{ paddingHorizontal: 14 }}>
          <T size={12} w={600} dim style={{ marginVertical: 8 }}>ПОПУЛЯРНЫЕ ТЕГИ</T>
          {tags && !tags.length && <T dim center size={13} style={{ padding: 30 }}>Тегов пока нет — добавьте #тег в пост</T>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(tags || []).map((x, i) => (
              <Rise key={x.tag} delay={i * 30}>
                <Press onPress={() => setTag(x.tag)} scale={0.92}><Glass radius={16} style={st.chip}><Hash size={14} color={C.text} /><T w={700} size={13}>{x.tag}</T><T size={11} dim>{x.count}</T></Glass></Press>
              </Rise>
            ))}
          </View>
        </View>
      )}
    </View>
  );
  const data = tab === 'tags' && !tag ? [] : posts || [];
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList contentInsetAdjustmentBehavior="never"
        data={data}
        keyExtractor={(p) => `${p.kind || 'post'}${p.id}`}
        renderItem={({ item, index }) => (item.kind === 'channel'
          ? <ChannelItem p={item} index={index} />
          : <View style={{ paddingHorizontal: 12 }}><PostCard p={item} index={index} onChange={change} onRemove={remove} /></View>)}
        ListHeaderComponent={header}
        ListEmptyComponent={posts && !(tab === 'tags' && !tag) ? <T dim center size={13} style={{ padding: 30 }}>{tab === 'following' ? 'Подпишитесь на людей — их посты появятся здесь' : 'Постов пока нет'}</T> : undefined}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 130 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} tintColor={C.text2} />}
        windowSize={9}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  seg: { flexDirection: 'row', padding: 4 },
  segInd: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.13)', borderTopWidth: 0.5, borderColor: 'rgba(255,255,255,0.3)' },
  segBtn: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, marginBottom: 8, minHeight: 70 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34 },
  post: { paddingTop: 14, paddingBottom: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  chanTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: `rgba(${C.accentRgb},0.16)` },
  pa: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 10, borderRadius: 18 },
});
