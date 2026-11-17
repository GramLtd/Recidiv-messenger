import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeInDown, SlideInDown, ZoomIn, LinearTransition } from 'react-native-reanimated';
import { useStore, sendTyping } from '../../lib/store';
import { api } from '../../lib/api';
import { decryptFrom, canEncryptTo } from '../../lib/e2e';
import { mediaUrl } from '../../lib/config';
import { Avatar, Glass, Press, T } from '../../components/ui';
import { C } from '../../lib/theme';
import { usePerf } from '../../lib/perf';

const REACTIONS = ['❤️', '🔥', '👍', '😂', '😮', '😢', '💀', '🤡'];
const hm = (ts: number) => new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (ts: number) => {
  const d = new Date(ts); const n = new Date();
  const y = new Date(); y.setDate(n.getDate() - 1);
  if (d.toDateString() === n.toDateString()) return 'Сегодня';
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

function SecretText({ m, peerId }: { m: any; peerId: number }) {
  const [t, setT] = useState<string | null | undefined>(undefined);
  useEffect(() => { decryptFrom(m.id, peerId, m.media).then(setT); }, [m.id]);
  return <T>{t === undefined ? '…' : t === null ? '🔒 Не удалось расшифровать' : `🔒 ${t}`}</T>;
}

const Bubble = React.memo(function Bubble({ m, out, peerId, onLong, onReact, meId }: any) {
  const media = m.media;
  const sticker = m.type === 'sticker';
  return (
    <Animated.View entering={out ? FadeInDown.duration(220) : FadeIn.duration(180)} layout={LinearTransition.springify().damping(18)} style={[s.msgRow, out ? s.right : s.left]}>
      <Pressable onLongPress={() => onLong(m)} delayLongPress={280} style={[s.bubble, sticker ? s.sticker : out ? s.out : s.in]}>
        {m.forwardFrom && <T size={13} style={{ color: C.accent, marginBottom: 2 }}>Переслано от {m.forwardFrom.displayName}</T>}
        {m.replyTo && <View style={s.reply}><T size={13} bold style={{ color: C.accent }}>{m.replyTo.senderName}</T><T size={13} dim numberOfLines={1}>{m.replyTo.text || 'Медиа'}</T></View>}
        {m.deleted ? <T dim style={{ fontStyle: 'italic' }}>Сообщение удалено</T>
          : m.type === 'secret' ? <SecretText m={m} peerId={peerId} />
          : (m.type === 'image' || sticker || m.type === 'gif') && media?.url ? <Image source={{ uri: mediaUrl(sticker ? media.url : media.preview || media.url) }} style={sticker ? { width: 160, height: 160 } : { width: 240, height: 240, borderRadius: 14 }} contentFit={sticker ? 'contain' : 'cover'} />
          : m.type === 'system' ? <T dim>{m.text}</T>
          : null}
        {!!m.text && m.type !== 'system' && !m.deleted && <T>{m.text}</T>}
        <View style={s.meta}>
          {m.edited && !m.deleted && <T size={11} dim>изменено · </T>}
          <T size={11} dim>{hm(m.createdAt)}</T>
        </View>
        {m.reactions?.length > 0 && (
          <View style={s.reactions}>
            {m.reactions.map((r: any) => (
              <Press key={r.emoji} onPress={() => onReact(m, r.emoji)} style={[s.reaction, r.users?.includes(meId) && s.reactionMine]}>
                <T size={13}>{r.emoji} {r.count}</T>
              </Press>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
});

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = Number(id);
  const insets = useSafeAreaInsets();
  const me = useStore((st) => st.me);
  const chat = useStore((st) => st.chats.find((c) => c.id === chatId));
  const messages = useStore((st) => st.messages[chatId]);
  const hasMore = useStore((st) => st.hasMore[chatId]);
  const typingUntil = useStore((st) => st.typing[chatId] || 0);
  const { loadMessages, send, openChat, upsertMessage } = useStore.getState();
  const low = usePerf((p) => p.low);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [menu, setMenu] = useState<any>(null);
  const [secret, setSecret] = useState(false);
  const [canSecret, setCanSecret] = useState(false);
  const lastTyping = useRef(0);

  useEffect(() => { openChat(chatId); loadMessages(chatId).catch(() => {}); return () => openChat(null); }, [chatId]);
  useEffect(() => { if (chat?.type === 'private' && chat.peer && chat.peer.id !== me?.id) canEncryptTo(chat.peer.id).then(setCanSecret); }, [chat?.peer?.id]);

  // inverted list with centered date pills between days
  const items = useMemo(() => {
    const list = messages || [];
    const out: any[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      out.push({ k: `m${m.id}`, m });
      const prev = list[i - 1];
      if (!prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()) out.push({ k: `d${m.id}`, day: dayLabel(m.createdAt) });
    }
    return out;
  }, [messages]);

  const submit = async () => {
    const t = text.trim();
    if (!t || !chat) return;
    setText('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (edit) { const r = await api.patch(`/messages/${edit.id}`, { text: t }); upsertMessage(r.message); setEdit(null); }
      else { await send(chat, { text: t, replyTo: reply?.id, secret }); setReply(null); }
    } catch (e: any) { setText(t); alert(e.message); }
  };
  const react = async (m: any, emoji: string) => {
    setMenu(null);
    Haptics.selectionAsync();
    const r = await api(`/messages/${m.id}/react`, { body: { emoji } }).catch(() => null);
    if (r) upsertMessage(r.message);
  };
  const act = async (kind: string) => {
    const m = menu; setMenu(null);
    if (kind === 'reply') setReply(m);
    if (kind === 'edit') { setEdit(m); setText(m.text || ''); }
    if (kind === 'copy') Clipboard.setStringAsync(m.text || '');
    if (kind === 'forward') router.push({ pathname: '/forward', params: { messageId: String(m.id) } });
    if (kind === 'delete') { await api.del(`/messages/${m.id}`).catch((e) => alert(e.message)); }
  };

  if (!chat) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  const typing = typingUntil > Date.now();
  const status = typing ? 'печатает…' : chat.type === 'private' ? (chat.peer?.online ? 'в сети' : chat.peer?.lastSeen ? `был(а) ${chatTimeLong(chat.peer.lastSeen)}` : '') : `${chat.memberCount || ''} участников`;
  const canPost = chat.isMember !== false && (chat.type !== 'channel' || chat.role !== 'member');

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        inverted
        data={items}
        keyExtractor={(it) => it.k}
        renderItem={({ item }) => item.day
          ? <View style={s.dayWrap}><Glass radius={12} style={s.dayPill}><T size={13} bold>{item.day}</T></Glass></View>
          : <Bubble m={item.m} out={item.m.sender?.id === me?.id && chat.type !== 'channel'} peerId={chat.peer?.id} meId={me?.id} onLong={setMenu} onReact={react} />}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.top + 74, paddingHorizontal: 8 }}
        onEndReached={() => hasMore && loadMessages(chatId, true).catch(() => {})}
        onEndReachedThreshold={0.4}
        keyboardDismissMode="interactive"
        initialNumToRender={20}
        windowSize={11}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      />
      {/* floating glass header, like Telegram */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Press onPress={() => router.back()}><Glass radius={23} style={s.round}><T size={28} style={{ marginTop: -3 }}>‹</T></Glass></Press>
        <Press onPress={() => chat.peer && router.push(`/user/${chat.peer.id}`)} style={{ flex: 1 }} scale={0.97}>
          <Glass radius={23} style={s.titlePill}>
            <T bold numberOfLines={1} size={16}>{chat.title}</T>
            {!!status && <T dim size={12} style={typing ? { color: C.accent } : undefined}>{status}</T>}
          </Glass>
        </Press>
        <Press onPress={() => chat.peer && router.push(`/user/${chat.peer.id}`)}><Avatar uri={chat.avatar} name={chat.title} id={chat.peer?.id || chat.id} size={46} /></Press>
      </View>

      {canPost && (
        <View style={{ paddingHorizontal: 10, paddingBottom: Math.max(8, insets.bottom), paddingTop: 6 }}>
          {(reply || edit) && (
            <Animated.View entering={SlideInDown.springify().damping(20)} style={s.replyBar}>
              <T size={13} bold style={{ color: C.accent, flex: 1 }} numberOfLines={1}>{edit ? 'Редактирование' : `Ответ ${reply.sender?.displayName || ''}`}: <T size={13} dim>{(edit || reply).text}</T></T>
              <Press onPress={() => { setReply(null); setEdit(null); if (edit) setText(''); }}><T dim>✕</T></Press>
            </Animated.View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Glass radius={23} style={{ flex: 1, minHeight: 46, justifyContent: 'center' }}>
              <TextInput
                value={text}
                onChangeText={(v) => { setText(v); if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); sendTyping(chatId); } }}
                placeholder={secret ? '🔒 Зашифрованное сообщение' : 'Сообщение'}
                placeholderTextColor={C.text2}
                multiline
                style={s.input}
              />
            </Glass>
            {canSecret && <Press onPress={() => setSecret(!secret)} haptic><Glass radius={23} style={[s.round, secret && { backgroundColor: 'rgba(52,199,89,0.3)' }]}><T>🔒</T></Glass></Press>}
            <Press onPress={submit} haptic disabled={!text.trim()}><View style={[s.round, { backgroundColor: C.accent }]}><T bold size={20} style={{ color: '#fff' }}>{edit ? '✓' : '➤'}</T></View></Press>
          </View>
        </View>
      )}

      {/* long-press menu: quick reactions + actions over a blurred chat */}
      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)}>
          {low ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.75)' }]} /> : <BlurView tint="dark" intensity={45} style={StyleSheet.absoluteFill} />}
          {menu && (
            <View style={{ flex: 1, justifyContent: 'center', padding: 18, gap: 10 }}>
              <Animated.View entering={ZoomIn.springify().damping(16)}>
                <Glass radius={28} style={{ alignSelf: 'center' }}>
                  <View style={{ flexDirection: 'row', padding: 6, gap: 2 }}>
                    {REACTIONS.map((e, i) => (
                      <Animated.View key={e} entering={ZoomIn.delay(i * 25).springify()}>
                        <Press onPress={() => react(menu, e)} scale={1.25} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><T size={26}>{e}</T></Press>
                      </Animated.View>
                    ))}
                  </View>
                </Glass>
              </Animated.View>
              <Animated.View entering={FadeInDown.springify().damping(18)}>
                <View style={[s.bubble, menu.sender?.id === me?.id ? s.out : s.in, { alignSelf: menu.sender?.id === me?.id ? 'flex-end' : 'flex-start' }]}>
                  <T>{menu.type === 'secret' ? '🔒 Зашифрованное сообщение' : menu.text || 'Медиа'}</T>
                </View>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={{ alignSelf: menu.sender?.id === me?.id ? 'flex-end' : 'flex-start', width: 240 }}>
                <Glass radius={18}>
                  {[
                    ['reply', '↩  Ответить'],
                    menu.text && ['copy', '⧉  Копировать'],
                    !menu.deleted && menu.type !== 'secret' && ['forward', '↪  Переслать'],
                    menu.sender?.id === me?.id && !menu.deleted && menu.text && menu.type !== 'secret' && ['edit', '✎  Изменить'],
                    (menu.sender?.id === me?.id || chat.role === 'owner' || chat.role === 'admin') && !menu.deleted && ['delete', '🗑  Удалить'],
                  ].filter(Boolean).map((a: any, i: number) => (
                    <Press key={a[0]} onPress={() => act(a[0])} scale={0.98} style={[s.menuItem, i > 0 && s.menuSep]}>
                      <T style={a[0] === 'delete' ? { color: '#ff5a5f' } : undefined}>{a[1]}</T>
                    </Press>
                  ))}
                </Glass>
              </Animated.View>
            </View>
          )}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function chatTimeLong(ts: number) {
  const d = new Date(ts); const n = new Date();
  if (d.toDateString() === n.toDateString()) return `в ${hm(ts)}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingBottom: 8 },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  titlePill: { height: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  dayWrap: { alignItems: 'center', marginVertical: 10 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 4 },
  msgRow: { marginVertical: 2, maxWidth: '82%' },
  right: { alignSelf: 'flex-end' },
  left: { alignSelf: 'flex-start' },
  bubble: { borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  out: { backgroundColor: C.bubbleOut, borderBottomRightRadius: 6 },
  in: { backgroundColor: C.bubbleIn, borderBottomLeftRadius: 6 },
  sticker: { backgroundColor: 'transparent', padding: 0 },
  meta: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  reply: { borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 8, marginBottom: 4, backgroundColor: 'rgba(255,45,61,0.1)', borderRadius: 6, paddingVertical: 2 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reaction: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  reactionMine: { backgroundColor: C.accent },
  input: { color: C.text, fontSize: 17, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, maxHeight: 140 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, borderRadius: 14, backgroundColor: C.bg3 },
  menuItem: { paddingHorizontal: 16, paddingVertical: 13 },
  menuSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)' },
});
