import React, { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Send } from 'lucide-react-native';
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
  const send = async () => {
    const t = text.trim(); if (!t) return;
    setText('');
    try { const r = await api(`/posts/${id}/comments`, { body: { text: t } }); setComments((c) => [...(c || []), r.comment]); setPost((p: any) => ({ ...p, comments: p.comments + 1 })); } catch { setText(t); }
  };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Page title="Комментарии">
        {post && <PostCard p={post} onChange={setPost} onRemove={() => router.back()} />}
        {comments && !comments.length && <T dim center size={13} style={{ padding: 20 }}>Комментариев пока нет</T>}
        {(comments || []).map((c, i) => (
          <Rise key={c.id} delay={Math.min(i, 10) * 30} style={st.comment}>
            <Avatar uri={c.author.avatar} name={c.author.displayName} id={c.author.id} size={32} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><StyledName user={c.author} size={13} />{c.author.premium && <PremiumStar size={12} />}<T size={11} dim>{ago(c.createdAt)}</T></View>
              <RichText text={c.text} />
            </View>
          </Rise>
        ))}
      </Page>
      <View style={[st.bar, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <TextInput value={text} onChangeText={setText} placeholder="Написать комментарий…" placeholderTextColor={C.text3} maxLength={1000} style={[st.input, fontStyle(font, 400, 15)]} />
        <Press onPress={send} disabled={!text.trim()} scale={0.9}><AccentFill radius={23} style={st.send}><Send size={20} color="#fff" /></AccentFill></Press>
      </View>
    </KeyboardAvoidingView>
  );
}
const st = StyleSheet.create({
  comment: { flexDirection: 'row', gap: 10, paddingVertical: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  input: { flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 16, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
  send: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
});
