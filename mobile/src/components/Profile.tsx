import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import { api } from '../lib/api';
import { cache } from '../lib/db';
import { mediaUrl } from '../lib/config';
import { useStore } from '../lib/store';
import { usePerf } from '../lib/perf';
import { Avatar, Glass, GlassButton, Press, T } from './ui';
import { Icon } from './Icon';
import { C } from '../lib/theme';

const W = Dimensions.get('window').width;
const STAGE_H = 240;

/** One pinned gift: flies out of the avatar, then floats gently (UI-thread animation, no JS per frame). */
function FloatingGift({ g, x, y, size, i, low, onPress }: any) {
  const t = useSharedValue(0);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(150 + i * 60, withSpring(1, { damping: 14, stiffness: 120 }));
    if (!low) t.value = withRepeat(withSequence(withTiming(1, { duration: 2600 + (i % 3) * 500, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2600 + (i % 3) * 500, easing: Easing.inOut(Easing.sin) })), -1);
  }, [low]);
  const st = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateX: (1 - enter.value) * (W / 2 - x) },
      { translateY: (1 - enter.value) * (STAGE_H / 2 - y) + t.value * -5 },
      { scale: 0.3 + enter.value * 0.7 },
    ],
  }));
  const color = g.collectible?.backdrop?.center || '#ffffff';
  const img = g.collectible?.model?.image || g.gift?.image;
  return (
    <Animated.View style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, st]}>
      <Press onPress={onPress} scale={0.85}>
        {!low && <View style={{ position: 'absolute', left: -size * 0.45, top: -size * 0.45, width: size * 1.9, height: size * 1.9, borderRadius: size, backgroundColor: color, opacity: 0.22 }} />}
        <Image source={{ uri: mediaUrl(img) }} style={{ width: size, height: size }} contentFit="contain" cachePolicy="memory-disk" />
      </Press>
    </Animated.View>
  );
}

function layout(n: number) {
  const cx = W / 2; const cy = STAGE_H / 2; const R = 74; const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const size = i < 6 ? 46 : 36; const side = i % 2 ? 1 : -1;
    let best: any = null;
    for (let k = 0; k < 50; k++) {
      const x = cx + side * (R + size / 2 + Math.random() * (cx - R - size));
      const y = size / 2 + 6 + Math.random() * (STAGE_H - size - 12);
      if (Math.hypot(x - cx, y - cy) < R + size / 2) continue;
      if (!out.some((o) => Math.hypot(o.x - x, o.y - y) < (o.size + size) / 2 + 6)) { best = { x, y, size }; break; }
      best = best || { x, y, size };
    }
    out.push(best);
  }
  return out;
}

