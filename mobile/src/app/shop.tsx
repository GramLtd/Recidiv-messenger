import React, { useEffect, useState } from 'react';
import { Alert, Dimensions, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Tag } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useCached } from '../lib/useCached';
import { useFont, fontStyle } from '../lib/fonts';
import { fmtNum } from '../lib/util';
import { playSend } from '../lib/sound';
import { C } from '../lib/theme';
import { Avatar, Btn, Glass, Press, Rise, Spark, T } from '../components/ui';
import { GiftModel } from '../components/GiftArt';
import { Switch } from '../components/Settings';
import { SheetHead, UserPicker, sheetStyle } from '../components/Sheets';

const W = Dimensions.get('window').width;

/** Web GiftShopModal: catalogue → gift → recipient / message / anonymity → buy. */
export default function Shop() {
  const params = useLocalSearchParams<{ toUserId?: string; toName?: string; toAvatar?: string }>();
  const me = useStore((s) => s.me);
  const font = useFont((s) => s.id);
  const [data, , reload] = useCached<any>('/gifts');
  const [picked, setPicked] = useState<any>(null);
  const [to, setTo] = useState<any>(params.toUserId ? { id: Number(params.toUserId), displayName: params.toName, avatar: params.toAvatar || null } : null);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  if (choosing) {
    return (
      <View style={sheetStyle}>
        <SheetHead title="Кому отправить?" onClose={() => setChoosing(false)} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <UserPicker header={(
            <Pressable onPress={() => { setTo(null); setChoosing(false); }} style={st.self}>
              <Avatar uri={me.avatar} name={me.displayName} id={me.id} size={44} /><T w={700}>Себе</T>
            </Pressable>
          )} onPick={(u) => { setTo(u); setChoosing(false); }} />
        </ScrollView>
      </View>
    );
  }

  if (picked) {
    const recipient = to || me;
    const self = recipient.id === me.id;
    const buy = async () => {
      setBusy(true);
      try {
        await api(`/gifts/${picked.id}/buy`, { body: { toUserId: recipient.id, message, anonymous: anon } });
        playSend();
        reload();
        Alert.alert(self ? 'Подарок добавлен в профиль 🎁' : `Подарок отправлен ${recipient.displayName} 🎁`);
        router.back();
      } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); }
    };
    const short = me.balance < picked.price;
    return (
      <KeyboardAvoidingView style={sheetStyle} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SheetHead title="Отправить подарок" onClose={() => setPicked(null)} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
          <Rise><Glass radius={20} style={st.hero}>
            <GiftModel gift={picked} size={170} />
            <T w={700} size={17}>{picked.name}</T>
            <Supply g={picked} />
          </Glass></Rise>
          <Press scale={0.98} onPress={() => setChoosing(true)} style={st.row}>
            <Avatar uri={recipient.avatar} name={recipient.displayName} id={recipient.id} size={40} />
            <View style={{ flex: 1 }}><T size={13} dim>Получатель</T><T w={700}>{self ? 'Себе' : recipient.displayName}</T></View>
            <T size={13} color={C.accent}>Изменить</T>
          </Press>
          <TextInput value={message} onChangeText={setMessage} maxLength={255} multiline placeholder="Сообщение (необязательно)" placeholderTextColor={C.text3}
            style={[st.input, fontStyle(font, 400, 15)]} />
          {!self && (
            <View style={[st.row, { backgroundColor: 'transparent', paddingHorizontal: 4 }]}>
              <View style={{ flex: 1 }}><T>Анонимно</T><T size={13} dim>Получатель не увидит отправителя</T></View>
              <Switch on={anon} onChange={setAnon} />
            </View>
          )}
          <View style={st.note}>
            <T size={13} dim center>{picked.upgradable ? 'Получатель сможет улучшить подарок до коллекционного за ' : 'Получатель сможет конвертировать подарок в '}</T>
            <Spark amount={picked.upgradable ? picked.upgradePrice : picked.convertValue} size={13} />
          </View>
        </ScrollView>
        <View style={st.foot}>
          <Btn height={50} disabled={busy || picked.remaining === 0 || short} title={short ? 'Недостаточно средств' : `Отправить за ✦ ${fmtNum(picked.price)}`} onPress={buy} />
        </View>
      </KeyboardAvoidingView>
    );
  }

  const gifts: any[] = data?.gifts || [];
  const cw = Math.floor((W - 32 - 20) / 3) - 0.5;
  return (
    <View style={sheetStyle}>
      <SheetHead title="Подарки" right={<Glass radius={16} style={st.chip}><Spark amount={me.balance} size={13} /></Glass>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        {to && <T size={13} dim style={{ marginBottom: 10 }}>Подарок для <T size={13} w={700}>{to.displayName}</T></T>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <T size={12.5} dim style={{ flex: 1 }}>Коллекционные подарки — их можно улучшить, продать и передать</T>
          <Press onPress={() => router.push({ pathname: '/market', params: { kind: 'gift' } })}><Glass radius={16} style={st.chip}><Tag size={14} color={C.text} /><T size={13}>Маркет</T></Glass></Press>
        </View>
        <View style={st.grid}>
          {gifts.map((g, i) => (
            <Rise key={g.id} delay={Math.min(i, 20) * 30} style={{ width: cw }}>
              <Press scale={0.95} onPress={() => (g.remaining === 0 ? router.push({ pathname: '/market', params: { kind: 'gift', giftId: String(g.id) } }) : setPicked(g))}
                style={[st.card, g.remaining === 0 && { opacity: 0.5 }]}>
                {g.limited && <View style={st.ribbon}><T w={800} size={9} color="#fff" center>{g.remaining === 0 ? 'SOLD' : 'LIMITED'}</T></View>}
                <View style={{ height: cw * 0.85, alignItems: 'center', justifyContent: 'center' }}><GiftModel gift={g} size={cw * 0.7} /></View>
                <T w={700} size={12.3} numberOfLines={1} center>{g.name}</T>
                <View style={st.price}><Spark amount={g.price} size={12} /></View>
                {g.limited && <T size={10.5} dim center style={{ marginTop: 2 }}>{g.remaining ? `${fmtNum(g.remaining)} из ${fmtNum(g.supply)}` : 'распродано'}</T>}
              </Press>
            </Rise>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Supply({ g }: { g: any }) {
  if (!g.limited) return null;
  const pct = Math.min(100, (g.sold / g.supply) * 100);
  return (
    <View style={{ width: '100%' }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.bg3, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: C.accent }} /></View>
      <T size={11} dim center style={{ marginTop: 3 }}>{g.remaining ? `осталось ${fmtNum(g.remaining)} из ${fmtNum(g.supply)}` : 'распродано'}</T>
    </View>
  );
}

const st = StyleSheet.create({
  self: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6 },
  hero: { alignItems: 'center', gap: 8, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: C.bg3 },
  input: { minHeight: 70, borderRadius: 14, padding: 12, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, color: C.text, textAlignVertical: 'top' },
  note: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10 },
  foot: { padding: 16, paddingBottom: 30 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingBottom: 10, alignItems: 'center', gap: 4 },
  price: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: `rgba(${C.accentRgb},0.2)` },
  ribbon: { position: 'absolute', top: 10, right: -28, width: 100, paddingVertical: 2, backgroundColor: C.accent, transform: [{ rotate: '45deg' }], zIndex: 3 },
});
