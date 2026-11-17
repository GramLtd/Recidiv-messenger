import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { api } from '../../lib/api';
import { mediaUrl } from '../../lib/config';
import { Avatar, T } from '../../components/ui';
import { ago } from '../../components/Post';

const W = Dimensions.get('window').width;
/** Story viewer: progress bars, tap right/left to move, swipe down / ✕ to close. */
export default function StoryViewer() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<any[]>([]);
  const [u, setU] = useState(0);
  const [i, setI] = useState(0);
  const p = useSharedValue(0);
  useEffect(() => { api('/stories').then((r) => { const f = r.feed || []; setFeed(f); setU(Math.max(0, f.findIndex((x: any) => String(x.user.id) === userId))); }).catch(() => router.back()); }, []);
  const cur = feed[u];
  const story = cur?.stories[i];
  const next = () => { if (!cur) return; if (i < cur.stories.length - 1) setI(i + 1); else if (u < feed.length - 1) { setU(u + 1); setI(0); } else router.back(); };
  const prev = () => { if (i > 0) setI(i - 1); else if (u > 0) { setU(u - 1); setI(0); } };
  const nextRef = useRef(next); nextRef.current = next;
  const goNext = () => nextRef.current();
  useEffect(() => {
    if (!story) return;
    api(`/stories/${story.id}/view`, { body: {} }).catch(() => {});
    p.value = 0;
    p.value = withTiming(1, { duration: 6000, easing: Easing.linear }, (done) => { if (done) runOnJS(goNext)(); });
    return () => cancelAnimation(p);
  }, [story?.id]);
  const bar = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  if (!cur || !story) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {story.mediaType === 'text'
        ? <View style={[StyleSheet.absoluteFill, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', padding: 30 }]}><T w={800} size={24} color="#fff" center>{story.media}</T></View>
        : <Image source={{ uri: mediaUrl(story.media) }} style={StyleSheet.absoluteFill} contentFit="contain" />}
      <View style={{ flexDirection: 'row', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Pressable style={{ flex: 1 }} onPress={prev} />
        <Pressable style={{ flex: 2 }} onPress={next} />
      </View>
      <View style={[st.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <View style={st.bars}>
          {cur.stories.map((s: any, k: number) => (
            <View key={s.id} style={st.barBg}>{k < i ? <View style={[st.barFill, { width: '100%' }]} /> : k === i ? <Animated.View style={[st.barFill, bar]} /> : null}</View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Avatar uri={cur.user.avatar} name={cur.user.displayName} id={cur.user.id} size={36} />
          <View style={{ flex: 1 }}><T w={700} color="#fff">{cur.user.displayName}</T><T size={12} color="rgba(255,255,255,0.7)">{ago(story.createdAt)}</T></View>
          <Pressable onPress={() => router.back()} hitSlop={10}><X size={26} color="#fff" /></Pressable>
        </View>
      </View>
      {!!story.caption && <View style={[st.caption, { bottom: insets.bottom + 24 }]}><T color="#fff" center>{story.caption}</T></View>}
    </View>
  );
}
const st = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 10 },
  bars: { flexDirection: 'row', gap: 4 },
  barBg: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#fff' },
  caption: { position: 'absolute', left: 20, right: 20, padding: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)' },
});