export function ProfileView({ userId, own }: { userId: number; own?: boolean }) {
  const insets = useSafeAreaInsets();
  const low = usePerf((s) => s.low);
  const meId = useStore((s) => s.me?.id);
  const [u, setU] = useState<any>(() => cache.get(`user:${userId}`));
  const [gifts, setGifts] = useState<any[]>(() => cache.get(`gifts:${userId}`) || []);
  useEffect(() => {
    api(`/users/${userId}`).then((r) => { setU(r.user); cache.set(`user:${userId}`, r.user); }).catch(() => {});
    api(`/users/${userId}/gifts`).then((r) => { setGifts(r.gifts); cache.set(`gifts:${userId}`, r.gifts); }).catch(() => {});
  }, [userId]);
  const pinned = useMemo(() => gifts.filter((g) => g.pinned).slice(0, 10), [gifts]);
  const spots = useMemo(() => layout(pinned.length), [pinned.length]);

  // scroll-driven header, continuous (no clamps on the pull side, so it follows the finger and the iOS bounce
  // springs it back): pull down → avatar follows at half speed and grows; scroll up → it lags, shrinks and fades.
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  const avatarSt = useAnimatedStyle(() => {
    const v = y.value;
    return {
      transform: [
        { translateY: v < 0 ? v * 0.5 : v * 0.3 },
        { scale: v < 0 ? 1 + Math.min(-v, 320) / 520 : interpolate(v, [0, 180], [1, 0.4], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(v, [40, 170], [1, 0], Extrapolation.CLAMP),
    };
  });
  const stageSt = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [20, 130], [1, 0], Extrapolation.CLAMP) }));
  const miniSt = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [150, 200], [0, 1], Extrapolation.CLAMP), transform: [{ translateY: interpolate(y.value, [150, 200], [-10, 0], Extrapolation.CLAMP) }] }));
  const bgSt = useAnimatedStyle(() => ({ transform: [{ scale: interpolate(y.value, [-200, 0], [1.4, 1], Extrapolation.CLAMP) }] }));

  if (!u) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const isMe = own || u.id === meId;
  const follow = async () => { const r = await api(`/users/${u.id}/follow`, { body: {} }); setU({ ...u, isFollowing: r.following, followers: r.followers }); };
  const write = async () => { const r = await api('/chats/private', { body: { userId: u.id } }); useStore.getState().refreshChats().catch(() => {}); router.push(`/chat/${r.chat.id}`); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* blurred avatar background */}
      <Animated.View style={[StyleSheet.absoluteFill, { height: 520 }, bgSt]} pointerEvents="none">
        {u.avatar && <Image source={{ uri: mediaUrl(u.avatar) }} style={StyleSheet.absoluteFill} blurRadius={low ? 20 : 60} contentFit="cover" />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)' }]} />
      </Animated.View>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <Animated.View style={[{ height: STAGE_H, alignItems: 'center', justifyContent: 'center' }, stageSt]}>
          {spots.map((p, i) => <FloatingGift key={pinned[i].id} g={pinned[i]} {...p} i={i} low={low} onPress={() => {}} />)}
          <Animated.View style={avatarSt}>
            <View style={{ padding: 3, borderRadius: 70, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' }}>
              <Avatar uri={u.avatar} name={u.displayName} id={u.id} size={120} />
            </View>
          </Animated.View>
        </Animated.View>
        <Animated.View entering={FadeIn.duration(220)} style={{ alignItems: 'center', gap: 6, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T bold size={26} style={u.nameStyle?.color ? { color: u.nameStyle.color } : undefined}>{u.displayName}</T>
            {u.verified && <Icon name="verified" size={22} color="#fff" fill={C.accent} />}
            {u.premium && <Icon name="spark" size={20} color={C.accent} fill={C.accent} />}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Glass radius={14} style={s.pill}><T size={13} bold style={{ color: u.online ? C.green : C.text2 }}>{u.online ? 'в сети' : 'был(а) недавно'}</T></Glass>
            {isMe && <Glass radius={14} style={s.pill}><T size={13} bold>✦ {useStore.getState().me?.balance ?? 0}</T></Glass>}
          </View>
          <View style={{ flexDirection: 'row', gap: 26, marginTop: 8 }}>
            {[[u.followers, 'подписчиков'], [u.following, 'подписок'], [u.postsCount, 'посты']].map(([n, l]) => (
              <View key={String(l)} style={{ alignItems: 'center' }}><T bold size={18}>{n ?? 0}</T><T dim size={12}>{l}</T></View>
            ))}
          </View>
        </Animated.View>
        {!isMe && (
          <View style={{ flexDirection: 'row', gap: 8, padding: 16 }}>
            <GlassButton title="Написать" accent onPress={write} style={{ flex: 1 }} />
            <GlassButton title={u.isFollowing ? 'Вы подписаны' : 'Подписаться'} onPress={follow} style={{ flex: 1 }} />
          </View>
        )}
        <Glass radius={22} style={{ margin: 16, padding: 16, gap: 12 }}>
          {u.anonNumber && <View><T bold style={{ color: C.accent }}>{u.anonNumber}</T><T dim size={13}>Анонимный номер</T></View>}
          {u.username && <View><T bold style={{ color: C.accent }}>@{u.username}</T><T dim size={13}>Имя пользователя</T></View>}
          {!!u.bio && <View><T>{u.bio}</T><T dim size={13}>Описание</T></View>}
          <T dim size={13}>ID: {u.code}</T>
        </Glass>
        <T bold size={18} style={{ paddingHorizontal: 16, marginBottom: 8 }}>Подарки · {gifts.length}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 }}>
          {gifts.map((g, i) => (
            <Animated.View key={g.id} entering={low ? undefined : FadeIn.delay(Math.min(i, 9) * 30).duration(220)} style={[s.gift, { backgroundColor: g.collectible?.backdrop?.edge || C.bg3 }]}>
              <Image source={{ uri: mediaUrl(g.collectible?.model?.image || g.gift.image) }} style={{ width: '78%', height: '78%' }} contentFit="contain" cachePolicy="memory-disk" />
              {g.collectible && <T size={10} bold style={s.num}>#{g.collectible.number}</T>}
            </Animated.View>
          ))}
        </View>
      </Animated.ScrollView>
      <Animated.View style={[s.mini, { top: insets.top + 6 }, miniSt]} pointerEvents="none">
        <Glass radius={20} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 14, height: 40 }}>
          <Avatar uri={u.avatar} name={u.displayName} id={u.id} size={32} />
          <T bold size={15}>{u.displayName}</T>
        </Glass>
      </Animated.View>
      {!own && (
        <Press onPress={() => router.back()} style={{ position: 'absolute', top: insets.top + 6, left: 12 }}>
          <Glass radius={22} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={26} stroke={2.4} /></Glass>
        </Press>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pill: { paddingHorizontal: 12, paddingVertical: 5 },
  gift: { width: (W - 24 - 16) / 3, aspectRatio: 1, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  num: { position: 'absolute', top: 6, right: 8, color: 'rgba(255,255,255,0.85)' },
  mini: { position: 'absolute', alignSelf: 'center' },
});
