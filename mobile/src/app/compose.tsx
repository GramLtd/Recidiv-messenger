import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../lib/api';
import { GlassButton, T } from '../components/ui';
import { C } from '../lib/theme';

/** New post or edit an own post (sheet). */
export default function Compose() {
  const { editId, text: initial } = useLocalSearchParams<{ editId?: string; text?: string }>();
  const [text, setText] = useState(initial || '');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      if (editId) await api.patch(`/posts/${editId}`, { text });
      else await api('/posts', { body: { text } });
      router.back();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  return (
    <View style={{ flex: 1, padding: 18, gap: 14 }}>
      <T bold size={20}>{editId ? 'Изменить пост' : 'Новый пост'}</T>
      <TextInput value={text} onChangeText={setText} placeholder="Что нового? Добавьте #теги" placeholderTextColor={C.text2} multiline autoFocus maxLength={2000}
        style={{ minHeight: 140, color: C.text, fontSize: 18, backgroundColor: C.bg3, borderRadius: 18, padding: 14, textAlignVertical: 'top' }} />
      <GlassButton title={busy ? '…' : editId ? 'Сохранить' : 'Опубликовать'} accent onPress={submit} />
    </View>
  );
}
