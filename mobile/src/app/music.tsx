import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ArrowLeft, Check, Mic, Music2, Play, Plus, Search, Shuffle, X } from 'lucide-react-native';
import { api, postFile, upload } from '../lib/api';
import { useCached } from '../lib/useCached';
import { useFont, fontStyle } from '../lib/fonts';
import { usePlayer, titleFromFile, coverColors, Track } from '../lib/player';
import { C } from '../lib/theme';
import { AccentFill, Btn, Press, Rise, T } from '../components/ui';
import { NowPlaying, TrackRow } from '../components/Music';
import { LinearGradient } from 'expo-linear-gradient';

/** Web MusicPage: now playing on top, «Моя музыка» / «Поиск» tabs, upload, search over open sources, song recognition. */
export default function MusicScreen() {
  const insets = useSafeAreaInsets();
  const font = useFont((s) => s.id);
  const current = usePlayer((s) => s.current);
  const playQueue = usePlayer((s) => s.playQueue);
  const [data, setData] = useCached<any>('/music');
  const tracks: Track[] | null = data ? data.tracks || [] : null;
  const [mode, setMode] = useState<'library' | 'search'>('library');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const scroll = useRef<any>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: true }); }, [current?.url]);

  const setTracks = (fn: (t: Track[]) => Track[]) => {
    setData({ tracks: fn(tracks || []) });
  };

  const add = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.length) return;
    const added: Track[] = [];
    for (let i = 0; i < r.assets.length; i++) {
      const a = r.assets[i];
      setBusy(`Загрузка ${i + 1} из ${r.assets.length}…`);
      try {
        const up = await upload(a.uri, a.name || `track-${Date.now()}.mp3`, a.mimeType || 'audio/mpeg');
        const { track } = await api('/music', { body: { url: up.url, fileName: a.name, ...titleFromFile(a.name) } });
        added.push(track);
      } catch (e: any) { Alert.alert(e.message); }
    }
    setBusy(null);
    if (added.length) { setTracks((t) => [...added.reverse(), ...t]); }
  };
  const del = (t: Track) => Alert.alert(`Удалить «${t.title}»?`, undefined, [
    { text: 'Отмена', style: 'cancel' },
    { text: 'Удалить', style: 'destructive', onPress: async () => { try { await api.del(`/music/${t.id}`); setTracks((x) => x.filter((y) => y.id !== t.id)); } catch (e: any) { Alert.alert(e.message); } } },
  ]);

  const ql = q.trim().toLowerCase();
  const list = (tracks || []).filter((t) => !ql || t.title?.toLowerCase().includes(ql) || t.artist?.toLowerCase().includes(ql));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.head, { paddingTop: insets.top + 6 }]}>
        <Press scale={0.85} onPress={() => router.back()} style={{ width: 36, height: 40, justifyContent: 'center' }}><ArrowLeft size={24} color={C.text2} /></Press>
        <T w={800} size={18.75} style={{ flex: 1 }}>Музыка</T>
        <Press scale={0.85} onPress={add} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Plus size={24} color={C.text} /></Press>
      </View>
      <ScrollView ref={scroll} contentInsetAdjustmentBehavior="never" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 40 }}>
        {busy && <View style={st.busy}><ActivityIndicator color={C.accent} size="small" /><T size={13} dim>{busy}</T></View>}
        {current && <NowPlaying />}
        <View style={[st.tabs, { marginTop: current ? 22 : 4 }]}>
          {(['library', 'search'] as const).map((m) => (
            <Press key={m} scale={0.96} onPress={() => setMode(m)} style={[st.tab, mode === m && st.tabOn]}>
              {m === 'search' && <Search size={14} color={mode === m ? C.text : C.text2} />}
              <T w={700} size={14} color={mode === m ? C.text : C.text2}>{m === 'library' ? 'Моя музыка' : 'Поиск'}</T>
            </Press>
          ))}
        </View>
        {mode === 'search' ? <MusicSearch onSaved={(t) => setTracks((x) => [t, ...x])} /> : (
          <>
            {!current && tracks && !tracks.length && (
              <Rise style={st.empty}>
                <LinearGradient colors={coverColors({ url: '', title: 'r' })} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.emptyCover}><Music2 size={52} color="#fff" /></LinearGradient>
                <T w={700} size={17}>Ваша музыка</T>
                <T size={13} dim center>Загружайте свои треки (mp3, m4a, flac…) и слушайте их прямо в Recidivist.{'\n'}Названия берутся из имени файла «Исполнитель - Трек».</T>
                <Btn title="Загрузить треки" icon={<Plus size={18} color="#fff" />} onPress={add} style={{ alignSelf: 'stretch' }} />
              </Rise>
            )}
            {!!tracks?.length && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 8 }}>
                  <T w={700} style={{ flex: 1 }}>Мои треки · {tracks.length}</T>
                  <Press scale={0.94} onPress={() => playQueue(list, 0)} style={st.smBtn}><Play size={15} color={C.text} fill={C.text} /><T w={600} size={13.5}>Слушать</T></Press>
                  <Press scale={0.94} onPress={() => { usePlayer.setState({ shuffle: true }); playQueue(list, Math.floor(Math.random() * list.length)); }} style={st.smBtn}><Shuffle size={15} color={C.text} /></Press>
                </View>
                <View style={st.search}>
                  <Search size={18} color={C.text2} />
                  <TextInput value={q} onChangeText={setQ} placeholder="Поиск по трекам" placeholderTextColor={C.text2} style={[{ flex: 1, color: C.text, height: 42 }, fontStyle(font, 400, 15)]} />
                  {!!q && <Press scale={0.85} onPress={() => setQ('')}><X size={18} color={C.text2} /></Press>}
                </View>
                {list.map((t, i) => <TrackRow key={t.id ?? t.url} track={t} index={i} onPress={() => playQueue(list, i)} onDelete={() => del(t)} />)}
              </>
            )}
            {tracks === null && <ActivityIndicator color={C.accent} style={{ padding: 30 }} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const SOURCES_NOTE = 'Ищем по открытым источникам: Internet Archive и Jamendo (полные треки под свободными лицензиями) и Deezer (30-секундные превью). Кнопка с микрофоном узнаёт песню, которая играет рядом.';

function Dot({ delay }: { delay: number }) {
  const v = useSharedValue(0.3);
  useEffect(() => { setTimeout(() => { v.value = withRepeat(withTiming(1, { duration: 500, easing: Easing.inOut(Easing.sin) }), -1, true); }, delay); }, []);
  const s = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scaleY: 0.5 + v.value * 0.8 }] }));
  return <Animated.View style={[{ width: 4, height: 14, borderRadius: 2, backgroundColor: C.accent }, s]} />;
}

