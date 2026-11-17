import React, { useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { mediaUrl } from '../lib/config';
import { Glass } from '../components/ui';

const { width: W, height: H } = Dimensions.get('window');

/** Full-screen photo / video viewer: pinch-zoom photos, native video controls, swipe down to close. */
export default function MediaViewer() {
  const { url, kind } = useLocalSearchParams<{ url: string; kind: string }>();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);
  const close = () => router.back();
  const pan = Gesture.Pan().enabled(!zoomed).activeOffsetY([-12, 12]).onUpdate((e) => { y.value = e.translationY; })
    .onEnd((e) => { if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 900) { y.value = withTiming(Math.sign(e.translationY || 1) * H, { duration: 200 }); runOnJS(close)(); } else y.value = withSpring(0, { damping: 18 }); });
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: 1 - Math.min(Math.abs(y.value) / H, 0.3) * 0.5 }] }));
  const bg = useAnimatedStyle(() => ({ opacity: 1 - Math.min(Math.abs(y.value) / 400, 1) }));
  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, bg]} />
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ flex: 1 }, st]}>
          {kind === 'video' ? <Video url={url!} /> : (
            <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
              onScroll={(e) => setZoomed((e.nativeEvent.zoomScale || 1) > 1.01)} scrollEventThrottle={32} contentContainerStyle={{ width: W, height: H }}>
              <Pressable onPress={close} style={{ width: W, height: H }}>
                <Image source={{ uri: mediaUrl(url) }} style={{ width: W, height: H }} contentFit="contain" cachePolicy="memory-disk" transition={150} />
              </Pressable>
            </ScrollView>
          )}
        </Animated.View>
      </GestureDetector>
      <Pressable onPress={close} style={{ position: 'absolute', top: insets.top + 8, right: 14 }} hitSlop={10}>
        <Glass radius={20} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><X size={22} color="#fff" /></Glass>
      </Pressable>
    </View>
  );
}

function Video({ url }: { url: string }) {
  const player = useVideoPlayer(mediaUrl(url) || null, (p) => { p.loop = false; p.play(); });
  return <VideoView player={player} style={{ width: W, height: H }} contentFit="contain" nativeControls />;
}
