import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AtSign, Gift, History, Tag, Gavel } from 'lucide-react-native';
import { api } from '../lib/api';
import { cache } from '../lib/db';
import { useStore } from '../lib/store';
import { useFont, fontStyle } from '../lib/fonts';
import { fmtNum } from '../lib/util';
import { C } from '../lib/theme';
import { AccentFill, Avatar, Btn, Glass, Press, Radial, Rise, Spark, T } from '../components/ui';
import { CollectibleArt } from '../components/GiftArt';
import { SearchBox, SheetHead, sheetStyle } from '../components/Sheets';

const W = Dimensions.get('window').width;
const SORTS: [string, string][] = [['new', 'Сначала новые'], ['price_asc', 'Дешевле'], ['price_desc', 'Дороже'], ['number', 'По номеру']];

function UsernameArt({ name, h = 130, size = 17 }: { name: string; h?: number; size?: number }) {
  return (
    <View style={{ height: h, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Radial inner={`rgba(${C.accentRgb},0.6)`} outer="#000" cx="30%" cy="20%" stop={0.8} style={StyleSheet.absoluteFill} />
      <T w={800} size={size} color="#fff">@{name}</T>
    </View>
  );
}
const Chip = ({ on, onPress, children }: any) => (
  <Press scale={0.92} onPress={onPress}>
    {on ? <AccentFill radius={16} style={st.chip}>{children}</AccentFill> : <Glass radius={16} style={st.chip}>{children}</Glass>}
  </Press>
);

/** Web MarketModal: all lots / mine / history, search, sort, collections; lot details with buy / reprice / unlist. */
export default function Market() {
  const p = useLocalSearchParams<{ kind?: string; giftId?: string; q?: string }>();
  const me = useStore((s) => s.me);
  const font = useFont((s) => s.id);
  const [kind, setKind] = useState(p.kind || '');
  const [sort, setSort] = useState('new');
  const [q, setQ] = useState(p.q || '');
  const [giftId, setGiftId] = useState<number | null>(p.giftId ? Number(p.giftId) : null);
  const [view, setView] = useState<'all' | 'mine' | 'history'>('all');
  const [data, setData] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);
  const [tick, setTick] = useState(0);
  const [price, setPrice] = useState('');
  const [shown, setShown] = useState(20);
  useEffect(() => { setShown(20); }, [data]);
  const url = view === 'history' ? '/market/history' : `/market?kind=${kind}&sort=${sort}&q=${encodeURIComponent(q)}${giftId ? `&giftId=${giftId}` : ''}${view === 'mine' ? '&mine=1' : ''}`;
  useEffect(() => {
    setData(cache.get(`api:${url}`) || null);
    const t = setTimeout(() => api(url).then((d) => { setData(d); cache.set(`api:${url}`, d); }).catch(() => setData({ listings: [] })), 200);
    return () => clearTimeout(t);
  }, [url, tick]);
  if (!me) return null;
  const changed = () => { setSel(null); setTick((x) => x + 1); };
  const run = async (fn: () => Promise<any>, ok: string) => { try { await fn(); Alert.alert(ok); changed(); } catch (e: any) { Alert.alert(e.message); } };
  const title = (l: any) => (l.kind === 'gift' ? `${l.userGift.gift.name} #${fmtNum(l.userGift.collectible.number)}` : `@${l.username}`);

  if (sel) {
    const l = sel;
    const short = me.balance < l.price;
    return (
      <View style={sheetStyle}>
        <SheetHead title="Лот" onClose={() => setSel(null)} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Rise>
            {l.kind === 'gift'
              ? <Press scale={0.98} onPress={() => router.push({ pathname: '/gift/[id]', params: { id: String(l.userGift.id) } })}><CollectibleArt col={l.userGift.collectible} style={{ height: 240, borderRadius: 16 }} /></Press>
              : <View style={{ borderRadius: 16, overflow: 'hidden' }}><UsernameArt name={l.username} h={180} size={24} /></View>}
          </Rise>
          <T w={700} size={18}>{title(l)}</T>
          {l.kind === 'gift' && (
            <View style={st.table}>
              {[['Модель', l.userGift.collectible.model?.name], ['Фон', l.userGift.collectible.backdrop?.name], ['Узор', `${l.userGift.collectible.symbol?.emoji || ''} ${l.userGift.collectible.symbol?.name || ''}`]].map(([k, v], i) => (
                <View key={k} style={[st.trow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}><T dim style={{ width: 90 }}>{k}</T><T w={500}>{v}</T></View>
              ))}
            </View>
          )}
          {l.kind === 'username' && <T size={13} dim>Коллекционный юзернейм. После покупки он перейдёт в ваш аккаунт, и вы сможете сделать его основным.</T>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar uri={l.seller.avatar} name={l.seller.displayName} id={l.seller.id} size={32} />
            <T size={13} style={{ flex: 1 }}>Продавец: <T size={13} w={700}>{l.seller.displayName}</T></T>
          </View>
          {l.mine ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput keyboardType="number-pad" value={price || String(l.price)} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} style={[st.input, { flex: 1 }, fontStyle(font, 700, 16)]} />
                <Btn secondary title="Изменить цену" onPress={() => run(() => api.patch(`/market/listings/${l.id}`, { price: Number(price || l.price) }), 'Цена обновлена')} />
              </View>
              <Btn color="#fff" title="Снять с продажи" onPress={() => run(() => api.del(`/market/listings/${l.id}`), 'Лот снят')} />
            </>
          ) : (
            <Btn height={50} disabled={short} title={short ? `Не хватает ✦ ${fmtNum(l.price - me.balance)}` : `Купить за ✦ ${fmtNum(l.price)}`}
              onPress={() => Alert.alert(`Купить ${title(l)} за ${fmtNum(l.price)} ✦?`, '', [{ text: 'Отмена' }, { text: 'Купить', onPress: () => run(() => api(`/market/listings/${l.id}/buy`, { body: { expectedPrice: l.price } }), 'Покупка совершена 🎉') }])} />
          )}
        </ScrollView>
      </View>
    );
  }

  const cw = Math.floor((W - 32 - 12) / 2) - 0.5;
  return (
    <View style={sheetStyle}>
      <SheetHead title="Маркет" right={<Glass radius={16} style={st.chip}><Spark amount={me.balance} size={13} /></Glass>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" scrollEventThrottle={200}
        onScroll={(e) => { const n = e.nativeEvent; if (n.contentOffset.y + n.layoutMeasurement.height > n.contentSize.height - 800) setShown((v) => (v < (data?.listings?.length || 0) ? v + 20 : v)); }}>
        <Glass radius={16} style={st.tabs} shadow={false}>
          <Press scale={0.96} onPress={() => router.push('/auctions')} style={st.tab}><Gavel size={14} color={C.text2} /><T w={700} size={13} color={C.text2}>Аукционы</T></Press>
          {([['all', 'Все лоты', null], ['mine', 'Мои', Tag], ['history', 'История', History]] as const).map(([k, l, I]) => (
            <Press key={k} scale={0.96} onPress={() => setView(k)} style={[st.tab, view === k && st.tabOn]}>
              {I && <I size={14} color={view === k ? C.text : C.text2} />}<T w={600} size={13.5} color={view === k ? C.text : C.text2}>{l}</T>
            </Press>
          ))}
        </Glass>
        {view !== 'history' && (
          <>
            <SearchBox value={q} onChange={setQ} placeholder="Название, @username или номер" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
              {SORTS.map(([k, l]) => <Chip key={k} on={sort === k} onPress={() => setSort(k)}><T size={13} color={sort === k ? '#fff' : C.text}>{l}</T></Chip>)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 12 }}>
              <Chip on={!kind && !giftId} onPress={() => { setKind(''); setGiftId(null); }}><T size={13} color={!kind && !giftId ? '#fff' : C.text}>Все</T></Chip>
              <Chip on={kind === 'gift' && !giftId} onPress={() => { setKind('gift'); setGiftId(null); }}><Gift size={14} color={kind === 'gift' && !giftId ? '#fff' : C.text} /><T size={13} color={kind === 'gift' && !giftId ? '#fff' : C.text}>Подарки</T></Chip>
              <Chip on={kind === 'username'} onPress={() => { setKind('username'); setGiftId(null); }}><AtSign size={14} color={kind === 'username' ? '#fff' : C.text} /><T size={13} color={kind === 'username' ? '#fff' : C.text}>Юзернеймы</T></Chip>
              {(data?.collections || []).map((c: any) => (
                <Chip key={c.id} on={giftId === c.id} onPress={() => { setKind('gift'); setGiftId(c.id); }}><T size={13} color={giftId === c.id ? '#fff' : C.text}>{c.emoji} {c.name} · от {fmtNum(c.floor)}</T></Chip>
              ))}
            </ScrollView>
          </>
        )}
        {view === 'mine' && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Btn secondary height={36} title="Выставить подарок" icon={<Gift size={15} color={C.text} />} onPress={() => router.push('/profile')} style={{ flex: 1 }} />
            <Btn secondary height={36} title="Выставить юзернейм" icon={<AtSign size={15} color={C.text} />} onPress={() => router.push('/settings/usernames')} style={{ flex: 1 }} />
          </View>
        )}
        {!data ? null : !data.listings.length ? (
          <View style={{ padding: 40, alignItems: 'center', gap: 6 }}><T dim>Лотов нет</T><T size={13} dim center>Улучшите подарок до коллекционного и выставьте его на продажу</T></View>
        ) : view === 'history' ? data.listings.slice(0, shown).map((l: any, i: number) => (
          <Rise key={l.id} delay={Math.min(i, 12) * 25} style={st.tx}>
            {l.kind === 'gift' ? <CollectibleArt col={l.userGift.collectible} style={{ width: 44, height: 44, borderRadius: 10 }} pattern={false} /> : <AtSign size={28} color={C.accent} />}
            <View style={{ flex: 1 }}><T w={700} size={13.5}>{title(l)}</T><T size={11} dim>{l.mine ? `Продано ${l.buyer?.displayName || ''}` : `Куплено у ${l.seller.displayName}`} · {new Date(l.closedAt).toLocaleString('ru-RU')}</T></View>
            <T w={700} color={l.mine ? C.green : C.text}>{l.mine ? '+' : '−'}{fmtNum(l.price)}</T>
          </Rise>
        )) : (
          <View style={st.grid}>
            {data.listings.slice(0, shown).map((l: any, i: number) => (
              <Rise key={l.id} delay={(i % 20) * 30} style={{ width: cw }}>
                <Press scale={0.97} onPress={() => { setPrice(''); setSel(l); }} style={st.card}>
                  {l.kind === 'gift' ? <CollectibleArt col={l.userGift.collectible} style={{ height: 140 }} light /> : <UsernameArt name={l.username} />}
                  <View style={st.body}>
                    <T w={700} size={13} numberOfLines={1}>{title(l)}</T>
                    {l.kind === 'gift' && <T size={11} dim numberOfLines={1}>{l.userGift.collectible.model?.name} · {l.userGift.collectible.backdrop?.name}</T>}
                    <AccentFill radius={14} style={st.priceBtn}><T w={700} size={12.5} color="#fff">{l.mine ? 'Ваш лот · ' : ''}✦ {fmtNum(l.price)}</T></AccentFill>
                  </View>
                </Press>
              </Rise>
            ))}
          </View>
        )}
        {data?.feePercent !== undefined && view !== 'history' && <T size={11} dim center style={{ marginTop: 14 }}>Комиссия маркета — {data.feePercent}% с продавца</T>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32 },
  tabs: { flexDirection: 'row', padding: 4, marginBottom: 12 },
  tab: { flex: 1, height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12 },
  tabOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { borderRadius: 16, overflow: 'hidden', backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border },
  body: { padding: 10, paddingBottom: 12, gap: 6 },
  priceBtn: { height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  table: { borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden' },
  trow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12 },
  input: { height: 44, borderRadius: 14, paddingHorizontal: 14, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text },
});