function MusicSearch({ onSaved }: { onSaved: (t: Track) => void }) {
  const font = useFont((s) => s.id);
  const playQueue = usePlayer((s) => s.playQueue);
  const [q, setQ] = useState('');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  useEffect(() => {
    if (q.trim().length < 2) { setData(null); return undefined; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api(`/music/search?q=${encodeURIComponent(q.trim())}`).then((r) => alive && setData(r)).catch((e) => alive && Alert.alert(e.message)).finally(() => alive && setLoading(false));
    }, 450);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const recognize = async () => {
    if (listening) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return Alert.alert('Нет доступа к микрофону');
    setListening(true);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      await new Promise((r) => setTimeout(r, 8000));
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
      if (!recorder.uri) throw new Error('Не удалось записать звук');
      const d = await postFile('/music/recognize', recorder.uri, 'sample.m4a', 'audio/mp4');
      if (!d.match) Alert.alert('Не удалось узнать трек 😕');
      else { Alert.alert(`Это ${d.match.artist} — ${d.match.title}`); setQ(`${d.match.artist} ${d.match.title}`); }
    } catch (e: any) { Alert.alert(e.message); } finally { setListening(false); }
  };

  const save = async (t: any) => {
    try {
      const { track } = await api('/music', { body: { url: t.url, title: t.title, artist: t.artist, duration: t.duration, cover: t.cover } });
      setSaved((x) => ({ ...x, [t.id]: true }));
      onSaved(track);
    } catch (e: any) { Alert.alert(e.message); }
  };

  const results: any[] = data?.results || [];
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[st.search, { flex: 1 }]}>
          <Search size={18} color={C.text2} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Исполнитель или название трека" placeholderTextColor={C.text2} style={[{ flex: 1, color: C.text, height: 42 }, fontStyle(font, 400, 15)]} />
          {!!q && <Press scale={0.85} onPress={() => setQ('')}><X size={18} color={C.text2} /></Press>}
        </View>
        <Press scale={0.9} onPress={recognize}>
          {listening ? <AccentFill radius={21} style={st.shazam}><Mic size={22} color="#fff" /></AccentFill> : <View style={[st.shazam, st.shazamOff]}><Mic size={22} color={C.text} /></View>}
        </Press>
      </View>
      {listening && <View style={st.listening}><Dot delay={0} /><Dot delay={150} /><Dot delay={300} /><T size={13} dim style={{ flex: 1 }}>Слушаю… поднесите телефон к источнику звука</T></View>}
      {loading && <ActivityIndicator color={C.accent} style={{ padding: 24 }} />}
      {!loading && data && !results.length && <T size={13} dim center style={{ padding: 24 }}>Ничего не нашли</T>}
      {!loading && results.map((t, i) => (
        <TrackRow key={`${t.id}${i}`} track={t} index={i} onPress={() => playQueue(results, i)}
          extra={<Press scale={0.85} onPress={() => !saved[t.id] && save(t)} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>{saved[t.id] ? <Check size={18} color={C.accent} /> : <Plus size={20} color={C.text} />}</Press>} />
      ))}
      {!q && <T size={13} dim style={{ paddingVertical: 18, paddingHorizontal: 4, lineHeight: 19 }}>{SOURCES_NOTE}</T>}
      {data?.sources && <T size={11} dim center style={{ marginTop: 10 }}>{data.sources.filter((x: any) => x.enabled).map((x: any) => `${x.name}${x.ok ? '' : ' (недоступен)'}`).join(' · ')}</T>}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 12 },
  tab: { flex: 1, height: 36, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabOn: { backgroundColor: 'rgba(255,255,255,0.12)' },
  smBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, backgroundColor: C.bg3, paddingHorizontal: 14, marginBottom: 8 },
  shazam: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  shazamOff: { borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  listening: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 12 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 30, paddingHorizontal: 10 },
  emptyCover: { width: 120, height: 120, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
