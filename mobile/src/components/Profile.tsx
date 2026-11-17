import React, { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Dimensions, Linking, Platform, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing, Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSequence, withSpring, withTiming, SharedValue,
} from 'react-native-reanimated';
import {
  CalendarDays, ChevronLeft, ChevronRight, Eye, Filter, Gift, Hash, Link2, MapPin, Megaphone, MessageCircle, Music2, Pause, Pencil, Phone,
  Pin, Play, Shield, UserCheck, UserPlus, Ellipsis,
} from 'lucide-react-native';
import { api } from '../lib/api';
import { cache } from '../lib/db';
import { mediaUrl } from '../lib/config';
import { useStore } from '../lib/store';
import { usePerf } from '../lib/perf';
import { usePlayer, fmtTime } from '../lib/player';
import { fmtNum, lastSeen, plural } from '../lib/util';
import { C, webSpring } from '../lib/theme';
import { Avatar, Btn, Glass, GlassIcon, MaskedView, Pill, PremiumStar, Press, Radial, Rise, Spark, T, Verified, WornGift } from './ui';
import { CollectibleArt, GiftArt, GiftModel } from './GiftArt';
import { PostCard } from './Post';
import { ProfilePopup, Pop } from './ProfilePopup';

const W = Dimensions.get('window').width;
/** #rrggbb + alpha → rgba() */
function hexA(hex: string, a: number) {
  const n = parseInt((hex || '#ffffff').replace('#', '').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
/** color-mix(in srgb, c k, #fff) */
function mixWhite(hex: string, k: number) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const f = (v: number) => Math.round(v * k + 255 * (1 - k));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
const H = Dimensions.get('window').height;
const STAGE_W = Math.min(340, W);
const STAGE_H = 236;
const AVATAR_R = 70;

/* ---------------------------------------------------------------- blurred page background (web .pv-blurbg) */
function BlurBg({ uri, color }: { uri?: string | null; color: string }) {
  const low = usePerf((s) => s.low);
  const k = useSharedValue(0);
  const drift = useSharedValue(0);
  useEffect(() => {
    k.value = withTiming(1, { duration: 1100, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
    if (!low) drift.value = withDelay(1100, withRepeat(withTiming(1, { duration: 22000, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [uri, low]);
  const a = useAnimatedStyle(() => ({
    opacity: k.value,
    transform: [{ scale: 1.6 - 0.3 * k.value + 0.12 * drift.value }, { translateX: -W * 0.03 * drift.value }, { translateY: H * 0.02 * drift.value }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, a]}>
        {uri ? <Image source={{ uri: mediaUrl(uri) }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={low ? 30 : 50} />
          : <Radial inner={color} outer="#000" cy="30%" stop={0.75} style={StyleSheet.absoluteFill} />}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
      </Animated.View>
      <LinearGradient colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

/* ---------------------------------------------------------------- hero sparkles (web .pv-sparks) */
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i * 137.5 * Math.PI) / 180;
  const r = 38 + ((i * 29) % 14);
  return { x: 50 + Math.cos(a) * r, y: 48 + Math.sin(a) * r * 0.85, s: 7 + ((i * 7) % 8), d: ((i * 0.37) % 3) * 1000 };
});
function Twinkle({ x, y, s, d, color, kind = 'star' }: { x: number; y: number; s: number; d: number; color: string; kind?: 'star' | 'cross' }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(d, withRepeat(withTiming(1, { duration: kind === 'star' ? 3000 : 2800, easing: Easing.inOut(Easing.ease) }), -1, false)); }, []);
  const a = useAnimatedStyle(() => {
    const v = t.value < 0.5 ? t.value * 2 : (1 - t.value) * 2; // 0 → 1 → 0
    return kind === 'star'
      ? { opacity: v * 0.9, transform: [{ scale: 0.4 + 0.6 * v }, { rotate: `${45 * v}deg` }] }
      : { opacity: Math.min(1, v * 1.6) * 0.9 };
  });
  return (
    <Animated.View style={[{ position: 'absolute', left: `${x}%`, top: `${y}%`, width: s, height: s, marginLeft: -s / 2, marginTop: -s / 2 }, a]} pointerEvents="none">
      {kind === 'star'
        ? <Svg width={s} height={s} viewBox="0 0 10 10"><Path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill={color} /></Svg>
        : <Svg width={s} height={s} viewBox="0 0 9 9"><Path d="M4.5 0 V9 M0 4.5 H9" stroke="#fff" strokeWidth={1.5} /></Svg>}
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- pinned gifts scattered around the avatar (web .pv-scatter) */
function randomLayout(n: number) {
  const out: any[] = [];
  const cx = STAGE_W / 2; const cy = STAGE_H / 2;
  for (let i = 0; i < n; i++) {
    const size = i < 6 ? 44 + Math.round(Math.random() * 8) : 34 + Math.round(Math.random() * 6);
    const side = i % 2 === 0 ? -1 : 1;
    let best: any = null;
    for (let tries = 0; tries < 60; tries++) {
      const x = cx + side * (AVATAR_R + size / 2 + Math.random() * (cx - AVATAR_R - size / 2 - 4));
      const y = size / 2 + 4 + Math.random() * (STAGE_H - size - 8);
      if (Math.hypot(x - cx, y - cy) < AVATAR_R + size / 2) continue;
      if (!out.some((o) => Math.hypot(o.x - x, o.y - y) < (o.size + size) / 2 + 8)) { best = { x, y, size }; break; }
      if (!best) best = { x, y, size };
    }
    out.push({ ...best, rot: Math.round((Math.random() - 0.5) * 16), delay: Math.random() * 3000, dur: 4000 });
  }
  return out;
}
function ScatterGift({ ug, i, x, y, size, rot, delay, low, onPress }: any) {
  const e = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    e.value = withDelay(200 + i * 60, withSpring(1, webSpring));
    if (!low) bob.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, [low]);
  const fx = (STAGE_W / 2 - x) * 0.9; const fy = (STAGE_H / 2 - y) * 0.9;
  const a = useAnimatedStyle(() => ({
    opacity: Math.min(1, e.value * 1.5),
    transform: [{ translateX: (1 - e.value) * fx }, { translateY: (1 - e.value) * fy }, { scale: 0.1 + 0.9 * e.value }, { rotate: `${-40 * (1 - e.value)}deg` }],
  }));
  const b = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * bob.value }, { rotate: `${rot * (1 - 2 * bob.value)}deg` }] }));
  const m = ug.collectible?.model;
  const gc = ug.collectible?.backdrop?.center || '#ffffff';
  return (
    <Animated.View style={[{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size }, a]}>
      <Press onPress={onPress} scale={0.85} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {!low && <Radial inner="rgba(255,255,255,0.26)" mid={hexA(gc, 0.38)} midStop={0.38} outer={hexA(gc, 0)} stop={1} r="50%" style={{ position: 'absolute', left: (size - size * 2.1) / 2, top: (size - size * 2.1) / 2, width: size * 2.1, height: size * 2.1 }} />}
        {!low && Array.from({ length: 5 }, (_, k) => (
          <Twinkle key={k} kind="cross" x={50 + Math.cos(k * 1.3 + i) * 62} y={50 + Math.sin(k * 1.3 + i) * 62} s={9 * (0.6 + (k % 3) * 0.25)} d={((k * 0.55 + delay / 1000) % 2.8) * 1000} color="#fff" />
        ))}
        <Animated.View style={b}>
          <GiftModel gift={ug.gift} model={m} size={size} />
        </Animated.View>
      </Press>
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- avatar (web .pv-avatar + glass ring + avatarIn) */
function HeroAvatar({ u }: { u: any }) {
  const s = useSharedValue(0.5);
  const o = useSharedValue(0);
  useEffect(() => { s.value = withSpring(1, { damping: 10, stiffness: 140 }); o.value = withTiming(1, { duration: 300 }); }, []);
  const a = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={a}>
      <View style={{ padding: 3, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.35)', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } }}>
        <Avatar uri={u.avatar} name={u.displayName} id={u.id} size={118} />
      </View>
      {u.online && <View style={st.online} />}
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- styled name (colour / gradient / glow) */
export function StyledName({ user, size = 15, w = 700, numberOfLines = 1 }: { user: any; size?: number; w?: number; numberOfLines?: number }) {
  const ns = user?.nameStyle;
  const weight = ns?.bold ? 900 : w;
  const glow = ns?.glow ? { textShadowColor: ns.color || '#fff', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } } : null;
  if (ns?.color && ns?.color2) {
    const text = <T size={size} w={weight} numberOfLines={numberOfLines}>{user.displayName}</T>;
    return (
      <MaskedView maskElement={text}>
        <LinearGradient colors={[ns.color, ns.color2, ns.color]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          <View style={{ opacity: 0 }}>{text}</View>
        </LinearGradient>
      </MaskedView>
    );
  }
  return <T size={size} w={weight} numberOfLines={numberOfLines} color={ns?.color} style={glow}>{user?.displayName}</T>;
}

/* ---------------------------------------------------------------- worn gift bubble (web .pv-worn-bubble) */
function WornBubble({ worn }: { worn: any }) {
  const e = useSharedValue(0); const f = useSharedValue(0);
  useEffect(() => {
    e.value = withDelay(500, withSpring(1, webSpring));
    f.value = withDelay(1100, withRepeat(withTiming(1, { duration: 1750, easing: Easing.inOut(Easing.ease) }), -1, true));
  }, []);
  const a = useAnimatedStyle(() => ({ opacity: e.value, transform: [{ translateY: (1 - e.value) * 8 - 3 * f.value }, { scale: 0.4 + 0.6 * e.value }] }));
  return (
    <Animated.View style={[st.wornBubble, a]} pointerEvents="none">
      <Glass radius={14} fill="rgba(20,20,22,0.55)" edge="rgba(255,255,255,0.18)" hi="rgba(255,255,255,0.18)" style={{ paddingHorizontal: 11, paddingVertical: 5 }}>
        <T w={800} size={11} color="#fff" numberOfLines={1}>{worn.name} #{worn.number}</T>
      </Glass>
      <View style={st.wornTail} />
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- count-up balance */
function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const to = Number(value) || 0; const t0 = Date.now(); let raf: any;
    const step = () => { const k = Math.min(1, (Date.now() - t0) / 700); setV(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <T w={800} size={12.3}>{fmtNum(v)}</T>;
}

/* ---------------------------------------------------------------- music + channel cards */
function TrackCard({ track, onOpen }: { track: any; onOpen?: () => void }) {
  const cur = usePlayer((s) => s.current); const playing = usePlayer((s) => s.playing); const time = usePlayer((s) => s.time); const play = usePlayer((s) => s.playTrack);
  const active = cur?.url === track.url;
  return (
    <Rise delay={220}>
      <Press onPress={() => play(track)} onLongPress={onOpen} scale={0.97}>
        <Glass radius={18} fill="rgba(255,255,255,0.08)" edge={active ? `rgba(${C.accentRgb},0.45)` : 'rgba(255,255,255,0.1)'} style={st.track}>
          {track.cover ? <Image source={{ uri: mediaUrl(track.cover) }} style={{ width: 44, height: 44, borderRadius: 10 }} /> : <View style={st.cover}><Music2 size={20} color="#fff" /></View>}
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={700} numberOfLines={1}>{track.title}</T>
            <T size={12.8} dim numberOfLines={1}>{track.artist || 'Неизвестный исполнитель'}</T>
          </View>
          <T size={12.8} dim>{fmtTime(active ? time : track.duration)}</T>
          <View style={st.play}>{active && playing ? <Pause size={16} color="#000" fill="#000" /> : <Play size={16} color="#000" fill="#000" style={{ marginLeft: 2 }} />}</View>
          {active && <View style={[st.progress, { width: `${track.duration ? (time / track.duration) * 100 : 0}%` }]} />}
        </Glass>
      </Press>
    </Rise>
  );
}
function ChannelCard({ chat }: { chat: any }) {
  return (
    <Rise delay={280}>
      <Press onPress={() => { useStore.getState().upsertChat(chat); router.push(`/chat/${chat.id}`); }} scale={0.97}>
        <Glass radius={18} fill="rgba(255,255,255,0.08)" edge="rgba(255,255,255,0.08)" style={st.channel}>
          <Avatar uri={chat.avatar} name={chat.title} id={chat.id} size={46} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Megaphone size={14} color={C.text2} /><T w={700} numberOfLines={1}>{chat.title}</T></View>
            <T size={12.8} dim numberOfLines={1}>{chat.description || (chat.username ? `@${chat.username}` : 'Канал')}</T>
          </View>
          <View style={st.subPill}><T w={700} size={10.8}>{fmtNum(chat.memberCount)} {plural(chat.memberCount, ['подписчик', 'подписчика', 'подписчиков'])}</T></View>
        </Glass>
      </Press>
    </Rise>
  );
}

/* ---------------------------------------------------------------- gift tile (web .gift-card + cardIn) */
export const GiftTile = React.memo(function GiftTile({ ug, index, onPress, size }: { ug: any; index: number; onPress: (g: any) => void; size: number }) {
  const low = usePerf((s) => s.low);
  const e = useSharedValue(low ? 1 : 0);
  useEffect(() => { if (!low) e.value = withDelay(Math.min(index, 20) * 45, withSpring(1, webSpring)); }, []);
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, e.value * 1.4), transform: [{ perspective: 600 }, { translateY: (1 - e.value) * 18 }, { scale: 0.86 + 0.14 * e.value }, { rotateX: `${18 * (1 - e.value)}deg` }] }));
  const col = ug.collectible;
  return (
    <Animated.View style={[{ width: size, height: col ? size : size * 1.0 }, a]}>
      <Press onPress={() => onPress(ug)} scale={0.95} style={[st.card, !col && st.cardPlain, ug.hidden && { opacity: 0.45 }]}>
        {col ? <CollectibleArt col={col} style={StyleSheet.absoluteFill} pattern={!low} light /> : (
          <>
            <GiftArt ug={ug} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: '26%' }} />
            <T w={700} size={12.3} numberOfLines={1} style={{ position: 'absolute', bottom: 10, left: 6, right: 6, textAlign: 'center' }}>{ug.gift?.name}</T>
          </>
        )}
        {col && <View style={st.ribbon}><T w={800} size={10} color="rgba(255,255,255,0.85)" center>#{col.number}</T></View>}
        {ug.pinned && <View style={[st.pin, !col && { top: 8, bottom: undefined }]}><Pin size={13} color="#fff" /></View>}
        {col && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }]} />}
      </Press>
    </Animated.View>
  );
});

function BannerVideo({ url }: { url: string }) {
  const player = useVideoPlayer(mediaUrl(url) || null, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

/* ---------------------------------------------------------------- the profile */
const FILTERS: [string, string][] = [['all', 'Все подарки'], ['collectible', 'Коллекционные'], ['pinned', 'Закреплённые'], ['regular', 'Обычные']];

export function ProfileView({ userId, own }: { userId: number; own?: boolean }) {
  const insets = useSafeAreaInsets();
  const low = usePerf((s) => s.low);
  const me = useStore((s) => s.me);
  const [data, setData] = useState<any>(() => cache.get(`user:${userId}`));
  const [gifts, setGifts] = useState<any[] | null>(() => cache.get(`gifts:${userId}`) || null);
  const [tab, setTab] = useState<'gifts' | 'posts' | 'stories'>('gifts');
  const [filter, setFilter] = useState('all');
  const [posts, setPosts] = useState<any[] | null>(null);
  const [stories, setStories] = useState<any[] | null>(null);
  const [shown, setShown] = useState(18);
  const [pop, setPop] = useState<Pop>(null);
  useEffect(() => {
    api(`/users/${userId}`).then((r) => { setData(r.user); cache.set(`user:${userId}`, r.user); }).catch(() => {});
    api(`/users/${userId}/gifts`).then((r) => { setGifts(r.gifts); cache.set(`gifts:${userId}`, r.gifts); }).catch(() => setGifts([]));
  }, [userId]);
  useEffect(() => {
    if (tab === 'posts' && !posts) api(`/users/${userId}/posts`).then((r) => setPosts(r.posts)).catch(() => setPosts([]));
    if (tab === 'stories' && !stories) api(`/users/${userId}/stories`).then((r) => setStories(r.stories)).catch(() => setStories([]));
  }, [tab]);
  const orbit = useMemo(() => (gifts || []).filter((g) => g.pinned).slice(0, 12), [gifts]);
  const layout = useMemo(() => randomLayout(orbit.length), [orbit.map((g) => g.id).join(',')]);

  // Telegram-like collapse driven by scroll progress p = scrollY / 190 (same numbers as the web)
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { y.value = e.contentOffset.y; });
  const P = (v: number) => { 'worklet'; return Math.max(0, Math.min(1, v / 190)); };
  const stageSt = useAnimatedStyle(() => ({ transform: [{ translateY: -36 * P(y.value) }] }));
  const avaSt = useAnimatedStyle(() => { const p = P(y.value); return { opacity: Math.max(0, 1 - p * 1.15), transform: [{ translateY: -46 * p }, { scale: 1 - p * 0.72 }] }; });
  const scatSt = useAnimatedStyle(() => { const p = P(y.value); return { opacity: Math.max(0, 1 - p * 1.7), transform: [{ scale: 1 - p * 0.55 }] }; });
  const nameSt = useAnimatedStyle(() => { const p = P(y.value); return { opacity: Math.max(0, 1 - p * 1.25), transform: [{ translateY: -54 * p }, { scale: 1 - p * 0.3 }] }; });
  const fadeSt = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - P(y.value) * 1.5) }));
  const topSt = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - P(y.value) * 1.4) }));
  const miniSt = useAnimatedStyle(() => { const p = P(y.value); return { opacity: interpolate(p, [0.65, 0.98], [0, 1], Extrapolation.CLAMP), transform: [{ translateX: -0.5 }, { translateY: (1 - p) * -14 }] }; });
  const content = useSharedValue(0);
  useEffect(() => { content.value = withDelay(200, withTiming(1, { duration: 800, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })); }, []);
  const contentSt = useAnimatedStyle(() => ({ opacity: content.value, transform: [{ translateY: (1 - content.value) * 14 }, { scale: 0.98 + 0.02 * content.value }] }));

  if (!data || !me) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const isMe = data.id === me.id;
  const u = isMe ? { ...data, displayName: me.displayName, avatar: me.avatar, nameStyle: me.nameStyle, premium: me.premium, banner: me.banner, blurBg: me.blurBg, username: me.username, anonNumber: me.anonNumber, bio: me.bio, location: me.location } : data;
  const worn = u.wornGift;
  const glow = worn?.center || C.accent;
  const blur = u.blurBg || { mode: 'avatar' };
  const blurUri = blur.mode === 'custom' && blur.url ? blur.url : blur.mode === 'banner' && u.banner?.type === 'image' ? u.banner.url : blur.mode !== 'off' ? u.avatar : null;
  const patch = (p: any) => setData({ ...data, ...p });
  const follow = async () => { const r = await api(`/users/${u.id}/follow`, { body: {} }); patch({ isFollowing: r.following, followers: r.followers }); };
  const write = async () => { const r = await api('/chats/private', { body: { userId: u.id } }); useStore.getState().refreshChats().catch(() => {}); router.push(`/chat/${r.chat.id}`); };
  const target = { toUserId: String(u.id), toName: u.displayName, toAvatar: u.avatar || '' };
  const more = () => {
    const items: [string, () => void][] = [
      [u.isContact ? 'Удалить из контактов' : 'Добавить в контакты', async () => { const r = await api(`/contacts/${u.id}`, { body: {} }); patch({ isContact: r.contact }); }],
      ['Отправить искры', () => router.push({ pathname: '/transfer', params: target })],
      ['Отправить подарок', () => router.push({ pathname: '/shop', params: target })],
      ['Подарить Premium', () => router.push({ pathname: '/gift-premium', params: target })],
      ['Скопировать ссылку', () => Clipboard.setStringAsync(`https://recidivist.lol/${u.username ? `@${u.username}` : ''}`)],
      [u.isBlocked ? 'Разблокировать' : 'Заблокировать', async () => { const r = await api(`/users/${u.id}/block`, { body: {} }); patch({ isBlocked: r.blocked }); }],
    ];
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...items.map((i) => i[0]), 'Отмена'], cancelButtonIndex: items.length, destructiveButtonIndex: items.length - 1 }, (i) => items[i]?.[1]());
    else Alert.alert(u.displayName, '', [...items.map(([t, f]) => ({ text: t, onPress: f })), { text: 'Отмена', style: 'cancel' as const }]);
  };
  const list = (gifts || []).filter((g) => filter === 'all' || (filter === 'collectible' ? g.collectible : filter === 'pinned' ? g.pinned : !g.collectible));
  const tabs: [typeof tab, string][] = [['gifts', `Подарки${u.giftsCount ? ` · ${u.giftsCount}` : ''}`], ['posts', `Посты${u.postsCount ? ` · ${u.postsCount}` : ''}`], ['stories', `Истории${u.storiesCount ? ` · ${u.storiesCount}` : ''}`]];
  const tileW = Math.floor((W - 24 - 20) / 3) - 0.5;
  const openGift = (g: any) => router.push({ pathname: '/gift/[id]', params: { id: String(g.id) } });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {blur.mode !== 'off' && <BlurBg uri={blurUri} color={'#e53935'} />}
      <Animated.ScrollView contentInsetAdjustmentBehavior="never" onScroll={onScroll}
        onMomentumScrollEnd={(e: any) => { const n = e.nativeEvent; if (n.contentOffset.y + n.layoutMeasurement.height > n.contentSize.height - 600) setShown((v) => v + 18); }}
        onScrollEndDrag={(e: any) => { const n = e.nativeEvent; if (n.contentOffset.y + n.layoutMeasurement.height > n.contentSize.height - 600) setShown((v) => v + 18); }} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 170 }}>
        {/* banner */}
        {u.banner?.url && (
          <View style={[st.banner, { height: 260 + insets.top }]} pointerEvents="none">
            {Platform.OS === 'web' ? (
              <View style={[StyleSheet.absoluteFill, { maskImage: 'linear-gradient(180deg, #000 45%, transparent 100%)', WebkitMaskImage: 'linear-gradient(180deg, #000 45%, transparent 100%)' } as any]}>
                {u.banner.type === 'video' ? <BannerVideo url={u.banner.url} /> : <Image source={{ uri: mediaUrl(u.banner.url) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={200} />}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
              </View>
            ) : (
              <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient colors={['#000', '#000', 'transparent']} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />}>
                {u.banner.type === 'video' ? <BannerVideo url={u.banner.url} /> : <Image source={{ uri: mediaUrl(u.banner.url) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" priority="high" transition={200} />}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
              </MaskedView>
            )}
          </View>
        )}
        {/* hero glow */}
        <Radial inner={`${glow}40`} outer="rgba(0,0,0,0)" cy="34%" stop={0.75} style={{ position: 'absolute', top: insets.top - 40, left: 0, right: 0, height: 420, opacity: 0.6 }} />

        <Animated.View style={[st.top, { marginTop: insets.top + 10 }, topSt]}>
          {!own ? <GlassIcon size={38} onPress={() => router.back()}><ChevronLeft size={22} color={C.text} /></GlassIcon> : <View />}
          <View style={{ flex: 1 }} />
          {isMe && <GlassIcon size={38} onPress={() => router.push('/settings/privacy')}><Shield size={17} color={C.text} /></GlassIcon>}
          {isMe && <GlassIcon size={38} onPress={() => router.push('/settings/profile')}><Pencil size={17} color={C.text} /></GlassIcon>}
        </Animated.View>

        <Animated.View style={[st.stage, stageSt]}>
          {!low && SPARKS.map((p, i) => <Twinkle key={i} {...p} color={mixWhite(glow, 0.4)} />)}
          <Animated.View style={[StyleSheet.absoluteFill, scatSt]}>
            {orbit.map((g, i) => <ScatterGift key={g.id} ug={g} i={i} {...layout[i]} low={low} onPress={() => openGift(g)} />)}
          </Animated.View>
          <Animated.View style={avaSt}><HeroAvatar u={u} /></Animated.View>
        </Animated.View>

        <Animated.View style={[st.nameRow, nameSt]}>
          <StyledName user={u} size={22.5} w={900} />
          {u.verified && <Verified size={20} />}
          {u.premium && <PremiumStar size={20} />}
          {worn && (
            <Press onPress={() => router.push({ pathname: '/gift/[id]', params: { id: String(worn.id) } })} style={{ marginLeft: 2 }}>
              <WornBubble worn={worn} />
              <WornGift gift={worn} size={24} />
            </Press>
          )}
        </Animated.View>

        <Animated.View style={fadeSt}>
          <Rise delay={160} style={st.pills}>
            <Pill on={!!u.online || isMe}>{isMe ? 'в сети' : lastSeen(u)}</Pill>
            {(isMe || u.publicBalance != null) && (
              <Pill onPress={() => setPop({ type: 'wallet' })}>
                <T w={700} size={12.3}>Баланс:</T>
                <Spark size={12.3} />
                {isMe ? <CountUp value={me.balance} /> : <T w={800} size={12.3}>{fmtNum(u.publicBalance)}</T>}
                {isMe && <ChevronRight size={14} color={C.text} />}
              </Pill>
            )}
          </Rise>
          {!u.isBot && (
            <Rise delay={180} style={st.counts}>
              {[[u.followers, 'подписчиков'], [u.following, 'подписок'], [u.postsCount, 'посты']].map(([n, l], i) => (
                <Press key={String(l)} scale={0.93} onPress={() => (i === 2 ? setTab('posts') : undefined)} style={st.count}>
                  <T w={800} size={16.5}>{fmtNum(n || 0)}</T>
                  <T size={11.3} dim>{l as string}</T>
                </Press>
              ))}
            </Rise>
          )}
        </Animated.View>

        <View style={{ paddingHorizontal: 14 }}>
          {u.links?.length > 0 && (
            <View style={st.links}>
              {u.links.map((l: any, i: number) => (
                <Rise key={i} delay={i * 50}><GlassIcon size={44} onPress={() => Linking.openURL(l.url)}><Link2 size={20} color={C.text} /></GlassIcon></Rise>
              ))}
            </View>
          )}
          {u.profileTrack ? <TrackCard track={u.profileTrack} onOpen={isMe ? () => router.push('/music') : undefined} /> : isMe ? (
            <Rise delay={220}><Press scale={0.97} onPress={() => router.push('/music')}><Glass radius={18} fill="rgba(255,255,255,0.08)" edge="rgba(255,255,255,0.1)" style={[st.track, { padding: 14 }]}><Music2 size={18} color={C.text2} /><T w={600} dim style={{ flex: 1 }}>Добавить музыку в профиль</T><ChevronRight size={16} color={C.text2} /></Glass></Press></Rise>
          ) : null}
          {u.personalChannel && <ChannelCard chat={u.personalChannel} />}
        </View>

        {!isMe && !u.isBot && (
          <Rise delay={200} style={st.bar}>
            <Btn title="Написать" icon={<MessageCircle size={18} color="#fff" />} onPress={write} style={{ flex: 1.15 }} />
            <Btn secondary title={u.isFollowing ? 'Вы подписаны' : 'Подписаться'} color={u.isFollowing ? C.accent : C.text}
              onPress={follow} style={{ flex: 1 }} />
            <GlassIcon size={44} onPress={() => router.push({ pathname: '/shop', params: target })}><Gift size={19} color={C.text} /></GlassIcon>
            <GlassIcon size={44} onPress={more}><Ellipsis size={19} color={C.text} /></GlassIcon>
          </Rise>
        )}

        <Animated.View style={contentSt}>
          <Glass radius={24} fill="rgba(255,255,255,0.07)" edge="rgba(255,255,255,0.12)" hi="rgba(255,255,255,0.14)" shadow={false} style={st.info}>
            {!u.anonNumber && isMe ? (
              <InfoRow first inline>
                <Phone size={18} color={C.text2} />
                <T w={600} dim style={{ flex: 1 }} onPress={() => router.push('/u/numbers' as any)}>Получить анонимный номер +888</T>
                <ChevronRight size={16} color={C.text2} />
              </InfoRow>
            ) : null}
            {u.anonNumber ? (
              <InfoRow first>
                <T w={800} size={17.3} color={C.accent} style={{ letterSpacing: 0.3 }} onPress={() => setPop({ type: 'number' })}>{u.anonNumber}</T>
                <T size={11.7} dim>Анонимный номер</T>
              </InfoRow>
            ) : null}
            {u.username ? (
              <InfoRow first={!u.anonNumber}>
                <T w={600} size={15.3} color={C.accent} onPress={() => setPop({ type: 'username', name: u.username })}>@{u.username}</T>
                {u.otherUsernames?.length > 0 && (
                  <T size={13.2} dim>а также {u.otherUsernames.map((n: string, k: number) => (
                    <T key={n} size={13.2} w={600} color={C.accent} onPress={() => setPop({ type: 'username', name: n })}>@{n}{k < u.otherUsernames.length - 1 ? <T size={13.2} dim>, </T> : null}</T>
                  ))}</T>
                )}
                <T size={11.7} dim>Имя пользователя</T>
              </InfoRow>
            ) : null}
            {u.bio ? <InfoRow><T w={600} size={15.3}>{u.bio}</T><T size={11.7} dim>Описание</T></InfoRow> : null}
            {u.location ? <InfoRow inline><MapPin size={16} color={C.text} /><T size={13.8}>{u.location}</T></InfoRow> : null}
            {u.createdAt ? <InfoRow inline><CalendarDays size={16} color={C.text} /><T size={13.8}>На Recidivist с {new Date(u.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</T></InfoRow> : null}
            <InfoRow>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Hash size={15} color={C.text2} /><T w={600} size={15.3}>ID: {u.code}</T></View>
              <T size={11.7} dim>Идентификатор</T>
            </InfoRow>
            {u.profileViews != null && <InfoRow inline><Eye size={16} color={C.text2} /><T size={13.8} dim>{fmtNum(u.profileViews)}</T></InfoRow>}
          </Glass>

          {/* tabs */}
          <View style={st.tabs}>
            {tabs.map(([k, l]) => (
              <Press key={k} scale={0.96} onPress={() => setTab(k)} style={st.tabBtn}><T w={800} size={13.5} color={tab === k ? C.text : C.text2} numberOfLines={1} fit>{l}</T></Press>
            ))}
            <TabLine index={tabs.findIndex((t) => t[0] === tab)} width={(W - 56) / 3} />
            {tab === 'gifts' ? (
              <Press scale={0.9} style={st.filterBtn} onPress={() => {
                const opts = FILTERS.map((f) => (f[0] === filter ? `✓ ${f[1]}` : f[1]));
                if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...opts, 'Отмена'], cancelButtonIndex: opts.length }, (i) => FILTERS[i] && setFilter(FILTERS[i][0]));
                else Alert.alert('Фильтр', '', FILTERS.map(([k, l]) => ({ text: l, onPress: () => setFilter(k) })));
              }}><Filter size={18} color={filter !== 'all' ? C.accent : C.text2} /></Press>
            ) : <View style={st.filterBtn} />}
          </View>

          <View style={{ paddingHorizontal: 12 }} key={tab}>
            {tab === 'gifts' && (
              gifts === null ? null : !list.length ? <T dim center size={13} style={{ padding: 30 }}>{filter === 'all' ? 'Подарков пока нет' : 'Здесь пусто'}</T> : (
                <View style={st.grid}>{list.slice(0, shown).map((g, i) => <GiftTile key={g.id} ug={g} index={i % 18} size={tileW} onPress={openGift} />)}</View>
              )
            )}
            {tab === 'posts' && (posts === null ? null : !posts.length
              ? <T dim center size={13} style={{ padding: 30 }}>{isMe ? 'Вы ещё ничего не публиковали — откройте «Ленту»' : 'Постов пока нет'}</T>
              : posts.map((p, i) => <PostCard key={p.id} p={p} index={i} onChange={(np: any) => setPosts((l) => l!.map((x) => (x.id === np.id ? np : x)))} onRemove={(op: any) => setPosts((l) => l!.filter((x) => x.id !== op.id))} />))}
            {tab === 'stories' && (stories === null ? null : !stories.length ? <T dim center size={13} style={{ padding: 30 }}>Активных историй нет</T> : (
              <View style={st.grid}>
                {stories.map((s, i) => (
                  <Rise key={s.id} delay={i * 40} style={[st.story, { width: tileW, backgroundColor: s.mediaType === 'text' ? '#222' : '#111' }]}>
                    {s.mediaType === 'image' ? <Image source={{ uri: mediaUrl(s.media) }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <T w={800} size={12} center style={{ padding: 8 }}>{s.mediaType === 'text' ? s.media : '▶'}</T>}
                  </Rise>
                ))}
              </View>
            ))}
          </View>
        </Animated.View>
      </Animated.ScrollView>

      <ProfilePopup pop={pop} u={u} isMe={isMe} onClose={() => setPop(null)} />
      {/* mini header (appears when collapsed) */}
      <Animated.View pointerEvents="none" style={[st.mini, { top: insets.top + 6 }, miniSt]}>
        <Glass radius={22} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 5, paddingRight: 14, height: 42 }}>
          <Avatar uri={u.avatar} name={u.displayName} id={u.id} size={30} />
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><StyledName user={u} size={13.8} />{u.verified && <Verified size={13} />}</View>
            <T size={10.4} w={500} dim>{isMe ? 'в сети' : lastSeen(u)}</T>
          </View>
        </Glass>
      </Animated.View>
      {!own && (
        <Animated.View style={[{ position: 'absolute', top: insets.top + 4, left: 14 }, miniSt]}>
          <GlassIcon size={38} onPress={() => router.back()}><ChevronLeft size={22} color={C.text} /></GlassIcon>
        </Animated.View>
      )}
    </View>
  );
}

