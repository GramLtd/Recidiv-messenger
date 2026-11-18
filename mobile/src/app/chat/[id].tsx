import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, Dimensions, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { playSend } from '../../lib/sound';
import { useLock } from '../../lib/lock';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming, withDelay } from 'react-native-reanimated';
import {
  BellOff, Camera, Check, Timer, CheckCheck, ChevronLeft, Copy, Eye, FileText, Forward, Gift as GiftIcon, Mic, Paperclip, Pause, Pencil, Play, Reply, Search, Send, Smile, Trash2, X, Lock,
} from 'lucide-react-native';
import { useStore, sendTyping } from '../../lib/store';
import { api, upload } from '../../lib/api';
import { decryptFrom, canEncryptTo } from '../../lib/e2e';
import { mediaUrl } from '../../lib/config';
import { usePerf } from '../../lib/perf';
import { usePlayer, fmtTime } from '../../lib/player';
import { AudioMsg } from '../../components/Music';
import { richText, stripFormatting } from '../../lib/richtext';
import { useFont, fontStyle } from '../../lib/fonts';
import { colorFor, dayLabel, fileSize, lastSeen, membersLabel, timeHM } from '../../lib/util';
import { C, webSpring } from '../../lib/theme';
import { AccentFill, Avatar, Glass, PremiumStar, Press, Radial, Spark, T, Verified, WornGift } from '../../components/ui';
import { GiftArt } from '../../components/GiftArt';

const W = Dimensions.get('window').width;
const QUICK = ['❤️', '🔥', '👍', '😂', '😮', '😢', '💀', '🤡'];
const EMOJIS = '😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍🤩😘😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾🙈🙉🙊💋💌💘💝💖💗💓💞💕💟❣️💔❤️🧡💛💚💙💜🤎🖤🤍💯💢💥💫💦💨💬💭💤👋🤚✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏💪🔥⭐🌟✨⚡🎉🎊🎁🏆👑💎🔪🗝️⛓️🚬🍾🥂🍻🎲🎯🎮'.match(/\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*/gu) || [];
const OUT_META = '#c55d64'; // color-mix(accent 50%, text-2)

/* ------------------------------------------------------------------ wallpaper (web ChatWallpaper presets) */
const PRESETS: Record<string, { colors: string[]; radial?: { cx: string; cy: string } ; angle?: [number, number, number, number] }> = {
  noir: { colors: ['#2a0a0e', '#000'], radial: { cx: '20%', cy: '10%' } },
  blood: { colors: ['#3d0008', '#120003', '#000'], angle: [0.3, 0, 0.7, 1] },
  ember: { colors: ['#5a1a00', '#1a0500', '#000'], radial: { cx: '80%', cy: '100%' } },
  aurora: { colors: ['#021b1a', '#0a2a4a', '#2a0a3a', '#021b1a'], angle: [0, 0, 1, 1] },
  neon: { colors: ['#1a0033', '#33001a', '#001a33'], angle: [0, 0, 1, 1] },
  ocean: { colors: ['#06345a', '#020c1a'], radial: { cx: '30%', cy: '0%' } },
  forest: { colors: ['#0e3a22', '#03120a'], radial: { cx: '70%', cy: '0%' } },
  gold: { colors: ['#4a3500', '#140e00', '#000'], radial: { cx: '50%', cy: '0%' } },
  steel: { colors: ['#23272e', '#0b0d10'], angle: [0, 0, 0, 1] },
  bars: { colors: ['#2a2a2a', '#050505'], radial: { cx: '50%', cy: '0%' } },
};
function Wallpaper({ wp }: { wp: any }) {
  if (!wp) return null;
  if (wp.preset) {
    const p = PRESETS[wp.preset];
    if (!p) return null;
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {p.radial ? <Radial inner={p.colors[0]} outer={p.colors[p.colors.length - 1]} cx={p.radial.cx} cy={p.radial.cy} stop={0.6} style={StyleSheet.absoluteFill} />
          : <LinearGradient colors={p.colors as any} start={{ x: p.angle![0], y: p.angle![1] }} end={{ x: p.angle![2], y: p.angle![3] }} style={StyleSheet.absoluteFill} />}
        {!!wp.dim && <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${wp.dim})` }]} />}
      </View>
    );
  }
  if (wp.type !== 'image') return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={{ uri: mediaUrl(wp.url) }} style={[StyleSheet.absoluteFill, wp.blur ? { transform: [{ scale: 1.08 }] } : null]} blurRadius={wp.blur || 0} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${wp.dim ?? 0.25})` }]} />
    </View>
  );
}

/* ------------------------------------------------------------------ message pieces */
function SecretText({ m, peerId }: { m: any; peerId: number }) {
  const [t, setT] = useState<string | null | undefined>(undefined);
  useEffect(() => { decryptFrom(m.id, peerId, m.media).then(setT); }, [m.id]);
  return <>{t === undefined ? '…' : t === null ? '🔒 Не удалось расшифровать' : `🔒 ${t}`}</>;
}

