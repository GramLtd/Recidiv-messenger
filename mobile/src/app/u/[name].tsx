import React, { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../lib/api';
import { C } from '../../lib/theme';

/** @username links → profile (or the channel/group). */
export default function ResolveName() {
  const { name } = useLocalSearchParams<{ name: string }>();
  useEffect(() => {
    api(`/resolve/${encodeURIComponent(name!)}`).then((r) => {
      if (r.user) router.replace(`/user/${r.user.id}`);
      else if (r.chat) router.replace(`/chat/${r.chat.id}`);
      else router.back();
    }).catch(() => router.back());
  }, [name]);
  return <View style={{ flex: 1, backgroundColor: C.bg }} />;
}
