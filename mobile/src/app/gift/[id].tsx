import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Crown, Ellipsis, Gem, Pin, Tag, X } from 'lucide-react-native';
import { api } from '../../lib/api';
import { useStore } from '../../lib/store';
import { fmtNum } from '../../lib/util';
import { C, webSpring } from '../../lib/theme';
import { Avatar, Glass, Press, Rise, Spark, T } from '../../components/ui';
import { CollectibleArt, GiftModel } from '../../components/GiftArt';

/** Gift details sheet — web `.gift-sheet`: collectible backdrop hero, model, title, actions, attribute table. */
export default function GiftSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useStore((s) => s.me?.id);
  const [ug, setUg] = useState<any>(null);
  useEffect(() => { api(`/user-gifts/${id}`).then((r) => setUg(r.userGift)).catch((e) => { Alert.alert(e.message); router.back(); }); }, [id]);
  const m = useSharedValue(0.3);
  useEffect(() => { if (ug) m.value = withSpring(1, webSpring); }, [!!ug]);
  const ms = useAnimatedStyle(() => ({ opacity: Math.min(1, m.value * 1.5), transform: [{ scale: m.value }, { translateY: (1 - m.value) * 30 }] }));
  if (!ug) return <View style={{ flex: 1, backgroundColor: C.bg2 }} />;
  const col = ug.collectible;
  const mine = ug.owner?.id === meId;
  const act = async (path: string, body: any) => { try { const r = await api(path, { body }); if (r.userGift) setUg(r.userGift); } catch (e: any) { Alert.alert(e.message); } };
  const transfer = () => Alert.prompt?.('Передать подарок', 'Юзернейм получателя', async (name) => {
    try { const r = await api(`/resolve/${encodeURIComponent((name || '').replace('@', ''))}`); if (!r.user) throw new Error('Пользователь не найден'); await api(`/user-gifts/${ug.id}/transfer`, { body: { toUserId: r.user.id } }); Alert.alert('Подарок передан'); router.back(); } catch (e: any) { Alert.alert(e.message); }
  });
  const supply = ug.gift?.supply;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg2 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={st.hero}>
        {col ? <CollectibleArt col={{ ...col, model: null }} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1d1d22' }]} />}
        <View style={st.top}>
          <Press onPress={() => router.back()} scale={0.9}><Glass radius={21} fill="rgba(255,255,255,0.18)" edge="rgba(255,255,255,0.3)" style={st.topBtn}><X size={20} color="#fff" /></Glass></Press>
          <View style={{ flex: 1 }} />
          <Glass radius={21} fill="rgba(255,255,255,0.18)" edge="rgba(255,255,255,0.3)" style={st.topBtn}><Ellipsis size={20} color="#fff" /></Glass>
        </View>
        <Animated.View style={[st.model, ms]}><GiftModel gift={ug.gift} model={col?.model} size={170} /></Animated.View>
        <Rise delay={120}><T w={800} size={25} color="#fff" center style={st.shadow}>{ug.gift.name}{col ? <T w={700} size={15.5} color="rgba(255,255,255,0.7)"> #{col.number}</T> : null}</T></Rise>
        <Rise delay={180} style={{ alignItems: 'center', marginTop: 8 }}>
          <View style={st.sub}><T w={600} size={13.5} color="#fff">{col ? 'Коллекционный подарок' : 'Подарок'}</T></View>
        </Rise>
        {mine && (
          <Rise delay={240} style={st.actions}>
            <Act icon={<Gem size={22} color="#fff" />} label="передать" onPress={transfer} />
            {col
              ? <Act icon={<Crown size={22} color="#fff" />} label={ug.worn ? 'снять' : 'надеть'} on={ug.worn} onPress={() => act(`/user-gifts/${ug.id}/wear`, { wear: !ug.worn })} />
              : <Act icon={<Pin size={22} color="#fff" />} label={ug.pinned ? 'открепить' : 'закрепить'} on={ug.pinned} onPress={() => act(`/user-gifts/${ug.id}/visibility`, { pinned: !ug.pinned })} />}
            <Act icon={<Tag size={22} color="#fff" />} label="продать" onPress={() => Alert.alert('Маркет', 'Продажа на маркете скоро появится в приложении.')} />
          </Rise>
        )}
      </View>
      <Rise delay={280} style={st.table}>
        {ug.owner && <TRow k="Владелец" v={<Press onPress={() => router.push(`/user/${ug.owner.id}`)} style={st.who}><Avatar uri={ug.owner.avatar} name={ug.owner.displayName} id={ug.owner.id} size={22} /><T w={600} color={C.accent} numberOfLines={1}>{ug.owner.displayName}</T></Press>} />}
        {col?.model && <TRow k="Модель" v={<View style={st.attr}><T w={500}>{col.model.name}</T><Chip>{col.model.chance}%</Chip></View>} />}
        {col?.symbol && <TRow k="Узор" v={<View style={st.attr}><T w={500}>{col.symbol.name}</T><Chip>{col.symbol.chance}%</Chip></View>} />}
        {col?.backdrop && <TRow k="Фон" v={<View style={st.attr}><View style={[st.dot, { backgroundColor: col.backdrop.center }]} /><T w={500}>{col.backdrop.name}</T><Chip>{col.backdrop.chance}%</Chip></View>} />}
        {col && <TRow k="Наличие" v={<T w={500}>{fmtNum(col.issued)}/{supply ? fmtNum(supply) : '∞'} выпущено</T>} />}
        {col?.estimate ? <TRow k="Ценность" v={<View style={st.attr}><T w={700} color={C.accent}>~</T><Spark amount={col.estimate} /></View>} /> : null}
        {!col && ug.gift?.price ? <TRow k="Цена" v={<Spark amount={ug.gift.price} />} /> : null}
        <View style={{ padding: 14 }}>
          <T size={14} style={{ lineHeight: 19 }}>
            Подарок{ug.sender ? <> от <T size={14} color={C.accent} onPress={() => router.push(`/user/${ug.sender.id}`)}>{ug.sender.displayName}</T></> : ''}{ug.owner ? <> для <T size={14} color={C.accent}>{ug.owner.displayName}</T></> : ''}, отправлен {new Date(ug.createdAt).toLocaleDateString('ru-RU')}.
          </T>
          {!!ug.message && <T size={14} style={{ marginTop: 6, fontStyle: 'italic' }}>«{ug.message}»</T>}
        </View>
      </Rise>
      {mine && (
        <T size={13} dim center style={{ marginTop: 4 }}>
          {ug.hidden ? 'Подарок скрыт из профиля. ' : 'Подарок виден в профиле. '}
          <T size={13} w={600} color={C.accent} onPress={() => act(`/user-gifts/${ug.id}/visibility`, { hidden: !ug.hidden })}>{ug.hidden ? 'Показать ›' : 'Скрыть ›'}</T>
        </T>
      )}
    </ScrollView>
  );
}
const Chip = ({ children }: { children: React.ReactNode }) => <View style={st.chip}><T size={11.5} w={600} dim>{children}</T></View>;
function Act({ icon, label, onPress, on }: any) {
  return (
    <Press onPress={onPress} scale={0.92} style={{ flex: 1 }}>
      <Glass radius={18} fill={on ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.16)'} edge="rgba(255,255,255,0.3)" hi="rgba(255,255,255,0.4)" style={st.act}>{icon}<T w={700} size={12.5} color="#fff">{label}</T></Glass>
    </Press>
  );
}
function TRow({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <View style={[st.trow, !last && { borderBottomWidth: 1, borderBottomColor: C.border }]}>
      <View style={st.tk}><T w={500}>{k}</T></View>
      <View style={st.tv}>{v}</View>
    </View>
  );
}
const st = StyleSheet.create({
  top: { flexDirection: 'row', marginBottom: 0 },
  topBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  attr: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  hero: { overflow: 'hidden', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16, alignItems: 'stretch' },
  model: { height: 170, alignItems: 'center', justifyContent: 'center', marginTop: -24, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 16 } },
  shadow: { textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 12, marginTop: 4 },
  sub: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  act: { alignItems: 'center', justifyContent: 'center', gap: 6, height: 62 },
  table: { margin: 14, borderWidth: 1, borderColor: C.border, borderRadius: 18, overflow: 'hidden', backgroundColor: C.bg },
  trow: { flexDirection: 'row' },
  tk: { width: '36%', paddingVertical: 12, paddingHorizontal: 14, borderRightWidth: 1, borderRightColor: C.border },
  tv: { flex: 1, paddingVertical: 12, paddingHorizontal: 14, justifyContent: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