function VoiceMsg({ media, out }: { media: any; out: boolean }) {
  const cur = usePlayer((s) => s.current); const playing = usePlayer((s) => s.playing); const time = usePlayer((s) => s.time); const play = usePlayer((s) => s.playTrack);
  const active = cur?.url === media.url;
  const bars = useMemo(() => Array.from({ length: 28 }, (_, i) => 6 + Math.abs(Math.sin(i * 1.7 + (media.url?.length || 3))) * 18), [media.url]);
  return (
    <Pressable onPress={() => play({ url: media.url, title: 'Голосовое' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200, paddingVertical: 2 }}>
      <View style={[st.voiceBtn, { backgroundColor: out ? '#fff' : C.accent }]}>{active && playing ? <Pause size={18} color={out ? C.bubbleOut : '#fff'} fill={out ? C.bubbleOut : '#fff'} /> : <Play size={18} color={out ? C.bubbleOut : '#fff'} fill={out ? C.bubbleOut : '#fff'} style={{ marginLeft: 2 }} />}</View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 }}>
          {bars.map((h, i) => <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: out ? 'rgba(255,255,255,0.75)' : C.accent, opacity: active && media.duration && i / bars.length < time / media.duration ? 1 : 0.55 }} />)}
        </View>
        <T size={11} color={out ? OUT_META : C.text2}>{fmtTime(active ? time : media.duration || 0)}</T>
      </View>
    </Pressable>
  );
}

function Content({ m, chat, out }: { m: any; chat: any; out: boolean }) {
  const md = m.media;
  if (m.deleted) return <T dim style={{ fontStyle: 'italic' }}>Сообщение удалено</T>;
  switch (m.type) {
    case 'album': return md?.items ? <Album items={md.items} /> : null;
    case 'image': return md ? (
      <Pressable onPress={() => router.push({ pathname: '/media', params: { url: md.url, kind: 'image' } })}>
        <Image source={{ uri: mediaUrl(md.url) }} style={{ width: Math.min(W * 0.66, 280), height: Math.min(W * 0.66, 280) * (md.height && md.width ? Math.min(1.4, md.height / md.width) : 1), borderRadius: 12, backgroundColor: '#111' }} contentFit="cover" cachePolicy="memory-disk" transition={120} />
      </Pressable>
    ) : null;
    case 'sticker': return md ? <Image source={{ uri: mediaUrl(md.url) }} style={{ width: 170, height: 170 }} contentFit="contain" /> : null;
    case 'gif': return md ? (
      <View style={{ width: 220, aspectRatio: md.width && md.height ? md.width / md.height : 1.3, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' }}>
        <Image source={{ uri: mediaUrl(md.preview || md.url) }} style={StyleSheet.absoluteFill} contentFit="cover" autoplay />
        <View style={st.gifTag}><T w={800} size={10} color="#fff">GIF</T></View>
      </View>
    ) : null;
    case 'video': return md ? (md.round ? <RoundVideo url={md.url} /> : <VideoThumb md={md} />) : null;
    case 'voice': return md ? <VoiceMsg media={md} out={out} /> : null;
    case 'audio': return md ? <AudioMsg media={md} out={out} /> : null;
    case 'file': return md ? (
      <Pressable onPress={() => Linking.openURL(mediaUrl(md.url) || '')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 }}>
        <View style={st.fileIcon}><FileText size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}><T w={700} numberOfLines={1}>{md.name}</T><T size={12.8} dim>{fileSize(md.size || 0)}</T></View>
      </Pressable>
    ) : null;
    case 'post': return md ? (
      <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: String(md.postId) } })} style={st.postPrev}>
        {md.image && <Image source={{ uri: mediaUrl(md.image) }} style={{ width: 54, height: 54, borderRadius: 10 }} />}
        <View style={{ flex: 1 }}><T w={700} size={13.5}>{md.author}</T><T size={12.8} dim numberOfLines={2}>{md.text}</T></View>
      </Pressable>
    ) : null;
    case 'gift': return m.gift ? (
      <Pressable onPress={() => router.push({ pathname: '/gift/[id]', params: { id: String(m.gift.id) } })} style={{ alignItems: 'center', minWidth: 200, gap: 2 }}>
        <GiftArt ug={m.gift} style={{ width: 160, height: 160, borderRadius: 14, marginVertical: 4 }} />
        <T w={700}>{m.gift.collectible ? `${m.gift.gift.name} #${m.gift.collectible.number}` : m.gift.gift.name}</T>
        {m.gift.collectible ? <T size={12.8} dim>Коллекционный подарок</T> : <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><T size={12.8} dim>Подарок за</T><Spark amount={m.gift.gift.price} size={12.8} /></View>}
        <Glass radius={12} style={st.outlineBtn}><GiftIcon size={15} color={C.accent} /><T w={600} size={13.5} color={C.accent}>Посмотреть</T></Glass>
        {!!m.text && <T style={{ marginTop: 6, fontStyle: 'italic' }}>«{m.text}»</T>}
      </Pressable>
    ) : null;
    case 'transfer': return (
      <View style={{ alignItems: 'center', paddingVertical: 6, paddingHorizontal: 10 }}>
        <T size={30}>💸</T><Spark amount={md?.amount} size={18} /><T size={12.8} dim>Перевод</T>
      </View>
    );
    default: return null;
  }
}

