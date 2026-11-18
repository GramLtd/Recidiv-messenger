import React, { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ArrowUpCircle, Crown, Ellipsis, Eye, EyeOff, Gavel, Gem, Hammer, Pin, Repeat, Tag, X } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../../lib/api';
import { cache } from '../../lib/db';
import { useStore } from '../../lib/store';
import { fmtNum } from '../../lib/util';
import { C, webSpring } from '../../lib/theme';
import { Avatar, Btn, Glass, Press, Rise, Spark, T } from '../../components/ui';
import { CollectibleArt, GiftModel } from '../../components/GiftArt';
import { UpgradeReveal } from '../../components/UpgradeReveal';

/** Gift details sheet — web `.gift-sheet`: collectible backdrop hero, model, title, actions, attribute table. */
export default function GiftSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useStore((s) => s.me?.id);
  const [ug, setUgRaw] = useState<any>(() => cache.get<any>(`api:/user-gifts/${id}`)?.userGift || null);
  const setUg = (v: any) => { setUgRaw(v); cache.set(`api:/user-gifts/${id}`, { userGift: v }); };
  useEffect(() => { api(`/user-gifts/${id}`).then((r) => setUg(r.userGift)).catch((e) => { if (!ug) { Alert.alert(e.message); router.back(); } }); }, [id]);
  // refresh after returning from «продать» / «передать»
  useFocusEffect(useCallback(() => { api(`/user-gifts/${id}`).then((r) => setUg(r.userGift)).catch(() => {}); }, [id]));
  const [attrs, setAttrs] = useState<any>(null);
  const [upg, setUpg] = useState<Promise<any> | null>(null);
  useEffect(() => {
    if (ug && !ug.collectible && ug.gift?.upgradable && !attrs) api(`/gifts/${ug.gift.id}/attributes`).then(setAttrs).catch(() => {});
  }, [ug?.gift?.id, !!ug?.collectible]);
  const m = useSharedValue(0.3);
  useEffect(() => { if (ug) m.value = withSpring(1, webSpring); }, [!!ug]);
  const ms = useAnimatedStyle(() => ({ opacity: Math.min(1, m.value * 1.5), transform: [{ scale: m.value }, { translateY: (1 - m.value) * 30 }] }));
  if (!ug) return <View style={{ flex: 1, backgroundColor: C.bg2 }} />;
  const col = ug.collectible;
  const mine = ug.owner?.id === meId;
  const act = async (path: string, body: any) => { try { const r = await api(path, { body }); if (r.userGift) setUg(r.userGift); } catch (e: any) { Alert.alert(e.message); } };
  const transfer = () => router.push({ pathname: '/gift-transfer', params: { id: String(ug.id), title: `${ug.gift.name}${col ? ` #${col.number}` : ''}` } });
  const unlist = async () => { try { await api.del(`/market/listings/${ug.listing.id}`); setUg({ ...ug, listing: null }); } catch (e: any) { Alert.alert(e.message); } };
  const upgrade = async () => {
    Alert.alert('Улучшить подарок?', `Подарок станет коллекционным за ${fmtNum(ug.gift.upgradePrice)} ✦: уникальный номер, случайные модель, фон и узор.`, [{ text: 'Отмена' }, { text: 'Улучшить', onPress: async () => {
      if (attrs?.models?.length && attrs.backdrops?.length && attrs.symbols?.length) { setUpg(api(`/user-gifts/${ug.id}/upgrade`, { body: {} })); return; }
      try { const r = await api(`/user-gifts/${ug.id}/upgrade`, { body: {} }); m.value = 0.3; setUg(r.userGift); m.value = withSpring(1, webSpring); } catch (e: any) { Alert.alert(e.message); }
    } }]);
  };
  // craft: 5 regular copies of this gift → 1 collectible, free (shown with the upgrade reveal)
  const craft = async () => {
    try {
      const { gifts } = await api(`/users/${meId}/gifts`);
      const same = gifts.filter((g: any) => !g.collectible && g.gift.id === ug.gift.id && !g.listing);
      const ids = [ug.id, ...same.map((g: any) => g.id).filter((x: number) => x !== ug.id)].slice(0, 5);
      if (ids.length < 5) { Alert.alert('Не хватает подарков', `Для крафта нужно 5 одинаковых обычных «${ug.gift.name}» — у вас ${same.length}.`); return; }
      Alert.alert('Крафт', `5 подарков «${ug.gift.name}» превратятся в 1 коллекционный — бесплатно.`, [{ text: 'Отмена' }, { text: 'Скрафтить', onPress: async () => {
        const req = api('/craft', { body: { userGiftIds: ids } });
        if (attrs?.models?.length) setUpg(req);
        else { try { const r = await req; setUg(r.userGift); } catch (e: any) { Alert.alert(e.message); } }
      } }]);
    } catch (e: any) { Alert.alert(e.message); }
  };
  const convert = () => Alert.alert('Конвертировать подарок?', `Вы получите ${fmtNum(ug.gift.convertValue)} ✦. Подарок исчезнет из профиля.`, [{ text: 'Отмена' }, { text: 'Конвертировать', style: 'destructive', onPress: async () => {
    try { await api(`/user-gifts/${ug.id}/convert`, { body: {} }); Alert.alert('Подарок конвертирован'); router.back(); } catch (e: any) { Alert.alert(e.message); }
  } }]);
  const menu = () => {
    const items: [string, () => void][] = [];
    if (col) items.push(['Скопировать ссылку', () => Clipboard.setStringAsync(`https://recidivist.lol/gift/${col.slug || ug.id}`)]);
    if (mine) items.push([ug.pinned ? 'Открепить' : 'Закрепить в профиле', () => act(`/user-gifts/${ug.id}/visibility`, { pinned: !ug.pinned })]);
    if (mine) items.push([ug.hidden ? 'Показать в профиле' : 'Скрыть из профиля', () => act(`/user-gifts/${ug.id}/visibility`, { hidden: !ug.hidden })]);
    if (!items.length) return;
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...items.map((i) => i[0]), 'Отмена'], cancelButtonIndex: items.length }, (i) => items[i]?.[1]());
    else Alert.alert(ug.gift.name, '', [...items.map(([t, f]) => ({ text: t, onPress: f })), { text: 'Отмена', style: 'cancel' as const }]);
  };
  const sub = ug.listing ? `В продаже за ${fmtNum(ug.listing.price)} ✦` : col ? 'Коллекционный подарок' : ug.gift.limited ? `Лимитированный · тираж ${fmtNum(ug.gift.supply)}` : 'Подарок';
  const supply = ug.gift?.supply;
  return (
    <>
    {upg && attrs && (
      <UpgradeReveal attrs={attrs} gift={ug.gift} request={upg}
        onDone={(r) => { setUpg(null); if (r) { m.value = 0.6; setUg(r); m.value = withSpring(1, webSpring); } }}
        onError={(e) => { setUpg(null); Alert.alert(e.message); }} />
    )}
    <ScrollView contentInsetAdjustmentBehavior="never" style={{ flex: 1, backgroundColor: C.bg2 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={st.hero}>
        {col ? <CollectibleArt col={{ ...col, model: null }} style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1d1d22' }]} />}
        <View style={st.top}>
          <Press onPress={() => router.back()} scale={0.9}><Glass radius={21} fill="rgba(255,255,255,0.18)" edge="rgba(255,255,255,0.3)" style={st.topBtn}><X size={20} color="#fff" /></Glass></Press>
          <View style={{ flex: 1 }} />
          {(col || mine) && <Press onPress={menu} scale={0.9}><Glass radius={21} fill="rgba(255,255,255,0.18)" edge="rgba(255,255,255,0.3)" style={st.topBtn}><Ellipsis size={20} color="#fff" /></Glass></Press>}
        </View>
        <Animated.View style={[st.model, ms]}><GiftModel gift={ug.gift} model={col?.model} size={170} /></Animated.View>
        <Rise delay={120}><T w={800} size={25} color="#fff" center style={st.shadow}>{ug.gift.name}{col ? <T w={700} size={15.5} color="rgba(255,255,255,0.7)"> #{col.number}</T> : null}</T></Rise>
        <Rise delay={180} style={{ alignItems: 'center', marginTop: 8 }}>
          <View style={st.sub}><T w={600} size={13.5} color="#fff">{sub}</T></View>
        </Rise>
        {mine && col && (
          <Rise delay={240} style={st.actions}>
            <Act icon={<Gem size={22} color="#fff" />} label="передать" disabled={!!ug.listing} onPress={transfer} />
            <Act icon={<Crown size={22} color="#fff" />} label={ug.worn ? 'снять' : 'носить'} on={ug.worn} onPress={async () => { await act(`/user-gifts/${ug.id}/wear`, { wear: !ug.worn }); api('/auth/me').then((r) => useStore.getState().setMe(r.user)).catch(() => {}); }} />
            {ug.listing
              ? <Act icon={<Tag size={22} color="#fff" />} label="не продавать" onPress={unlist} />
              : <Act icon={<Tag size={22} color="#fff" />} label="продать" onPress={() => router.push({ pathname: '/sell', params: { userGiftId: String(ug.id) } })} />}
            {!ug.listing && <Act icon={<Gavel size={22} color="#fff" />} label="аукцион" onPress={() => router.push({ pathname: '/auction-new', params: { userGiftId: String(ug.id) } })} />}
          </Rise>
        )}
        {mine && !col && (
          <Rise delay={240} style={st.actions}>
            <Act icon={<ArrowUpCircle size={22} color="#fff" />} label="улучшить" disabled={!ug.gift.upgradable} onPress={upgrade} />
            {ug.gift.upgradable && <Act icon={<Hammer size={22} color="#fff" />} label="крафт" onPress={craft} />}
            <Act icon={<Repeat size={22} color="#fff" />} label="в ✦" onPress={convert} />
            <Act icon={ug.hidden ? <Eye size={22} color="#fff" /> : <EyeOff size={22} color="#fff" />} label={ug.hidden ? 'показать' : 'скрыть'} onPress={() => act(`/user-gifts/${ug.id}/visibility`, { hidden: !ug.hidden })} />
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
      <View style={{ paddingHorizontal: 14, paddingTop: 14, gap: 10 }}>
        {!mine && ug.listing && <Btn height={50} title={`Купить на маркете за ✦ ${fmtNum(ug.listing.price)}`} onPress={() => router.push({ pathname: '/market', params: { kind: 'gift', q: String(col?.number || '') } })} />}
        <Btn height={50} title="OK" onPress={() => router.back()} />
      </View>
    </ScrollView>
    </>
  );
}
const Chip = ({ children }: { children: React.ReactNode }) => <View style={st.chip}><T size={11.5} w={600} dim>{children}</T></View>;
function Act({ icon, label, onPress, on, disabled }: any) {
  return (
    <Press onPress={onPress} scale={0.92} disabled={disabled} style={{ flex: 1 }}>
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
