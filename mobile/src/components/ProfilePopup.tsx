import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AtSign, Copy, Link2, Phone, Store, X } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { usePerf } from '../lib/perf';
import { fmtNum } from '../lib/util';
import { C } from '../lib/theme';
import { Avatar, Btn, Press, Spark, T } from './ui';
import { WalletCard } from './WalletCard';

export type Pop = { type: 'username' | 'number' | 'wallet'; name?: string } | null;

/** Web ProfilePopup: info about a collectible username, the anonymous number or the wallet, with actions. */
export function ProfilePopup({ pop, u, isMe, onClose }: { pop: Pop; u: any; isMe: boolean; onClose: () => void }) {
  const low = usePerf((s) => s.low);
  const me = useStore((s) => s.me);
  const [info, setInfo] = useState<any>(null);
  const k = useSharedValue(0);
  useEffect(() => {
    setInfo(null);
    if (pop) k.value = withTiming(1, { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.2, 1) });
    if (pop?.type === 'username') api(`/usernames/${encodeURIComponent(pop.name!)}/info`).then(setInfo).catch(() => setInfo({ name: pop.name }));
  }, [pop?.type, pop?.name]);
  const a = useAnimatedStyle(() => ({ opacity: k.value, transform: [{ scale: 0.92 + 0.08 * k.value }, { translateY: (1 - k.value) * 16 }] }));
  const bg = useAnimatedStyle(() => ({ opacity: k.value }));
  const close = (then?: () => void) => { k.value = withTiming(0, { duration: 160 }); setTimeout(() => { onClose(); then?.(); }, 160); };
  if (!pop) return null;
  const owner = info?.owner || { id: u.id, displayName: u.displayName, avatar: u.avatar };
  const when = (ts: number) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const Chip = ({ user }: { user: any }) => (
    <View style={st.chip}><Avatar uri={user.avatar} name={user.displayName} id={user.id} size={22} /><T w={600} size={13.5}>{user.displayName}</T></View>
  );
  let body: React.ReactNode = null;
  if (pop.type === 'wallet') {
    const amount = isMe ? me.balance : u.publicBalance;
    body = (
      <>
        <T w={800} size={16} center>Кошелёк {u.username ? `@${u.username}` : u.displayName}</T>
        <WalletCard amount={amount} owner={u.username ? `@${u.username}` : u.displayName} />
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 4 }}><T size={13} dim>≈ {fmtNum(amount)}</T><Spark size={13} /><T size={13} dim>Искры</T></View>
        {isMe && <Btn height={46} title="Открыть кошелёк" onPress={() => close(() => router.push('/settings/wallet'))} />}
        <Btn secondary height={46} title="Закрыть" onPress={() => close()} />
      </>
    );
  } else if (pop.type === 'number') {
    body = (
      <>
        <View style={st.ico}><Phone size={30} color={C.text} /></View>
        <T center size={15}><T w={800} size={15}>{u.anonNumber}</T> — анонимный номер, принадлежащий</T>
        <Chip user={owner} />
        <T size={13} dim center style={{ lineHeight: 18 }}>Номер скрывает настоящий телефон. Анонимные номера выдаёт бот @numbers прямо в Recidivist.</T>
        <Btn height={46} title="Копировать номер" icon={<Copy size={17} color="#fff" />} onPress={() => { Clipboard.setStringAsync(u.anonNumber.replace(/\s/g, '')); close(); }} />
        {!isMe && <Btn secondary height={46} title="Получить свой номер" onPress={() => close(() => router.push('/u/numbers' as any))} />}
      </>
    );
  } else {
    const name = info?.name || pop.name;
    body = (
      <>
        <View style={st.ico}><AtSign size={30} color={C.text} /></View>
        <T center size={15}><T w={800} size={15}>@{name}</T> — коллекционное имя пользователя, принадлежащее</T>
        <Chip user={owner} />
        <T size={13} dim center style={{ lineHeight: 18 }}>
          {!info ? 'Загрузка…' : info.purchase ? `Это имя куплено на Маркете Recidivist ${when(info.purchase.at)} за ${fmtNum(info.purchase.price)} ✦`
            : info.acquiredAt ? `Имя зарегистрировано ${when(info.acquiredAt)}. Юзернеймы переходят из рук в руки на Маркете.` : 'Юзернеймы переходят из рук в руки на Маркете.'}
        </T>
        <Btn height={46} title="Маркет" icon={<Store size={17} color="#fff" />} onPress={() => close(() => router.push({ pathname: '/market', params: { kind: 'username', q: name } }))} />
        <Btn secondary height={46} title="Копировать ссылку" icon={<Link2 size={17} color={C.text} />} onPress={() => { Clipboard.setStringAsync(`https://recidivist.lol/@${name}`); close(); }} />
      </>
    );
  }
  const Wrap: any = Platform.OS === 'web' ? WebLayer : Modal;
  return (
    <Wrap visible transparent animationType="none" onRequestClose={() => close()}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close()}>
        <Animated.View style={[StyleSheet.absoluteFill, bg]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: low ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)' }]} />{!low && <BlurView tint="dark" intensity={35} style={StyleSheet.absoluteFill} />}
        </Animated.View>
      </Pressable>
      <View style={st.center} pointerEvents="box-none">
        <Animated.View style={[st.card, a]}>
          {pop.type !== 'wallet' && (
            <Press scale={0.85} onPress={() => close()} style={st.x}><View style={st.xIn}><X size={16} color={C.text2} /></View></Press>
          )}
          {body}
        </Animated.View>
      </View>
    </Wrap>
  );
}
/** react-native-web's Modal mis-centres its content; on the web preview render a plain full-screen layer instead. */
const WebLayer = ({ children }: any) => <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}>{children}</View>;

const st = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 360, borderRadius: 26, padding: 18, gap: 12, backgroundColor: 'rgba(20,20,22,0.96)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  ico: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.18)' },
  x: { position: 'absolute', top: 12, right: 12, zIndex: 2 },
  xIn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  chip: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)' },
});
