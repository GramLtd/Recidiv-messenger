import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check, Heart, ListMusic, Moon, Music2, Pause, Play, Plus, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, X } from 'lucide-react-native';
import { api } from '../lib/api';
import { mediaUrl } from '../lib/config';
import { useStore } from '../lib/store';
import { usePlayer, fmtTime, coverColors, Track } from '../lib/player';
import { C } from '../lib/theme';
import { Glass, Press, Rise, T } from './ui';

/** Web .cover: artwork or a gradient with a note. */
export function Cover({ track, size = 48, radius = 12, big }: { track?: Track | null; size?: number | '100%'; radius?: number; big?: boolean }) {
  const box = size === '100%' ? { width: '100%' as const, height: '100%' as const } : { width: size, height: size };
  const icon = big ? 84 : (size as number) * 0.45;
  return (
    <View style={[box, { borderRadius: radius, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.06)' }]}>
      {track?.cover
        ? <Image source={{ uri: mediaUrl(track.cover) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" />
        : (
          <LinearGradient colors={coverColors(track)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <Music2 size={icon} strokeWidth={big ? 1.6 : 2} color="rgba(255,255,255,0.85)" />
          </LinearGradient>
        )}
    </View>
  );
}

/** Web .eq: three bouncing accent bars over the active cover. */
function Bar({ on, delay }: { on: boolean; delay: number }) {
  const h = useSharedValue(0.3);
  useEffect(() => {
    h.value = on
      ? withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 450, easing: Easing.inOut(Easing.sin) }), withTiming(0.3, { duration: 450, easing: Easing.inOut(Easing.sin) })), -1))
      : withTiming(0.3, { duration: 200 });
  }, [on]);
  const st = useAnimatedStyle(() => ({ height: `${h.value * 100}%` as any }));
  return <Animated.View style={[{ width: 4, borderRadius: 2, backgroundColor: C.accent }, st]} />;
}
export function Eq({ on }: { on: boolean }) {
  return (
    <View style={st.eq}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 20 }}>
        <Bar on={on} delay={0} /><Bar on={on} delay={200} /><Bar on={on} delay={400} />
      </View>
    </View>
  );
}

const SOURCE_LABEL: Record<string, string> = { deezer: 'превью 30с', archive: 'Archive', jamendo: 'Jamendo' };

export function TrackRow({ track, onPress, onDelete, extra, index = 0 }: { track: Track; onPress: () => void; onDelete?: () => void; extra?: React.ReactNode; index?: number }) {
  const cur = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const active = cur?.url === track.url;
  return (
    <Rise delay={Math.min(index, 15) * 25} duration={300} dy={8}>
      <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { backgroundColor: 'rgba(255,255,255,0.06)', transform: [{ scale: 0.97 }] }]}>
        <View>
          <Cover track={track} size={48} />
          {active && <Eq on={playing} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={700} numberOfLines={1} color={active ? C.accent : C.text}>{track.title}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {!!track.source && SOURCE_LABEL[track.source] && <View style={st.src}><T size={10} w={700} color={C.text2}>{SOURCE_LABEL[track.source]}</T></View>}
            <T size={13} dim numberOfLines={1} style={{ flexShrink: 1 }}>{track.artist || 'Неизвестный исполнитель'}</T>
          </View>
        </View>
        <T size={13} dim>{fmtTime(track.duration || 0)}</T>
        {extra}
        {onDelete && <Press scale={0.85} onPress={onDelete} style={st.iconBtn}><Trash2 size={17} color={C.text2} /></Press>}
      </Pressable>
    </Rise>
  );
}

