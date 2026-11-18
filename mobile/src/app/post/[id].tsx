import React, { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send, Heart, X } from 'lucide-react-native';
import { api } from '../../lib/api';
import { useFont, fontStyle } from '../../lib/fonts';
import { C } from '../../lib/theme';
import { AccentFill, Avatar, PremiumStar, Press, Rise, T } from '../../components/ui';
import { PostCard, RichText, ago } from '../../components/Post';
import { Page } from '../../components/Settings';
import { StyledName } from '../../components/Profile';

/** Post with comments (web PostModal). */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const font = useFont((s) => s.id);
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    api(`/posts/${id}`).then((r) => setPost(r.post)).catch(() => router.back());
    api(`/posts/${id}/comments`).then((r) => setComments(r.comments)).catch(() => setComments([]));
  }, [id]);
  const [replyTo, setReplyTo] = useState<any>(null);
  const send = async () => {
    const t = text.trim(); if (!t) return;
    setText('');
    try { const r = await api(`/posts/${id}/comments`, { body: { text: t, replyTo: replyTo?.id } }); setComments((c) => [...(c || []), r.comment]); setPost((p: any) => ({ ...p, comments: p.comments + 1 })); setReplyTo(null); } catch (e: any) { setText(t); Alert.alert(e.message); }
  };
  const likeComment = async (c: any) => {
    setComments((x) => (x || []).map((y) => (y.id === c.id ? { ...y, liked: !y.liked, likes: y.likes + (y.liked ? -1 : 1) } : y)));
    try { const r = await api(`/comments/${c.id}/like`, { body: {} }); setComments((x) => (x || []).map((y) => (y.id === c.id ? r.comment : y))); } catch {}
  };
  // replies grouped under their root comment (like the web)
  const thread = (() => {
    if (!comments) return [];
    const byId = new Map(comments.map((c) => [c.id, c]));
    const rootOf = (c: any) => { let cur = c; const seen = new Set(); while (cur.replyTo && byId.has(cur.replyTo) && !seen.has(cur.id)) { seen.add(cur.id); cur = byId.get(cur.replyTo); } return cur.id; };
    const tops = comments.filter((c) => !c.replyTo || !byId.has(c.replyTo));
    return tops.flatMap((t) => [{ ...t, depth: 0 }, ...comments.filter((c) => c.id !== t.id && c.replyTo && rootOf(c) === t.id).map((c) => ({ ...c, depth: 1 }))]);
  })();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page title="Комментарии">
        {post && <PostCard p={post} onChange={setPost} onRemove={() => router.back()} />}
        {comments && !comments.length && <T dim center size={13} style={{ padding: 20 }}>Комментариев пока нет</T>}
        {thread.map((c: any, i: number) => (
          <Rise key={c.id} delay={Math.min(i, 10) * 30} style={[st.comment, c.depth && { marginLeft: 40, paddingTop: 2 }]}>
            <Avatar uri={c.author.avatar} name={c.author.displayName} id={c.author.id} size={c.depth ? 26 : 32} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><StyledName user={c.author} size={13} />{c.author.premium && <PremiumStar size={12} />}<T size={11} dim>{ago(c.createdAt)}</T></View>
              {!!c.depth && !!c.replyToName && <T size={11} dim>↳ {c.replyToName}</T>}
              <RichText text={c.text} />
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                <Press scale={0.85} onPress={() => likeComment(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Heart size={13} color={c.liked ? C.accent : C.text2} fill={c.liked ? C.accent : 'none'} />{c.likes > 0 && <T size={12} color={c.liked ? C.accent : C.text2}>{c.likes}</T>}
                </Press>
                <T size={12} w={600} dim onPress={() => setReplyTo(c)}>Ответить</T>
              </View>
            </View>
          </Rise>
        ))}
      </Page>
      {replyTo && <View style={st.replyChip}><T size={13} dim style={{ flex: 1 }}>Ответ для <T size={13} w={700}>{replyTo.author.displayName}</T></T><Press onPress={() => setReplyTo(null)}><X size={16} color={C.text2} /></Press></View>}
      <View style={[st.bar, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <TextInput value={text} onChangeText={setText} placeholder="Написать комментарий…" placeholderTextColor={C.text3} maxLength={1000} style={[st.input, fontStyle(font, 400, 15)]} />
        <Press onPress={send} disabled={!text.trim()} scale={0.9}><AccentFill radius={23} style={st.send}><Send size={20} color="#fff" /></AccentFill></Press>
      </View>
    </KeyboardAvoidingView>
  );
}
const st = StyleSheet.create({
  comment: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  replyChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
  send: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
});
