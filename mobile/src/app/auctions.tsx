import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Gavel, Timer } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useFont, fontStyle } from '../lib/fonts';
import { fmtNum } from '../lib/util';
import { useNow, left } from '../lib/time';
import { C } from '../lib/theme';
import { Avatar, Btn, Glass, Press, Rise, Spark, T } from '../components/ui';
import { CollectibleArt } from '../components/GiftArt';
import { SheetHead, sheetStyle } from '../components/Sheets';

const W = Dimensions.get('window').width;
const title = (a: any) => (a.kind === 'gift' ? `${a.userGift.gift.name} #${fmtNum(a.userGift.collectible.number)}` : `@${a.username}`);

/** Auctions (web AuctionsView + AuctionDetails): list with live timers, details with bid history and bidding. */
export default function Auctions() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [open, setOpen] = useState<number | null>(id ? Number(id) : null);
  return open ? <Details id={open} onBack={() => (id ? router.back() : setOpen(null))} /> : <List onOpen={setOpen} />;
}

function List({ onOpen }: { onOpen: (id: number) => void }) {
  const [data, setData] = useState<any>(null);
  useFocusEffect(useCallback(() => { api('/auctions').then(setData).catch(() => setData({ auctions: [] })); }, []));
  const now = useNow();
  const cw = Math.floor((W - 32 - 10) / 2) - 0.5;
  return (
    <View style={sheetStyle}>
      <SheetHead title="Аукционы" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {!data ? <ActivityIndicator color={C.accent} style={{ padding: 40 }} /> : !data.auctions.length ? (
          <View style={{ alignItems: 'center', padding: 40, gap: 8 }}><Gavel size={34} color={C.text2} /><T dim>Аукционов пока нет</T><T size={13} dim center>Выставьте коллекционный подарок — кнопка «аукцион» в карточке подарка</T></View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {data.auctions.map((a: any, i: number) => {
              const ms = a.endsAt - now;
              return (
                <Rise key={a.id} delay={Math.min(i, 12) * 30} style={{ width: cw }}>
                  <Press scale={0.97} onPress={() => onOpen(a.id)} style={st.card}>
                    {a.kind === 'gift' ? <CollectibleArt col={a.userGift.collectible} style={{ height: 130 }} light /> : <View style={st.uname}><T w={800} size={18}>@{a.username}</T></View>}
                    <View style={[st.timer, ms < 300_000 && { backgroundColor: C.accent }]}><Timer size={11} color="#fff" /><T w={700} size={11} color="#fff">{left(ms)}</T></View>
                    <View style={{ padding: 10, gap: 2 }}>
                      <T w={700} size={13} numberOfLines={1}>{title(a)}</T>
                      <T size={11} dim numberOfLines={1}>{a.bids ? `${a.bids} ставок` : 'Ставок пока нет'}</T>
                      <View style={st.price}><T w={700} size={12} color={C.accent}>{a.bid ? 'Ставка ' : 'Старт '}</T><Spark amount={a.bid || a.startPrice} size={12} /></View>
                    </View>
                  </Press>
                </Rise>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Details({ id, onBack }: { id: number; onBack: () => void }) {
  const me = useStore((s) => s.me);
  const font = useFont((s) => s.id);
  const [a, setA] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useNow();
  const load = () => api(`/auctions/${id}`).then((r) => { setA(r.auction); setAmount((x) => (x && Number(x) >= r.auction.minNext ? x : String(r.auction.minNext))); }).catch(() => {});
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [id]);
  if (!a) return <View style={sheetStyle}><SheetHead title="Аукцион" onClose={onBack} /><ActivityIndicator color={C.accent} style={{ padding: 40 }} /></View>;
  const ms = a.endsAt - now;
  const active = a.status === 'active' && ms > 0;
  const bid = async () => {
    setBusy(true);
    try { setA((await api(`/auctions/${a.id}/bid`, { body: { amount: Number(amount) } })).auction); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={sheetStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetHead title="Аукцион" onClose={onBack} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, gap: 12 }} keyboardShouldPersistTaps="handled">
        {a.kind === 'gift' ? <CollectibleArt col={a.userGift.collectible} style={{ height: 220, borderRadius: 18 }} /> : <View style={[st.uname, { height: 130, borderRadius: 18 }]}><T w={800} size={24}>@{a.username}</T></View>}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T w={800} size={18} style={{ flex: 1 }}>{title(a)}</T>
          <View style={[st.timer, { position: 'relative', top: 0, left: 0 }, ms < 300_000 && active && { backgroundColor: C.accent }]}><Timer size={12} color="#fff" /><T w={700} size={12} color="#fff">{active ? left(ms) : a.status === 'sold' ? 'продан' : 'завершён'}</T></View>
        </View>
        <Glass radius={16} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View><T size={12} dim>{a.bid ? 'Текущая ставка' : 'Стартовая цена'}</T><Spark amount={a.bid || a.startPrice} size={20} /></View>
          {a.leader && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Avatar uri={a.leader.avatar} name={a.leader.displayName} id={a.leader.id} size={28} /><T size={13}>{a.leading ? 'Вы лидируете' : a.leader.displayName}</T></View>}
        </Glass>
        {active && !a.mine && !a.leading && (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ''))} keyboardType="number-pad" style={[st.input, fontStyle(font, 600, 16)]} />
            <Btn title="Ставка" icon={<Gavel size={16} color="#fff" />} disabled={busy || Number(amount) < a.minNext || (me?.balance || 0) < Number(amount)} onPress={bid} style={{ paddingHorizontal: 18 }} />
          </View>
        )}
        {active && !a.mine && <T size={12} dim>Минимальная ставка — {fmtNum(a.minNext)}. Сумма блокируется до конца; если вас перебьют, она сразу вернётся. Ставка в последние 2 минуты продлевает аукцион.</T>}
        {a.mine && active && !a.bids && <Btn secondary title="Отменить аукцион" color={C.danger} onPress={async () => { try { await api.del(`/auctions/${a.id}`); onBack(); } catch (e: any) { Alert.alert(e.message); } }} />}
        {a.history?.length > 0 && <T size={12} w={600} dim style={{ marginTop: 4 }}>СТАВКИ</T>}
        {a.history?.map((h: any, i: number) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar uri={h.user?.avatar} name={h.user?.displayName} id={h.user?.id} size={28} />
            <T size={14} style={{ flex: 1 }}>{h.user?.displayName}</T>
            <T size={12} dim>{new Date(h.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</T>
            <Spark amount={h.amount} size={13} />
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  uname: { height: 130, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  timer: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)' },
  price: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, backgroundColor: `rgba(${C.accentRgb},0.15)` },
  input: { flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 12, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
});