/** Seek bar: drag anywhere on it, the position is applied on release (web input[type=range]). */
function Progress() {
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const seek = usePlayer((s) => s.seek);
  const [drag, setDrag] = useState<number | null>(null);
  const w = useRef(1);
  const v = drag ?? time;
  const pct = duration ? Math.min(1, v / duration) : 0;
  const at = (x: number) => Math.max(0, Math.min(1, x / w.current)) * (duration || 0);
  return (
    <View style={{ marginTop: 18, marginBottom: 4 }}>
      <View
        onLayout={(e) => { w.current = e.nativeEvent.layout.width || 1; }}
        style={{ height: 28, justifyContent: 'center' }}
        onStartShouldSetResponder={() => !!duration}
        onMoveShouldSetResponder={() => !!duration}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => setDrag(at(e.nativeEvent.locationX))}
        onResponderMove={(e) => setDrag(at(e.nativeEvent.locationX))}
        onResponderRelease={() => { if (drag != null) seek(drag); setDrag(null); }}
        onResponderTerminate={() => setDrag(null)}
      >
        <View pointerEvents="none" style={st.track}>
          <View style={[st.fill, { width: `${pct * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[st.thumb, { left: `${pct * 100}%` }, drag != null && { transform: [{ scale: 1.35 }] }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={12.5} dim>{fmtTime(v)}</T>
        <T size={12.5} dim>{fmtTime(duration)}</T>
      </View>
    </View>
  );
}

/** Heart = "this track plays in my profile". */
function ProfileHeart({ track }: { track: Track }) {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const on = !!track.id && me?.profileTrackId === track.id;
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const toggle = async () => {
    if (!track.id) return Alert.alert('Сначала добавьте трек в «Мою музыку»');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    s.value = withSequence(withTiming(0.7, { duration: 90 }), withSpring(1, { damping: 7, stiffness: 260 }));
    try {
      await api('/me/profile-track', { body: { trackId: on ? null : track.id } });
      setMe({ profileTrackId: on ? null : track.id });
    } catch (e: any) { Alert.alert(e.message); }
  };
  return (
    <Pressable onPress={toggle} hitSlop={10} style={{ padding: 4 }}>
      <Animated.View style={anim}><Heart size={26} fill={on ? C.accent : 'none'} color={on ? C.accent : C.text2} /></Animated.View>
    </Pressable>
  );
}

const SLEEP_OPTIONS = [0, 15, 30, 45, 60, 90];

/** Web NowPlaying: big cover (grows while playing), title + heart, seek bar, controls, queue and sleep timer. */
export function NowPlaying() {
  const track = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const sleepAt = usePlayer((s) => s.sleepAt);
  usePlayer((s) => s.order); usePlayer((s) => s.pos);
  const p = usePlayer.getState();
  const [showQueue, setShowQueue] = useState(true);
  const [sleepMenu, setSleepMenu] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sleepAt) return undefined;
    const t = setInterval(() => tick((x) => x + 1), 15_000);
    return () => clearInterval(t);
  }, [sleepAt]);
  const sc = useSharedValue(playing ? 1 : 0.94);
  useEffect(() => { sc.value = withTiming(playing ? 1 : 0.94, { duration: 500, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }); }, [playing]);
  const coverSt = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  if (!track) return null;
  const upNext = p.upNext();
  const sleepLeft = sleepAt ? Math.max(1, Math.round((sleepAt - Date.now()) / 60_000)) : 0;
  const tap = (fn: () => void) => () => { Haptics.selectionAsync(); fn(); };
  return (
    <Rise duration={350}>
      <Animated.View style={[st.npCover, coverSt]}>
        <Cover track={track} size="100%" radius={22} big />
      </Animated.View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 18, gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={800} size={22} numberOfLines={1}>{track.title}</T>
          <T dim numberOfLines={1} style={{ marginTop: 2 }}>{track.artist || 'Неизвестный исполнитель'}</T>
        </View>
        <ProfileHeart key={String(track.id)} track={track} />
      </View>
      <Progress />
      <View style={st.controls}>
        <Press scale={0.85} onPress={tap(p.toggleShuffle)} style={st.ctl}><Shuffle size={22} color={shuffle ? C.accent : C.text} /></Press>
        <Press scale={0.85} onPress={tap(p.prev)} style={st.ctl}><SkipBack size={28} color={C.text} fill={C.text} /></Press>
        <Press scale={0.9} onPress={tap(p.toggle)} style={st.playBtn}>
          {playing ? <Pause size={34} color="#000" fill="#000" /> : <Play size={34} color="#000" fill="#000" style={{ marginLeft: 4 }} />}
        </Press>
        <Press scale={0.85} onPress={tap(() => p.next())} style={st.ctl}><SkipForward size={28} color={C.text} fill={C.text} /></Press>
        <Press scale={0.85} onPress={tap(p.cycleRepeat)} style={st.ctl}>{repeat === 'one' ? <Repeat1 size={22} color={C.accent} /> : <Repeat size={22} color={repeat === 'all' ? C.accent : C.text} />}</Press>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, zIndex: 5 }}>
        <Press scale={0.97} onPress={() => setShowQueue(!showQueue)} style={[st.glassBtn, showQueue && st.glassOn]}>
          <ListMusic size={18} color={C.text} />
          <View><T size={11} dim>Очередь</T><T w={600} size={14}>{upNext.length} {upNext.length === 1 ? 'трек' : 'треков'}</T></View>
        </Press>
        <View style={{ flex: 1 }}>
          <Press scale={0.97} onPress={() => setSleepMenu(!sleepMenu)} style={[st.glassBtn, !!sleepAt && st.glassOn]}>
            <Moon size={18} color={C.text} />
            <View><T size={11} dim>Таймер сна</T><T w={600} size={14}>{sleepAt ? `${sleepLeft} мин` : 'Выкл'}</T></View>
          </Press>
          {sleepMenu && (
            <Glass radius={16} fill="rgba(30,30,30,0.92)" style={st.menu}>
              {SLEEP_OPTIONS.map((m) => (
                <Pressable key={m} onPress={() => { p.setSleep(m); setSleepMenu(false); }} style={({ pressed }) => [st.menuItem, pressed && { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                  <T>{m ? `${m} минут` : 'Выключить'}</T>
                </Pressable>
              ))}
            </Glass>
          )}
        </View>
      </View>
      {showQueue && upNext.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T w={700}>Далее в очереди</T>
            <T size={13} dim>{shuffle ? 'перемешано' : 'по порядку'}</T>
          </View>
          <View style={{ marginTop: 6 }}>
            {upNext.slice(0, 30).map((t, i) => <TrackRow key={`${t.url}-${i}`} track={t} index={i} onPress={() => p.jumpTo(t)} />)}
          </View>
        </View>
      )}
    </Rise>
  );
}

/** Web .mini-player: glass bar above the tab bar while something plays. */
export function MiniPlayer({ onOpen }: { onOpen: () => void }) {
  const track = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const duration = usePlayer((s) => s.duration);
  const { toggle, next, stop } = usePlayer.getState();
  const y = useSharedValue(track ? 0 : 1);
  useEffect(() => { y.value = withTiming(track ? 0 : 1, { duration: 300, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }); }, [!!track]);
  const anim = useAnimatedStyle(() => ({ opacity: 1 - y.value, transform: [{ translateY: y.value * 24 }] }));
  if (!track) return null;
  return (
    <Animated.View style={[st.miniShadow, anim]}>
      <Pressable onPress={onOpen}>
        <Glass radius={18} intensity={40} fill="rgba(30,30,30,0.78)" edge="rgba(255,255,255,0.1)" shadow={false} style={st.mini}>
          <Cover track={track} size={40} radius={10} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={700} size={13.5} numberOfLines={1}>{track.title}</T>
            <T size={11.5} dim numberOfLines={1}>{track.artist || 'Неизвестный исполнитель'}</T>
          </View>
          <Press scale={0.8} onPress={toggle} style={st.miniBtn}>{playing ? <Pause size={22} color={C.text} fill={C.text} /> : <Play size={22} color={C.text} fill={C.text} />}</Press>
          <Press scale={0.8} onPress={() => next()} style={st.miniBtn}><SkipForward size={20} color={C.text} fill={C.text} /></Press>
          <Press scale={0.8} onPress={stop} style={st.miniBtn}><X size={18} color={C.text} /></Press>
          <View style={[st.miniProgress, { width: `${duration ? Math.min(100, (time / duration) * 100) : 0}%` }]} />
        </Glass>
      </Pressable>
    </Animated.View>
  );
}

/** Audio file inside a chat bubble (web AudioMessage): plays through the shared player, "+" saves it to My music. */
export function AudioMsg({ media, out }: { media: any; out?: boolean }) {
  const cur = usePlayer((s) => s.current);
  const playing = usePlayer((s) => s.playing);
  const time = usePlayer((s) => s.time);
  const playTrack = usePlayer((s) => s.playTrack);
  const [saved, setSaved] = useState(false);
  const track: Track = { url: media.url, title: media.title || media.name || 'Аудио', artist: media.artist || '', duration: media.duration || 0 };
  const active = cur?.url === track.url;
  const save = async () => {
    try {
      await api('/music', { body: { url: media.url, title: track.title, artist: track.artist, duration: track.duration, fileName: media.name } });
      setSaved(true);
    } catch (e: any) { Alert.alert(e.message); }
  };
  const fg = out ? '#fff' : C.text;
  return (
    <Pressable onPress={() => playTrack(track)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 220, paddingVertical: 2 }}>
      <View style={[st.audioPlay, { backgroundColor: out ? '#fff' : C.accent }]}>
        {active && playing ? <Pause size={20} color={out ? C.bubbleOut : '#fff'} fill={out ? C.bubbleOut : '#fff'} /> : <Play size={20} color={out ? C.bubbleOut : '#fff'} fill={out ? C.bubbleOut : '#fff'} style={{ marginLeft: 2 }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={700} numberOfLines={1} color={fg}>{track.title}</T>
        <T size={12.5} numberOfLines={1} color={out ? 'rgba(255,255,255,0.7)' : C.text2}>
          {active ? `${fmtTime(time)} / ${fmtTime(track.duration || 0)}` : `${track.artist ? `${track.artist} · ` : ''}${fmtTime(track.duration || 0)}`}
        </T>
      </View>
      <Press scale={0.85} onPress={save} style={st.iconBtn}>{saved ? <Check size={18} color={fg} /> : <Plus size={20} color={fg} />}</Press>
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 14 },
  eq: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 },
  src: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.1)' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#fff', borderRadius: 2 },
  thumb: { position: 'absolute', width: 14, height: 14, marginLeft: -7, borderRadius: 7, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
  npCover: { width: '100%', aspectRatio: 1.45, borderRadius: 22, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 25, shadowOffset: { width: 0, height: 20 } },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 16 },
  ctl: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  playBtn: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  glassBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 54, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  glassOn: { backgroundColor: `rgba(${C.accentRgb},0.16)`, borderColor: `rgba(${C.accentRgb},0.35)` },
  menu: { position: 'absolute', bottom: 60, right: 0, minWidth: 170, paddingVertical: 4 },
  menuItem: { paddingHorizontal: 14, paddingVertical: 11 },
  miniShadow: { borderRadius: 18, shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 8 } },
  mini: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingLeft: 8, paddingRight: 6 },
  miniBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  miniProgress: { position: 'absolute', left: 0, bottom: 0, height: 2, backgroundColor: C.accent },
  audioPlay: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