/** Telegram-style album grid (rows 2 · 1+2 · 2+2 · 2+3 · 3+3 · 3+4 · 2+3+3 · 3+3+3 · 3+3+4). */
const ALBUM_ROWS: Record<number, number[]> = { 1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [3, 4], 8: [2, 3, 3], 9: [3, 3, 3], 10: [3, 3, 4] };
function Album({ items }: { items: any[] }) {
  const w = Math.min(W * 0.7, 300);
  const rows = ALBUM_ROWS[items.length] || [items.length];
  let k = 0;
  return (
    <View style={{ width: w, gap: 2, borderRadius: 12, overflow: 'hidden' }}>
      {rows.map((cnt, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 2, height: cnt === 1 ? w * 0.66 : (w - (cnt - 1) * 2) / cnt * (cnt === 2 ? 0.95 : 1) }}>
          {items.slice(k, (k += cnt)).map((it, i) => (
            <Pressable key={i} style={{ flex: 1, backgroundColor: '#111' }} onPress={() => router.push({ pathname: '/media', params: { url: it.url, kind: it.kind } })}>
              {it.kind === 'video' ? <AlbumVideo url={it.url} /> : <Image source={{ uri: mediaUrl(it.url) }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={120} />}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
function AlbumVideo({ url }: { url: string }) {
  const player = useVideoPlayer(mediaUrl(url) || null, (p) => { p.muted = true; });
  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
      <View style={[st.playBadge, { width: 36, height: 36, marginLeft: -18, marginTop: -18, borderRadius: 18 }]}><Play size={16} color="#fff" fill="#fff" style={{ marginLeft: 2 }} /></View>
    </>
  );
}

/** Video in a bubble: first frame + play badge; tap opens the full-screen player. */
function VideoThumb({ md }: { md: any }) {
  const player = useVideoPlayer(mediaUrl(md.url) || null, (p) => { p.muted = true; });
  const w = Math.min(W * 0.66, 280);
  const h = w * (md.height && md.width ? Math.min(1.4, md.height / md.width) : 0.6);
  return (
    <Pressable onPress={() => router.push({ pathname: '/media', params: { url: md.url, kind: 'video' } })} style={{ width: w, height: h, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
      <View style={st.playBadge}><Play size={26} color="#fff" fill="#fff" style={{ marginLeft: 3 }} /></View>
      {!!md.duration && <View style={st.dur}><T size={11} w={600} color="#fff">{fmtTime(md.duration)}</T></View>}
    </Pressable>
  );
}
/** Telegram-style round video: plays muted in a loop; tap toggles sound. */
function RoundVideo({ url }: { url: string }) {
  const [sound, setSound] = useState(false);
  const player = useVideoPlayer(mediaUrl(url) || null, (p) => { p.loop = true; p.muted = true; p.play(); });
  return (
    <Pressable onPress={() => { const v = !sound; setSound(v); player.muted = !v; if (v) { player.currentTime = 0; player.play(); } }} style={st.roundVid}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
      {!sound && <View style={st.roundMute}><T size={11} w={700} color="#fff">🔇</T></View>}
    </Pressable>
  );
}

const Bubble = React.memo(function Bubble({ m, chat, meId, grouped, groupedNext, onLong, onReact, fresh }: any) {
  const out = m.sender?.id === meId && chat.type !== 'channel';
  const low = usePerf((s) => s.low);
  const e = useSharedValue(low ? 1 : 0);
  useEffect(() => { if (!low) e.value = withTiming(1, { duration: fresh ? 380 : 220, easing: Easing.bezier(0.2, 0.85, 0.25, 1) }); }, []);
  const a = useAnimatedStyle(() => ({ opacity: e.value, transform: [{ translateY: (1 - e.value) * (fresh ? 26 : 8) }, { scale: 0.97 + 0.03 * e.value }] }));
  const lastTap = useRef(0);
  if (m.type === 'system') return <View style={st.sysWrap}><View style={st.sys}><T size={12.8} color="#fff" center>{m.text}</T></View></View>;
  const isChannel = chat.type === 'channel';
  const group = chat.type === 'group';
  const sticker = (m.type === 'sticker' || (m.type === 'video' && m.media?.round)) && !m.deleted;
  const mediaOnly = ['image', 'gif', 'album'].includes(m.type) && !m.text && !m.replyTo && !m.deleted;
  const read = out && chat.peerReadId >= m.id;
  const showTicks = out && chat.type !== 'saved';
  const metaText = `${m.edited && !m.deleted ? 'изменено · ' : ''}${isChannel ? `👁 ${m.views || 0}  ` : ''}${timeHM(m.createdAt)}${showTicks ? '   ' : ''}`;
  const metaColor = out ? OUT_META : C.text2;
  const meta = (
    <View style={[st.meta, (mediaOnly || sticker) && st.metaOver]} pointerEvents="none">
      <T size={10.8} color={mediaOnly || sticker ? '#fff' : metaColor}>{metaText.trimEnd()}</T>
      {showTicks && (read ? <CheckCheck size={15} color={mediaOnly || sticker ? '#fff' : metaColor} /> : <Check size={15} color={mediaOnly || sticker ? '#fff' : metaColor} />)}
    </View>
  );
  const text = m.type === 'secret' ? <SecretText m={m} peerId={chat.peer?.id} /> : m.type !== 'gift' && !m.deleted && m.text ? richText(m.text) : '';
  const onPress = () => {
    const now = Date.now();
    if (now - lastTap.current < 280 && !m.deleted) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onReact(m, '❤️'); }
    lastTap.current = now;
  };
  return (
    <Animated.View style={[st.row, out ? st.rowOut : st.rowIn, !grouped && { marginTop: 6 }, a]}>
      {group && !out && <View style={{ width: 34 }}>{!groupedNext && <Press onPress={() => router.push(`/user/${m.sender?.id}`)}><Avatar uri={m.sender?.avatar} name={m.sender?.displayName} id={m.sender?.id} size={34} /></Press>}</View>}
      <Pressable onPress={onPress} onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onLong(m); }} delayLongPress={300}
        style={[st.bubble, { backgroundColor: out ? C.bubbleOut : C.bubbleIn }, !groupedNext && (out ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }),
          mediaOnly && st.mediaOnly, sticker && st.stickerBubble, isChannel && { maxWidth: W * 0.92 }]}>
        {isChannel && !grouped && <T w={600} size={13.2} color={C.accent} style={{ marginBottom: 2 }}>{chat.title}</T>}
        {group && !out && !grouped && m.sender && <T w={600} size={13.2} color={colorFor(m.sender.id)} style={{ marginBottom: 2 }}>{m.sender.displayName}</T>}
        {m.forwardFrom && <T size={12.8} color={C.accent} style={{ marginBottom: 2 }}>Переслано от {m.forwardFrom.displayName}</T>}
        {m.replyTo && (
          <View style={st.quote}><T w={700} size={12.5} color={C.accent} numberOfLines={1}>{m.replyTo.senderName || 'Сообщение'}</T><T size={12.5} dim numberOfLines={1}>{stripFormatting(m.replyTo.text) || (m.replyTo.type !== 'text' ? 'Медиа' : '')}</T></View>
        )}
        <Content m={m} chat={chat} out={out} />
        {text ? (
          <T style={{ lineHeight: 21 }} selectable={false}>
            {text}
            {/* invisible copy of the meta reserves room on the last line, like the web's floated .meta */}
            <T size={10.8} color="transparent">{'\u00A0\u00A0'}{metaText.trimEnd()}{showTicks ? '\u00A0\u00A0\u00A0\u00A0\u00A0' : ''}</T>
          </T>
        ) : null}
        {text || (!mediaOnly && !sticker && m.type !== 'gift' && m.type !== 'transfer') ? <View style={st.metaAbs}>{meta}</View> : (mediaOnly || sticker) ? meta : <View style={{ alignSelf: 'flex-end', marginTop: 2 }}>{meta}</View>}
        {m.reactions?.length > 0 && (
          <View style={st.reactions}>
            {m.reactions.map((r: any) => (
              <Press key={r.emoji} scale={0.85} onPress={() => onReact(m, r.emoji)} style={[st.reaction, r.users?.includes(meId) && { backgroundColor: C.accent }]}>
                <T size={13.5} color={r.users?.includes(meId) ? '#fff' : C.text}>{r.emoji} {r.count}</T>
              </Press>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

/* ------------------------------------------------------------------ screen */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = Number(id);
  const insets = useSafeAreaInsets();
  const font = useFont((s) => s.id);
  const me = useStore((st) => st.me);
  const chat = useStore((st) => st.chats.find((c) => c.id === chatId));
  const otherUnread = useStore((st) => st.chats.reduce((n, c) => n + (c.id !== chatId && !c.muted ? c.unread || 0 : 0), 0));
  const messages = useStore((st) => st.messages[chatId]);
  const hasMore = useStore((st) => st.hasMore[chatId]);
  const typingUntil = useStore((st) => st.typing[chatId] || 0);
  const { loadMessages, send, openChat, upsertMessage, ensureChat } = useStore.getState();
  const low = usePerf((p) => p.low);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [menu, setMenu] = useState<any>(null);
  const [emoji, setEmoji] = useState(false);
  const [secret, setSecret] = useState(false);
  const [canSecret, setCanSecret] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [results, setResults] = useState<any[]>([]);
  const [rec, setRec] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const sentAt = useRef(0);
  const lastTyping = useRef(0);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const listRef = useRef<FlatList>(null);
  const [recMode, setRecMode] = useState<'voice' | 'video'>('voice');
  const [round, setRound] = useState(false);
  const roundRef = useRef<any>(null);
  const [camPerm, reqCam] = useCameraPermissions();
  const [micPerm, reqMic] = useMicrophonePermissions();
  // scroll down when my own message lands (also from another device)
  const lastMine = (messages || []).filter((m: any) => m.sender?.id === me?.id).slice(-1)[0]?.id;
  useEffect(() => { if (lastMine) listRef.current?.scrollToOffset({ offset: 0, animated: true }); }, [lastMine]);
  const [, force] = useState(0);

  useEffect(() => { ensureChat(chatId).catch(() => {}); openChat(chatId); loadMessages(chatId).catch(() => {}); return () => openChat(null); }, [chatId]);
  useEffect(() => { if (chat?.type === 'private' && chat.peer && chat.peer.id !== me?.id) canEncryptTo(chat.peer.id).then((ok) => { setCanSecret(ok); if (ok && useLock.getState().e2eDefault) setSecret(true); }); }, [chat?.peer?.id]);
  useEffect(() => { if (!rec) return undefined; const t = setInterval(() => force((x) => x + 1), 500); return () => clearInterval(t); }, [rec]);
  useEffect(() => {
    if (!search || search.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => api(`/chats/${chatId}/search?q=${encodeURIComponent(search.trim())}`).then((r) => setResults(r.messages || [])).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [search]);

  // inverted list: newest first; date pills between days; grouping like the web (same sender, < 5 min, same day)
  const items = useMemo(() => {
    const list = (messages || []).filter((m: any) => !m.deleted);
    const same = (a: any, b: any) => a && b && a.type !== 'system' && b.type !== 'system' && a.sender?.id === b.sender?.id && Math.abs(b.createdAt - a.createdAt) < 300000 && new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString();
    const out: any[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]; const prev = list[i - 1]; const next = list[i + 1];
      out.push({ k: `m${m.id}`, m, grouped: same(prev, m), groupedNext: same(m, next) });
      if (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) out.push({ k: `d${m.id}`, day: dayLabel(m.createdAt) });
    }
    return out;
  }, [messages]);

  const toBottom = () => requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
  const submit = async () => {
    const t = text.trim();
    if (!t || !chat) return;
    setText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSend();
    sentAt.current = Date.now();
    toBottom();
    try {
      if (edit) { const r = await api.patch(`/messages/${edit.id}`, { text: t }); upsertMessage(r.message); setEdit(null); }
      else { await send(chat, { text: t, replyTo: reply?.id, secret }); setReply(null); toBottom(); }
    } catch (e: any) { setText(t); alert(e.message); }
  };
  // long-press on send (Telegram): silent / scheduled
  const sendOptions = () => {
    const t = text.trim();
    if (!t || !chat) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const at = (h: number, m = 0, plusDays = 0) => { const d = new Date(); d.setDate(d.getDate() + plusDays); d.setHours(h, m, 0, 0); if (d.getTime() < Date.now() + 60_000) d.setDate(d.getDate() + 1); return d.getTime(); };
    const schedule = async (when: number) => {
      try {
        await api(`/chats/${chat.id}/messages`, { body: { text: t, replyTo: reply?.id, scheduleAt: when } });
        setText(''); setReply(null);
        Alert.alert('Сообщение отложено', `Отправится ${new Date(when).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
      } catch (e: any) { Alert.alert(e.message); }
    };
    const items: [string, () => void][] = [
      ['Отправить без звука', async () => { setText(''); playSend(); try { await send(chat, { text: t, replyTo: reply?.id, silent: true }); setReply(null); toBottom(); } catch (e: any) { setText(t); Alert.alert(e.message); } }],
      ['Отложить на час', () => schedule(Date.now() + 3600_000)],
      ['Отложить до 20:00', () => schedule(at(20))],
      ['Отложить до завтра, 9:00', () => schedule(at(9, 0, 1))],
    ];
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...items.map((i) => i[0]), 'Отмена'], cancelButtonIndex: items.length }, (i) => items[i]?.[1]());
    else Alert.alert('Отправка', '', [...items.map(([l, f]) => ({ text: l, onPress: f })), { text: 'Отмена', style: 'cancel' as const }]);
  };
  const sendMedia = async (media: any) => {
    sentAt.current = Date.now();
    try { await send(chat, { media, replyTo: reply?.id }); playSend(); setReply(null); toBottom(); } catch (e: any) { alert(e.message); }
  };
  const attach = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, allowsMultipleSelection: true, selectionLimit: 10 });
    if (r.canceled) return;
    setBusy(true);
    // up to 10 photos / videos go out as one Telegram-style album; the typed text becomes its caption
    try {
      const items: any[] = [];
      for (const a of r.assets.slice(0, 10)) {
        const up = await upload(a.uri, a.fileName || (a.type === 'video' ? 'video.mp4' : 'photo.jpg'), a.mimeType || (a.type === 'video' ? 'video/mp4' : 'image/jpeg'));
        items.push({ ...up, width: a.width, height: a.height, duration: a.duration ? Math.round(a.duration / 1000) : undefined });
      }
      const caption = text.trim();
      sentAt.current = Date.now();
      await send(chat, { media: items.length === 1 ? items[0] : { kind: 'album', items }, text: caption || undefined, replyTo: reply?.id });
      playSend(); setReply(null); if (caption) setText(''); toBottom();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };
  const startRec = async () => {
    const p = await requestRecordingPermissionsAsync();
    if (!p.granted) return alert('Нет доступа к микрофону');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRec(Date.now());
  };
  const stopRec = async (cancel: boolean) => {
    const started = rec; setRec(null);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (cancel || !recorder.uri || !started) return;
    try { const up = await upload(recorder.uri, `voice-${Date.now()}.m4a`, 'audio/mp4'); await sendMedia({ ...up, duration: Math.round((Date.now() - started) / 1000) }); } catch (e: any) { alert(e.message); }
  };
  const startRound = async () => {
    if (!camPerm?.granted && !(await reqCam()).granted) return alert('Нет доступа к камере');
    if (!micPerm?.granted && !(await reqMic()).granted) return alert('Нет доступа к микрофону');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRound(true);
    setRec(Date.now());
  };
  const onCamReady = async () => {
    const started = Date.now();
    try {
      const v = await roundRef.current?.recordAsync({ maxDuration: 60 });
      if (!v?.uri || roundCancel.current) return;
      const up = await upload(v.uri, `round-${Date.now()}.mp4`, 'video/mp4');
      await sendMedia({ ...up, kind: 'video', round: true, width: 1, height: 1, duration: Math.round((Date.now() - started) / 1000) });
    } catch (e: any) { alert(e.message); } finally { roundCancel.current = false; }
  };
  const roundCancel = useRef(false);
  const stopRound = (cancel: boolean) => {
    roundCancel.current = cancel;
    setRec(null);
    try { roundRef.current?.stopRecording(); } catch {}
    setTimeout(() => setRound(false), 50);
  };
  const react = async (m: any, e: string) => {
    setMenu(null);
    Haptics.selectionAsync();
    const r = await api(`/messages/${m.id}/react`, { body: { emoji: e } }).catch(() => null);
    if (r) upsertMessage(r.message);
  };
  const act = async (kind: string) => {
    const m = menu; setMenu(null);
    if (kind === 'reply') setReply(m);
    if (kind === 'edit') { setEdit(m); setText(m.text || ''); }
    if (kind === 'copy') Clipboard.setStringAsync(m.text || '');
    if (kind === 'forward') router.push({ pathname: '/forward', params: { messageId: String(m.id) } });
    if (kind === 'delete') await api.del(`/messages/${m.id}`).catch((e) => alert(e.message));
  };

  if (!chat || !me) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const typing = typingUntil > Date.now();
  const online = chat.type === 'private' && chat.peer?.online;
  const status = typing ? 'печатает…' : chat.type === 'private' ? lastSeen(chat.peer) : chat.type === 'saved' ? 'облако' : chat.memberCount ? membersLabel(chat) : '';
  const TTL: [number, string][] = [[0, 'Выключено'], [3600, '1 час'], [86400, '1 день'], [604800, '1 неделя'], [2592000, '1 месяц']];
  const timerMenu = () => {
    const set = async (v: number) => { try { useStore.getState().upsertChat((await api(`/chats/${chat.id}/auto-delete`, { body: { seconds: v } })).chat); } catch (e: any) { alert(e.message); } };
    const opts = TTL.map(([v, l]) => ((chat.autoDelete || 0) === v ? `✓ ${l}` : l));
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ title: 'Автоудаление сообщений', message: 'Новые сообщения исчезнут у всех через выбранное время', options: [...opts, 'Отмена'], cancelButtonIndex: opts.length }, (i) => TTL[i] && set(TTL[i][0]));
    else Alert.alert('Автоудаление сообщений', '', TTL.map(([v, l]) => ({ text: l, onPress: () => set(v) })));
  };
  const ttlLabel = TTL.find((t) => t[0] === chat.autoDelete)?.[1];
  const canPost = chat.isMember !== false && (chat.type !== 'channel' || chat.role !== 'member');
  const quote = edit || reply;
  const own = menu && menu.sender?.id === me.id;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Wallpaper wp={me.wallpaper} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList contentInsetAdjustmentBehavior="never"
          ref={listRef}
          inverted
          data={items}
          keyExtractor={(it) => it.k}
          renderItem={({ item }) => item.day
            ? <View style={st.dayWrap}><View style={st.day}>{!low && <BlurView tint="dark" intensity={20} style={StyleSheet.absoluteFill} />}<T w={500} size={12.3} color="#fff">{item.day}</T></View></View>
            : <Bubble m={item.m} chat={chat} meId={me.id} grouped={item.grouped} groupedNext={item.groupedNext} onLong={setMenu} onReact={react} fresh={Date.now() - sentAt.current < 4000 && item.m.sender?.id === me.id} />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.top + 70, paddingHorizontal: 12 }}
          ListEmptyComponent={messages ? <View style={[st.dayWrap, { transform: [{ scaleY: -1 }], marginTop: 80 }]}><View style={st.day}><T size={13.5} color="#fff">{chat.type === 'saved' ? 'Пересылайте сюда сообщения и сохраняйте файлы' : 'Сообщений пока нет — напишите первым!'}</T></View></View> : undefined}
          onEndReached={() => hasMore && loadMessages(chatId, true).catch(() => {})}
          onEndReachedThreshold={0.4}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          windowSize={11}
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />

        {canPost ? (
          <View style={st.composerWrap}>
            {emoji && (
              <Animated.View entering={FadeIn.duration(180)} style={st.emojiPanel}>
                <Glass radius={22} fill="rgba(24,24,28,0.72)" style={{ flex: 1 }}>
                  <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={st.emojiGrid}>
                    {EMOJIS.map((e, i) => <Pressable key={i} onPress={() => setText((t) => t + e)} style={st.emojiCell}><T size={26}>{e}</T></Pressable>)}
                  </ScrollView>
                </Glass>
              </Animated.View>
            )}
            <View style={st.composerInner}>
              <Glass radius={22} fill="rgba(18,18,18,0.78)" edge="rgba(255,255,255,0.16)" hi="rgba(255,255,255,0.08)" style={st.composer}>
                {quote && (
                  <View style={st.reply}>
                    {edit ? <Pencil size={20} color={C.accent} /> : <Reply size={20} color={C.accent} />}
                    <View style={[st.quote, { flex: 1, marginVertical: 0 }]}>
                      <T w={700} size={12.5} color={C.accent} numberOfLines={1}>{edit ? 'Редактирование' : `Ответ ${reply?.sender?.displayName || ''}`}</T>
                      <T size={12.5} dim numberOfLines={1}>{quote.text || 'Медиа'}</T>
                    </View>
                    <Press scale={0.85} onPress={() => { if (edit) setText(''); setReply(null); setEdit(null); }} style={st.iconBtn}><X size={20} color={C.text2} /></Press>
                  </View>
                )}
                {rec ? (
                  <View style={st.recRow}>
                    <View style={st.recDot} />
                    <T>{Math.floor((Date.now() - rec) / 1000)} c</T>
                    <View style={{ flex: 1 }} />
                    <T size={13} dim>{round ? 'Отпустите, чтобы отправить кружок' : 'Отпустите, чтобы отправить'}</T>
                  </View>
                ) : (
                  <View style={st.composerRow}>
                    <Press scale={0.85} onPress={() => setEmoji(!emoji)} style={st.iconBtn}><Smile size={24} color={emoji ? C.accent : C.text2} /></Press>
                    <TextInput
                      value={text}
                      onChangeText={(v) => { setText(v); if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); sendTyping(chatId); } }}
                      onFocus={() => setEmoji(false)}
                      placeholder={secret ? 'Зашифрованное сообщение' : chat.type === 'channel' ? 'Опубликовать…' : 'Сообщение'}
                      placeholderTextColor={C.text3}
                      multiline
                      style={[st.input, fontStyle(font, 400, 15)]}
                    />
                    {canSecret && !edit && <Press scale={0.85} onPress={() => setSecret(!secret)} style={st.iconBtn}><Lock size={20} color={secret ? '#34c759' : C.text2} /></Press>}
                    {!edit && <Press scale={0.85} onPress={attach} disabled={busy} style={st.iconBtn}><Paperclip size={22} color={C.text2} /></Press>}
                  </View>
                )}
              </Glass>
              {text.trim() || edit ? (
                <Press scale={0.9} onPress={submit} onLongPress={edit ? undefined : sendOptions}>
                  <AccentFill radius={25} style={st.send}>{edit ? <Check size={24} color="#fff" /> : <Send size={22} color="#fff" style={{ marginLeft: 2 }} />}</AccentFill>
                </Press>
              ) : (
                <Pressable
                  onPress={() => { if (!rec && !round) { Haptics.selectionAsync(); setRecMode(recMode === 'voice' ? 'video' : 'voice'); } }}
                  onLongPress={() => (recMode === 'voice' ? startRec() : startRound())}
                  delayLongPress={220}
                  onPressOut={() => { if (rec) stopRec(false); if (round) stopRound(false); }}
                >
                  <AccentFill radius={25} style={[st.send, rec || round ? { transform: [{ scale: 1.25 }] } : null]}>
                    {recMode === 'voice' ? <Mic size={22} color="#fff" /> : <Camera size={22} color="#fff" />}
                  </AccentFill>
                </Pressable>
              )}
            </View>
            <View style={{ height: Math.max(12, insets.bottom) - 4 }} />
          </View>
        ) : <View style={{ height: insets.bottom + 10 }} />}
      </KeyboardAvoidingView>

      {/* header (.tg-head): dark gradient, liquid-glass back pill / title pill / search / avatar */}
      <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={[st.headGrad, { height: insets.top + 80 }]} />
      <View style={[st.head, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Press onPress={() => router.back()} scale={0.95}>
          <Glass radius={23} style={st.back}>
            <ChevronLeft size={24} color={C.text} />
            {otherUnread > 0 && <View style={st.backCount}><T w={700} size={12.3} color={C.bg}>{otherUnread > 999 ? '999+' : otherUnread}</T></View>}
          </Glass>
        </Press>
        {search !== null ? (
          <Glass radius={23} style={st.searchPill}>
            <Search size={17} color={C.text2} />
            <TextInput autoFocus value={search} onChangeText={setSearch} placeholder="Поиск в чате" placeholderTextColor={C.text3} style={[{ flex: 1, color: C.text }, fontStyle(font, 400, 15)]} />
            <Press onPress={() => { setSearch(null); setResults([]); }} style={{ padding: 6 }}><X size={18} color={C.text2} /></Press>
          </Glass>
        ) : (
          <Press onPress={() => (chat.peer ? router.push(`/user/${chat.peer.id}`) : undefined)} style={{ flex: 1 }} scale={0.97}>
            <Glass radius={23} style={st.title}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: '100%' }}>
                <T w={700} numberOfLines={1} style={{ flexShrink: 1 }}>{chat.title}</T>
                {chat.peer?.verified && <Verified size={15} />}
                {chat.peer?.premium && <PremiumStar size={14} />}
                {!!chat.peer?.emojiStatus && <T size={14}>{chat.peer.emojiStatus}</T>}
                {chat.peer?.wornGift && <WornGift gift={chat.peer.wornGift} size={18} />}
                {chat.muted && <BellOff size={13} color={C.text2} />}
              </View>
              {!!(status || chat.autoDelete) && <T size={11.7} color={typing || online ? C.accent : C.text2} numberOfLines={1}>{status}{chat.autoDelete ? `${status ? ' · ' : ''}⏱ ${ttlLabel}` : ''}</T>}
            </Glass>
          </Press>
        )}
        {search === null && (chat.type === 'private' || chat.type === 'saved' || chat.role === 'owner' || chat.role === 'admin') && (
          <Press onPress={timerMenu} scale={0.92}><Glass radius={21} style={st.round}><Timer size={19} color={chat.autoDelete ? C.accent : C.text} /></Glass></Press>
        )}
        {search === null && <Press onPress={() => setSearch('')} scale={0.92}><Glass radius={21} style={st.round}><Search size={19} color={C.text} /></Glass></Press>}
        <Press onPress={() => (chat.peer ? router.push(`/user/${chat.peer.id}`) : undefined)} scale={0.92}>
          <View style={st.avaRing}><Avatar uri={chat.avatar} name={chat.title} id={chat.peer?.id || chat.id} size={44} /></View>
        </Press>
      </View>
      {search !== null && results.length > 0 && (
        <View style={[st.results, { top: insets.top + 64 }]}>
          <ScrollView contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled">
            {results.map((m) => (
              <Pressable key={m.id} style={st.resRow} onPress={() => { setSearch(null); setResults([]); }}>
                <View style={{ flex: 1 }}><T w={700} size={13.5}>{m.sender?.displayName}</T><T size={13} dim numberOfLines={1}>{m.text}</T></View>
                <T size={11} dim>{dayLabel(m.createdAt)}</T>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {round && (
        <Animated.View entering={FadeIn.duration(200)} style={st.roundOverlay} pointerEvents="none">
          <View style={st.roundCam}>
            <CameraView ref={roundRef} style={StyleSheet.absoluteFill} facing="front" mode="video" mute={false} onCameraReady={onCamReady} />
          </View>
          <View style={st.roundTimer}><View style={st.recDot} /><T w={700} color="#fff">{rec ? `${Math.floor((Date.now() - rec) / 1000)} c` : ''}</T></View>
        </Animated.View>
      )}

      {/* long-press menu: reaction strip + actions (web .ctx-menu), over a blurred chat */}
      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)}>
          {low ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]} /> : <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />}
          {menu && <MenuSheet m={menu} own={own} chat={chat} onReact={(e: string) => react(menu, e)} onAct={act} />}
        </Pressable>
      </Modal>
    </View>
  );
}

function MenuSheet({ m, own, chat, onReact, onAct }: any) {
  const s = useSharedValue(0);
  useEffect(() => { s.value = withTiming(1, { duration: 240, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }); }, []);
  const a = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ translateY: (1 - s.value) * 10 }, { scale: 0.97 + 0.03 * s.value }] }));
  const canDelete = own || chat.role === 'owner' || chat.role === 'admin';
  const canReply = chat.type !== 'channel' || chat.role !== 'member';
  const items = [
    canReply && !m.deleted && ['reply', 'Ответить', Reply],
    m.text && !m.deleted && m.type !== 'secret' && ['copy', 'Копировать', Copy],
    !m.deleted && m.type !== 'gift' && m.type !== 'transfer' && m.type !== 'secret' && ['forward', 'Переслать', Forward],
    own && !m.deleted && ['text', 'image', 'video', 'file'].includes(m.type) && ['edit', 'Изменить', Pencil],
    canDelete && !m.deleted && ['delete', 'Удалить', Trash2],
  ].filter(Boolean) as [string, string, any][];
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 18, alignItems: own ? 'flex-end' : 'flex-start' }}>
      <View style={[st.bubble, { backgroundColor: own ? C.bubbleOut : C.bubbleIn, marginBottom: 10, maxWidth: W * 0.78 }]}>
        <T>{m.type === 'secret' ? '🔒 Зашифрованное сообщение' : m.text || 'Медиа'}</T>
      </View>
      <Animated.View style={[{ width: 260 }, a]}>
        <Glass radius={18} fill="rgba(11,11,11,0.7)" edge="rgba(255,255,255,0.16)" hi="rgba(255,255,255,0.12)" style={{ padding: 6 }}>
          {!m.deleted && chat.isMember !== false && (
            <View style={st.strip}>
              {QUICK.map((e, i) => <ReactBtn key={e} e={e} i={i} onPress={() => onReact(e)} />)}
            </View>
          )}
          {items.map(([k, l, I]) => (
            <Press key={k} scale={0.98} onPress={() => onAct(k)} style={st.menuItem}>
              <I size={18} color={k === 'delete' ? C.danger : C.text2} />
              <T size={14} color={k === 'delete' ? C.danger : C.text}>{l}</T>
            </Press>
          ))}
        </Glass>
      </Animated.View>
    </View>
  );
}
function ReactBtn({ e, i, onPress }: { e: string; i: number; onPress: () => void }) {
  const s = useSharedValue(0);
  useEffect(() => { s.value = withDelay(60 + i * 18, withTiming(1, { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.2, 1) })); }, []);
  const a = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ translateY: (1 - s.value) * 6 }] }));
  return <Animated.View style={a}><Press scale={0.85} onPress={onPress} style={st.reactBtn}><T size={20}>{e}</T></Press></Animated.View>;
}

const st = StyleSheet.create({
  headGrad: { position: 'absolute', top: 0, left: 0, right: 0 },
  head: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingBottom: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 46, paddingLeft: 8, paddingRight: 12 },
  backCount: { minWidth: 26, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  title: { height: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  searchPill: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 8 },
  round: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  avaRing: { width: 48, height: 48, borderRadius: 24, padding: 2, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)' },
  results: { position: 'absolute', left: 10, right: 10, maxHeight: 260, borderRadius: 18, backgroundColor: 'rgba(11,11,11,0.96)', borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  resRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  day: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', overflow: 'hidden' },
  sysWrap: { alignItems: 'center', marginVertical: 6 },
  sys: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', maxWidth: '80%' },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  rowOut: { justifyContent: 'flex-end' },
  rowIn: { justifyContent: 'flex-start' },
  bubble: { maxWidth: W * 0.78, paddingTop: 6, paddingBottom: 6, paddingLeft: 11, paddingRight: 10, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 1, shadowOffset: { width: 0, height: 1 } },
  mediaOnly: { padding: 3, overflow: 'hidden' },
  stickerBubble: { backgroundColor: 'transparent', padding: 0, shadowOpacity: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaAbs: { position: 'absolute', right: 10, bottom: 5 },
  metaOver: { position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  quote: { borderLeftWidth: 3, borderLeftColor: C.accent, backgroundColor: `rgba(${C.accentRgb},0.1)`, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8, marginTop: 2, marginBottom: 4 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reaction: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 14, backgroundColor: `rgba(${C.accentRgb},0.15)` },
  voiceBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fileIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  postPrev: { flexDirection: 'row', gap: 10, alignItems: 'center', minWidth: 220, maxWidth: 300, padding: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderLeftWidth: 3, borderLeftColor: C.accent, marginBottom: 4 },
  videoBox: { width: 220, height: 160, borderRadius: 12, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 4 },
  gifTag: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.5)' },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 14, height: 36 },
  composerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  composerInner: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composer: { flex: 1, minHeight: 50, justifyContent: 'flex-end' },
  composerRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  input: { flex: 1, color: C.text, paddingTop: 13, paddingBottom: 13, paddingHorizontal: 4, maxHeight: 180 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  reply: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, paddingRight: 8, paddingLeft: 14 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 48 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  send: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  emojiPanel: { height: 300, marginBottom: 8 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  emojiCell: { width: (W - 24 - 16) / 8, height: 44, alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', gap: 2, padding: 4, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 },
  reactBtn: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
  playBadge: { position: 'absolute', left: '50%', top: '50%', width: 52, height: 52, marginLeft: -26, marginTop: -26, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', left: 8, top: 8, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  roundVid: { width: 220, height: 220, borderRadius: 110, overflow: 'hidden', backgroundColor: '#111' },
  roundMute: { position: 'absolute', bottom: 14, alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  roundOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', gap: 16 },
  roundCam: { width: W * 0.72, height: W * 0.72, borderRadius: W * 0.36, overflow: 'hidden', borderWidth: 3, borderColor: C.accent, backgroundColor: '#000' },
  roundTimer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10 },
});