function InfoRow({ children, first, inline }: { children: React.ReactNode; first?: boolean; inline?: boolean }) {
  return <View style={[inline ? st.rowInline : { gap: 2 }, !first && st.rowSep]}>{children}</View>;
}

function TabLine({ index, width }: { index: number; width: number }) {
  const x = useSharedValue(index);
  useEffect(() => { x.value = withTiming(index, { duration: 450, easing: Easing.bezier(0.32, 0.72, 0, 1) }); }, [index]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }] }));
  return <Animated.View style={[st.tabLine, { width }, a]} />;
}

const st = StyleSheet.create({
  banner: { position: 'absolute', top: 0, left: 0, right: 0 },
  top: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, minHeight: 40, zIndex: 4 },
  stage: { width: STAGE_W, height: STAGE_H, alignSelf: 'center', marginTop: -18, alignItems: 'center', justifyContent: 'center' },
  online: { position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: 9, backgroundColor: C.green, borderWidth: 3, borderColor: C.bg },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 2, marginBottom: 6, paddingHorizontal: 14, zIndex: 6 },
  wornBubble: { position: 'absolute', bottom: 33, alignSelf: 'center', alignItems: 'center', width: 220, left: -98 },
  wornTail: { width: 10, height: 10, marginTop: -5, transform: [{ rotate: '45deg' }], backgroundColor: 'rgba(40,40,44,0.9)', borderRightWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderBottomRightRadius: 3 },
  pills: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  counts: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12 },
  count: { alignItems: 'center', minWidth: 86, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16 },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 12 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingLeft: 9, paddingRight: 12, marginBottom: 10, overflow: 'hidden' },
  cover: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  play: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  progress: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: C.accent },
  channel: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  subPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 },
  info: { marginHorizontal: 14, marginTop: 10, padding: 14 },
  rowSep: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabs: { flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingRight: 8 },
  tabBtn: { width: (W - 56) / 3, height: 46, alignItems: 'center', justifyContent: 'center' },
  tabLine: { position: 'absolute', left: 0, bottom: -1, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: C.accent },
  filterBtn: { marginLeft: 'auto', width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  cardPlain: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  ribbon: { position: 'absolute', top: 12, right: -26, width: 100, paddingVertical: 2, backgroundColor: 'rgba(0,0,0,0.45)', transform: [{ rotate: '45deg' }] },
  pin: { position: 'absolute', right: 8, bottom: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },
  story: { aspectRatio: 9 / 16, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  mini: { position: 'absolute', alignSelf: 'center' },
});
