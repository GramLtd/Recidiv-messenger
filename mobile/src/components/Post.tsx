import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Dimensions, Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Ellipsis, Eye, Heart, MessageCircle, Repeat2, Send, Lock, Star } from 'lucide-react-native';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/config';
import { useStore } from '../lib/store';
import { fmtNum } from '../lib/util';
import { C, webSpring } from '../lib/theme';
import { Avatar, PremiumStar, Press, Rise, T, Verified } from './ui';
import { StyledName } from './Profile';

const W = Dimensions.get('window').width;
export function ago(ts: number) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} с`;
  if (s < 3600) return `${Math.floor(s / 60)} мин`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} д`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Text with highlighted #tags and @mentions. */
export function RichText({ text, size = 15 }: { text: string; size?: number }) {
  const parts = String(text || '').split(/([#@][\p{L}\p{N}_]{2,40})/gu);
  return (
    <T size={size} style={{ lineHeight: size * 1.45 }} selectable>
      {parts.map((p, i) => ((p.startsWith('#') || p.startsWith('@')) && p.length > 2
        ? <T key={i} size={size} w={600} color={C.accent} onPress={p.startsWith('@') ? () => router.push(`/u/${p.slice(1)}` as any) : undefined}>{p}</T>
        : p))}
    </T>
  );
}

const seen = new Set<number>(); let queue: number[] = []; let timer: any = null;
function reportView(id: number) {
  if (seen.has(id)) return; seen.add(id); queue.push(id); clearTimeout(timer);
  timer = setTimeout(() => { const ids = queue; queue = []; api('/posts/views', { body: { ids } }).catch(() => {}); }, 1500);
}

function Pa({ children, onPress, color = C.text2 }: { children: React.ReactNode; onPress?: () => void; color?: string }) {
  return <Press scale={0.88} onPress={onPress} style={st.pa}>{children}</Press>;
}

/** Feed post — web `.post`: avatar 42, name + @user · time, text indented 52, media grid, action pills. */
export function PostCard({ p: post, onChange, onRemove, index = 0, embedded }: { p: any; onChange?: (p: any) => void; onRemove?: (p: any) => void; index?: number; embedded?: boolean }) {
  const me = useStore((s) => s.me);
  const heart = useSharedValue(1);
  const heartSt = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  useEffect(() => { if (!embedded) reportView(post.id); }, [post.id]);
  if (post.deleted) return <T dim size={13} style={{ padding: 16 }}>Пост удалён</T>;
  const like = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!post.liked) heart.value = withSequence(withTiming(1.35, { duration: 140 }), withSpring(1, webSpring));
    onChange?.({ ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) });
    try { onChange?.((await api(`/posts/${post.id}/like`, { body: {} })).post); } catch {}
  };
  const repost = async () => { try { await api('/posts', { body: { repostOf: post.repost?.id || post.id } }); onChange?.({ ...post, reposts: post.reposts + 1 }); } catch (e: any) { Alert.alert(e.message); } };
  const menu = () => {
    const items: [string, () => void, boolean?][] = [
      ['Скопировать ссылку', () => Clipboard.setStringAsync(`https://recidivist.lol/post/${post.id}`)],
      ['Репост', repost],
    ];
    if (post.mine && !post.repost) items.push(['Изменить', () => router.push({ pathname: '/compose', params: { editId: String(post.id), text: post.text || '' } })]);
    if (post.mine || me?.isAdmin) items.push(['Удалить', () => Alert.alert('Удалить пост?', '', [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: async () => { await api.del(`/posts/${post.id}`); onRemove?.(post); } }]), true]);
    const del = items.findIndex((i) => i[2]);
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...items.map((i) => i[0]), 'Отмена'], cancelButtonIndex: items.length, destructiveButtonIndex: del >= 0 ? del : undefined }, (i) => items[i]?.[1]());
    else Alert.alert('Пост', '', [...items.map(([t, f]) => ({ text: t, onPress: f })), { text: 'Отмена', style: 'cancel' as const }]);
  };
  const a = post.author;
  const body = post.repost && !post.text && !post.media?.length ? post.repost : post;
  const pure = body !== post;
  const media = body.media || [];
  const mw = W - 24 - 8 - (embedded ? 24 : 52);
  const Wrap: any = embedded ? View : Rise;
  return (
    <Wrap delay={Math.min(index, 10) * 40} style={embedded ? st.embedded : st.post}>
      {pure && <View style={st.repostLabel}><Repeat2 size={14} color={C.text2} /><T size={12.3} w={600} dim>{a.displayName} — репост</T></View>}
      <View style={st.head}>
        <Press scale={0.9} onPress={() => router.push(`/user/${body.author.id}`)}><Avatar uri={body.author.avatar} name={body.author.displayName} id={body.author.id} size={42} /></Press>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <StyledName user={body.author} />
          {body.author.verified && <Verified size={14} />}
          {body.author.premium && <PremiumStar size={14} />}
          <T size={13} dim numberOfLines={1} style={{ flexShrink: 1 }}>{body.author.username ? `@${body.author.username} · ` : ''}{ago(body.createdAt)}{body.edited ? ' · изменено' : ''}</T>
        </View>
        {!embedded && <Press scale={0.85} onPress={menu} style={st.more}><Ellipsis size={18} color={C.text2} /></Press>}
      </View>
      {!!body.text && <View style={{ marginTop: 8, marginLeft: embedded ? 0 : 52, opacity: body.locked ? 0.6 : 1 }}><RichText text={body.text} /></View>}
      {body.locked && (
        <View style={[st.locked, { marginLeft: embedded ? 0 : 52 }]}>
          <Lock size={22} color="#fff" />
          <T w={700} color="#fff">Только для подписчиков</T>
          <T size={12} color="rgba(255,255,255,0.75)" center>{body.lockedMedia ? `${body.lockedMedia} медиа · ` : ''}Подписка открывает все платные посты автора на 30 дней</T>
          <Press scale={0.95} onPress={() => Alert.alert(`Подписка на ${body.author.displayName}`, `✦ ${body.subPrice} за 30 дней`, [{ text: 'Отмена' }, { text: 'Подписаться', onPress: async () => {
            try { await api(`/users/${body.author.id}/subscribe`, { body: {} }); onChange?.((await api(`/posts/${post.id}`)).post); } catch (e: any) { Alert.alert(e.message); }
          } }])} style={st.subBtn}><T w={700} size={13} color="#fff">Подписаться · ✦ {body.subPrice}/мес</T></Press>
        </View>
      )}
      {body.paid && !body.locked && <View style={[st.paidTag, { marginLeft: embedded ? 0 : 52 }]}><Star size={11} color="#ffb340" /><T w={700} size={11} color="#ffb340">для подписчиков</T></View>}
      {media.length > 0 && (
        <View style={[st.media, { marginLeft: embedded ? 0 : 52 }]}>
          {media.length === 1
            ? <Image source={{ uri: mediaUrl(media[0].url) }} style={{ width: mw, height: Math.min(520, mw * ((media[0].height && media[0].width) ? media[0].height / media[0].width : 1)), backgroundColor: '#111' }} contentFit="cover" cachePolicy="memory-disk" />
            : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>{media.slice(0, 4).map((m: any, i: number) => <Image key={i} source={{ uri: mediaUrl(m.url) }} style={{ width: (mw - 4) / 2, height: (mw - 4) / 2, backgroundColor: '#111' }} contentFit="cover" />)}</View>}
        </View>
      )}
      {!pure && post.repost && <View style={{ marginTop: 10, marginLeft: 52 }}><PostCard p={post.repost} embedded /></View>}
      {!embedded && (
        <View style={st.actions}>
          <Pa onPress={like}>
            <Animated.View style={heartSt}><Heart size={20} color={post.liked ? '#ff3b5c' : C.text2} fill={post.liked ? '#ff3b5c' : 'none'} /></Animated.View>
            {post.likes > 0 && <T w={600} size={13.5} color={post.liked ? '#ff3b5c' : C.text2}>{fmtNum(post.likes)}</T>}
          </Pa>
          <Pa onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(post.id) } })}><MessageCircle size={20} color={C.text2} />{post.comments > 0 && <T w={600} size={13.5} dim>{fmtNum(post.comments)}</T>}</Pa>
          <Pa onPress={repost}><Repeat2 size={20} color={C.text2} />{post.reposts > 0 && <T w={600} size={13.5} dim>{fmtNum(post.reposts)}</T>}</Pa>
          <Pa onPress={() => router.push({ pathname: '/forward', params: { postId: String(post.id) } })}><Send size={19} color={C.text2} /></Pa>
          <View style={{ flex: 1 }} />
          <View style={st.pa}><Eye size={18} color={C.text3} /><T w={600} size={13.5} muted>{fmtNum(post.views)}</T></View>
        </View>
      )}
    </Wrap>
  );
}

const st = StyleSheet.create({
  post: { paddingTop: 14, paddingBottom: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  embedded: { borderWidth: 1, borderColor: C.border, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  media: { marginTop: 10, borderRadius: 18, overflow: 'hidden' },
  locked: { marginTop: 10, borderRadius: 18, padding: 18, alignItems: 'center', gap: 6, backgroundColor: 'rgba(120,40,90,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  subBtn: { marginTop: 6, paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  paidTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(255,179,64,0.12)' },
  repostLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 52, marginBottom: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 44 },
  pa: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 10, borderRadius: 18 },
});
