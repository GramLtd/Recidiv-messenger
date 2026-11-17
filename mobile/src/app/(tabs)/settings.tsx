import React from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AtSign, Bell, Bookmark, Contrast, CreditCard, Gift, Globe, Hand, HardDrive, LogOut, MonitorSmartphone, Network, Shield, ShieldCheck, Tag, Type,
  User, Wallet,
} from 'lucide-react-native';
import { useStore } from '../../lib/store';
import { useFont, FONTS } from '../../lib/fonts';
import { kv } from '../../lib/db';
import { C } from '../../lib/theme';
import { Avatar, Glass, PremiumStar, Press, Rise, Spark, SparkIcon, T } from '../../components/ui';
import { Group, Row } from '../../components/Settings';
import { StyledName } from '../../components/Profile';

/** Settings home — the same groups, icons and colours as the web client. */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const me = useStore((s) => s.me);
  const chats = useStore((s) => s.chats);
  const logout = useStore((s) => s.logout);
  const font = FONTS.find((f) => f.id === useFont((s) => s.id)) || FONTS[0];
  const saved = chats.find((c) => c.type === 'saved');
  const proxy = kv.get<any>('proxy', {});
  const go = (page: string) => router.push(`/settings/${page}` as any);
  if (!me) return null;
  return (
    <ScrollView contentInsetAdjustmentBehavior="never" style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 140, paddingHorizontal: 14 }} showsVerticalScrollIndicator={false}>
      <Rise><T w={800} size={19} style={{ paddingHorizontal: 4, marginBottom: 14, marginTop: 10 }}>Настройки</T></Rise>
      <Rise delay={40}>
        <Press scale={0.98} onPress={() => go('profile')} style={st.me}>
          <Avatar uri={me.avatar} name={me.displayName} id={me.id} size={64} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><StyledName user={me} size={15} w={700} />{me.premium && <PremiumStar />}</View>
            <T size={13} dim numberOfLines={1}>{me.username ? `@${me.username}` : me.email}</T>
          </View>
          <T size={22.5} color={C.text3}>›</T>
        </Press>
      </Rise>
      <Group delay={60}>
        <Row index={0} icon={User} color="#ff3b30" title="Мой профиль" onPress={() => router.push('/profile')} />
        <Row index={1} icon={AtSign} color="#0a84ff" title="Юзернеймы" value={me.username ? `@${me.username}` : ''} onPress={() => go('usernames')} />
        {saved && <Row index={2} icon={Bookmark} color="#5ac8fa" title="Избранное" onPress={() => router.push(`/chat/${saved.id}`)} />}
      </Group>
      <Group delay={90}>
        <Row index={0} icon={Bell} color="#ff453a" title="Уведомления" onPress={() => go('notifications')} />
        <Row index={1} icon={Gift} color="#af52de" title="Магазин" onPress={() => go('shop')} />
        <Row index={2} icon={Tag} color="#0a84ff" title="Маркет" onPress={() => go('market')} />
        <Row index={3} icon={(p: any) => <SparkIcon size={18} color="#fff" />} color="#ff3b5c" title="Recidivist Premium" value={me.premium ? 'активен' : ''} onPress={() => go('premium')} />
        <Row index={4} icon={CreditCard} color={['#2c2c2e', '#ff2d3d']} title="Кошелёк" value={<Spark amount={me.balance} size={14.3} />} onPress={() => go('wallet')} />
        <Row index={5} icon={Wallet} color="#0098ea" title="TON-кошельки" onPress={() => go('wallets')} />
      </Group>
      <Group delay={120}>
        <Row index={0} icon={Globe} color="#bf5af2" title="Язык" value="Русский" onPress={() => go('language')} />
        <Row index={1} icon={Hand} color="#0a84ff" title="Конфиденциальность" onPress={() => go('privacy')} />
        <Row index={2} icon={MonitorSmartphone} color="#ff9f0a" title="Устройства" onPress={() => go('devices')} />
        <Row index={3} icon={ShieldCheck} color="#34c759" title="Безопасность" onPress={() => go('security')} />
        <Row index={4} icon={Network} color="#5856d6" title="Прокси" value={proxy.enabled ? `${proxy.type?.toUpperCase()} ${proxy.host}` : 'выкл.'} onPress={() => router.push('/settings/proxy')} />
        <Row index={5} icon={Contrast} color="#3a3a3c" title="Оформление" onPress={() => go('theme')} />
        <Row index={6} icon={Type} color="#0a84ff" title="Шрифты" value={font.name} onPress={() => go('fonts')} />
        <Row index={7} icon={HardDrive} color="#8e8e93" title="Память" onPress={() => go('storage')} />
      </Group>
      <Group delay={150}>
        {me.isAdmin && <Row index={0} icon={Shield} color="#ff3b30" title="Админ-панель" onPress={() => go('admin')} />}
        <Row index={1} icon={LogOut} color="#ff453a" title="Выйти" danger onPress={() => Alert.alert('Выйти из аккаунта?', 'Для входа понадобится сид-фраза.', [{ text: 'Отмена' }, { text: 'Выйти', style: 'destructive', onPress: logout }])} />
      </Group>
      <T size={12} dim center style={{ paddingTop: 6 }}>Recidivist · ✦ Искры</T>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 24, backgroundColor: C.group, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', marginBottom: 14 },
});
