import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Dimensions, Linking, Platform, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import {
  ArrowDownLeft, ArrowUpRight, Tag, ScanFace, Timer, EyeOff, Shield, MapPinOff, Network, Camera, Check, Crown, Eye, HardDrive, KeyRound, Lock, MapPin, Monitor, Plus, Send, ShieldCheck, Smartphone, Sparkles, Trash2,
} from 'lucide-react-native';
import { api, upload } from '../../lib/api';
import { useCached } from '../../lib/useCached';
import { biometricsAvailable, useLock } from '../../lib/lock';
import { WalletCard } from '../../components/WalletCard';
import { useStore } from '../../lib/store';
import { usePerf } from '../../lib/perf';
import { FONTS, fontStyle, useFont } from '../../lib/fonts';
import { db, kv, wipe } from '../../lib/db';
import { e2eReady } from '../../lib/e2e';
import { fmtNum, lastSeen } from '../../lib/util';
import { C } from '../../lib/theme';
import { AccentFill, Avatar, Btn, Glass, PremiumStar, Press, Radial, Rise, Spark, SparkIcon, T } from '../../components/ui';
import { Group, IconSq, Page, Radio, Row, Switch } from '../../components/Settings';
import { StyledName } from '../../components/Profile';

const TITLES: Record<string, string> = {
  profile: 'Мой профиль', usernames: 'Юзернеймы', notifications: 'Уведомления', premium: 'Recidivist Premium', wallet: 'Кошелёк', wallets: 'TON-кошельки',
  language: 'Язык', privacy: 'Конфиденциальность', devices: 'Устройства', security: 'Безопасность', theme: 'Оформление', fonts: 'Шрифты', storage: 'Память',
  shop: 'Магазин', market: 'Маркет', admin: 'Админ-панель',
};

export default function SettingsPage() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const Body = PAGES[page as string] || Soon;
  return <Page title={TITLES[page as string] || 'Настройки'}><Body /></Page>;
}

const useMe = () => useStore((s) => s.me);
const setMe = (u: any) => useStore.getState().setMe(u);
const run = async (fn: () => Promise<any>, ok?: string) => { try { await fn(); if (ok) Alert.alert(ok); } catch (e: any) { Alert.alert('Ошибка', e.message); } };

function Field({ label, value, onChange, multiline, max, placeholder, onBlur, icon }: any) {
  const font = useFont((s) => s.id);
  return (
    <View style={{ gap: 6, marginBottom: 14 }}>
      <T size={13} w={600} dim style={{ paddingHorizontal: 4 }}>{label}</T>
      <View style={st.inputWrap}>
        {icon}
        <TextInput value={value} onChangeText={onChange} onBlur={onBlur} multiline={multiline} maxLength={max} placeholder={placeholder} placeholderTextColor={C.text3}
          style={[st.input, fontStyle(font, 400, 15), multiline && { minHeight: 90, textAlignVertical: 'top' }]} />
      </View>
      {multiline && max ? <T size={12} dim style={{ paddingHorizontal: 4 }}>{(value || '').length}/{max}</T> : null}
    </View>
  );
}

/* ---------------- profile ---------------- */
function ProfilePage() {
  const me = useMe();
  const [name, setName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio || '');
  const [loc, setLoc] = useState(me.location || '');
  const [busy, setBusy] = useState(false);
  const pickAvatar = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.85 });
    if (r.canceled) return;
    const a = r.assets[0];
    run(async () => { const up = await upload(a.uri, a.fileName || 'avatar.jpg', a.mimeType || 'image/jpeg'); setMe((await api.patch('/me', { avatar: up.url })).user); }, 'Аватарка обновлена');
  };
  const save = async () => {
    setBusy(true);
    await run(async () => {
      setMe((await api.patch('/me', { displayName: name, bio })).user);
      if ((me.location || '') !== loc) setMe((await api('/me/profile-extra', { body: { location: loc } })).user);
    }, 'Профиль сохранён');
    setBusy(false);
  };
  return (
    <>
      <Rise style={{ alignSelf: 'center', marginVertical: 10 }}>
        <Press onPress={pickAvatar} scale={0.94}>
          <Avatar uri={me.avatar} name={name} id={me.id} size={100} />
          <View style={st.camera}><Camera size={16} color="#fff" /></View>
        </Press>
      </Rise>
      <Field label="Местоположение" value={loc} onChange={setLoc} max={48} placeholder="Город или что угодно" icon={<MapPin size={18} color={C.text2} style={{ marginLeft: 12 }} />} />
      <Field label="Имя" value={name} onChange={setName} max={64} />
      <Field label="О себе" value={bio} onChange={setBio} max={200} multiline />
      <Group>
        <Row icon={(p: any) => <T color="#fff" w={800} size={13}>+888</T>} color={C.accent} title="Анонимный номер" sub={me.anonNumber || 'Создать номер +888 через бота'} />
      </Group>
      <T size={13} dim style={{ marginBottom: 14, paddingHorizontal: 4 }}>Email: {me.email}</T>
      <Btn title="Сохранить" onPress={save} disabled={busy} height={48} />
    </>
  );
}

/* ---------------- usernames ---------------- */
function UsernamesPage() {
  const [data, , load] = useCached<any>('/me/usernames');
  const [name, setName] = useState('');
  return (
    <>
      <T size={13} dim style={{ marginBottom: 12, paddingHorizontal: 4, lineHeight: 18 }}>В Recidivist юзернеймы коллекционные: у вас может быть несколько, один из них — основной. Лишние можно продать на маркете.</T>
      <Group>
        {(data?.usernames || []).map((u: any, i: number) => (
          <Row key={u.name} index={i} title={`@${u.name}`} sub={u.active ? 'основной' : u.listed ? 'выставлен на продажу' : 'дополнительный'}
            right={!u.listed ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {!u.active && <Btn secondary height={34} title="Основной" icon={<Check size={15} color={C.text} />} onPress={() => run(async () => { setMe((await api('/me/usernames/active', { body: { name: u.name } })).user); load(); })} />}
                <Btn secondary height={34} title="Продать" icon={<Tag size={15} color={C.text} />} onPress={() => router.push({ pathname: '/sell', params: { username: u.name } })} />
              </View>
            ) : undefined} />
        ))}
      </Group>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={[st.inputWrap, { flex: 1 }]}><TextInput value={name} onChangeText={(v) => setName(v.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="новый_юзернейм" placeholderTextColor={C.text3} style={[st.input, { color: C.text }]} autoCapitalize="none" /></View>
        <Btn icon={<Plus size={18} color="#fff" />} height={48} disabled={name.length < 3} onPress={() => run(async () => { setMe((await api('/me/usernames', { body: { name } })).user); setName(''); load(); }, `@${name} теперь ваш`)} />
      </View>
      {data?.claimPrice > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingHorizontal: 4 }}><T size={12} dim>Регистрация нового юзернейма стоит</T><Spark amount={data.claimPrice} size={12} /></View>}
    </>
  );
}

/* ---------------- notifications ---------------- */
function NotificationsPage() {
  const low = usePerf((s) => s.low); const setLow = usePerf((s) => s.setLow);
  const [n, setN] = useState<any>(() => kv.get('notify', {}));
  const sw = (k: string) => <Switch on={n[k] !== false} onChange={(v) => { const x = { ...n, [k]: v }; setN(x); kv.set('notify', x); }} />;
  return (
    <>
      <Group title="Чаты">
        <Row index={0} title="Личные сообщения" right={sw('notifyPrivate')} />
        <Row index={1} title="Группы" right={sw('notifyGroups')} />
        <Row index={2} title="Каналы" right={sw('notifyChannels')} />
        <Row index={3} title="Показывать текст" sub="Иначе — просто «Новое сообщение»" right={sw('notifyPreview')} />
      </Group>
      <Group title="Производительность" footer="Без размытия, частиц и бесконечных анимаций — максимум плавности и меньше расход батареи.">
        <Row title="Режим производительности" right={<Switch on={low} onChange={setLow} />} />
      </Group>
      <Group title="Звуки">
        <Row index={0} title="Звук отправки" right={sw('sendSound')} />
        <Row index={1} title="Звук входящих в открытом чате" right={sw('inSound')} />
      </Group>
    </>
  );
}

/* ---------------- fonts ---------------- */
function FontsPage() {
  const me = useMe();
  const cur = useFont((s) => s.id); const setFont = useFont((s) => s.set);
  return (
    <Group footer="Шрифты с искрой доступны с Premium.">
      {FONTS.map((f, i) => {
        const locked = f.premium && !me.premium;
        return (
          <Row key={f.id} index={i}
            title={<FontName id={f.id} name={f.name} />}
            sub={locked ? 'Premium' : undefined}
            onPress={() => (locked ? router.push('/settings/premium') : setFont(f.id))}
            right={cur === f.id ? <Check size={20} color={C.accent} /> : f.premium ? <PremiumStar /> : <View />} />
        );
      })}
    </Group>
  );
}
function FontName({ id, name }: { id: string; name: string }) {
  const [ready, setReady] = useState(id === 'system');
  useEffect(() => { if (id !== 'system') import('expo-font').then((F) => F.loadAsync({ [`${id}-400`]: (FONTS.find((f) => f.id === id)!.files as any)[400] })).then(() => setReady(true)).catch(() => {}); }, []);
  return <T style={ready ? fontStyle(id, 400, 15) : undefined}>{name}</T>;
}

/* ---------------- privacy ---------------- */
function PrivacyPage() {
  const me = useMe();
  const p = me.privacy || {};
  const [price, setPrice] = useState(String(p.messagePrice || 10));
  const [bl, , reloadBl] = useCached<any>('/me/blocked');
  const [ct] = useCached<any>('/contacts');
  const blocked: any[] | null = bl?.users ?? null;
  const contacts: any[] | null = ct?.users ?? null;
  const load = () => { reloadBl(); };
  const save = (body: any) => run(async () => setMe((await api('/me/privacy', { body })).user));
  const person = (u: any) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar uri={u.avatar} name={u.displayName} id={u.id} size={32} /><T numberOfLines={1}>{u.displayName}</T></View>;
  return (
    <>
      <Group title="Время захода" footer="Если скрыть своё время, вы не увидите время других — кроме Premium.">
        {[['everyone', 'Все'], ['contacts', 'Мои контакты'], ['nobody', 'Никто']].map(([k, l], i) => <Row key={k} index={i} title={l} onPress={() => save({ lastSeen: k })} right={<Radio on={p.lastSeen === k} />} />)}
      </Group>
      <Group title="Кто может мне писать" footer="Правило действует для новых чатов: если вы уже писали человеку или он у вас в контактах — он сможет ответить.">
        {[['everyone', 'Все'], ['contacts', 'Только контакты'], ['premium', 'Только Premium'], ['paid', 'Платно']].map(([k, l], i) => <Row key={k} index={i} title={l} onPress={() => save({ messages: k })} right={<Radio on={p.messages === k} />} />)}
        {p.messages === 'paid' && (
          <View style={st.inline}>
            <T size={13} style={{ flex: 1 }}>Цена сообщения</T>
            <TextInput keyboardType="number-pad" value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} onBlur={() => save({ messagePrice: Number(price) || 1 })} style={[st.input, st.smallInput]} />
            <Spark />
          </View>
        )}
      </Group>
      <Group footer="Если выключить, ваши заходы в чужие профили не попадут в их списки «Кто смотрел профиль».">
        <Row title="Отмечать мои просмотры профилей" right={<Switch on={p.profileViews !== false} onChange={(v) => save({ profileViews: v })} />} />
      </Group>
      <Group title={`Контакты · ${contacts?.length ?? '…'}`}>
        {(contacts || []).map((u, i) => <Row key={u.id} index={i} title={person(u)} sub={lastSeen(u)} onPress={() => router.push(`/user/${u.id}`)} />)}
        {contacts && !contacts.length && <Row title={<T dim>Контактов пока нет — добавьте из профиля человека</T>} />}
      </Group>
      <Group title={`Заблокированные · ${blocked?.length ?? '…'}`}>
        {(blocked || []).map((u, i) => <Row key={u.id} index={i} title={person(u)} right={<Btn secondary height={34} title="Разблокировать" onPress={() => run(async () => { await api(`/users/${u.id}/block`, { body: {} }); load(); })} />} />)}
        {blocked && !blocked.length && <Row title={<T dim>Никого</T>} />}
      </Group>
    </>
  );
}

/* ---------------- devices ---------------- */
function DevicesPage() {
  const [data, , load] = useCached<any>('/sessions');
  if (!data) return null;
  const cur = data.sessions.find((s: any) => s.current);
  const others = data.sessions.filter((s: any) => !s.current);
  const icon = (d: string) => (/iOS|Android/.test(d || '') ? Smartphone : Monitor);
  const when = (ts: number) => new Date(ts).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <Group title="Это устройство">
        <Row icon={cur ? icon(cur.device) : Smartphone} color="#34c759" title={cur?.device || 'Это устройство'} sub="в сети" />
      </Group>
      {others.length > 0 && (
        <Group footer="Выход на других устройствах потребует снова ввести сид-фразу.">
          <Row title="Завершить все другие сеансы" danger onPress={() => Alert.alert('Выйти на всех других устройствах?', '', [{ text: 'Отмена' }, { text: 'Завершить', style: 'destructive', onPress: () => run(async () => { await api('/sessions/terminate-others', { body: {} }); load(); }) }])} />
        </Group>
      )}
      {others.length > 0 && (
        <Group title="Активные сеансы">
          {others.map((s: any, i: number) => <Row key={s.id} index={i} icon={icon(s.device)} color="#5856d6" title={s.device} sub={when(s.lastActive)}
            right={<Press scale={0.85} onPress={() => run(async () => { await api.del(`/sessions/${s.id}`); load(); })} style={{ padding: 6 }}><Trash2 size={18} color={C.danger} /></Press>} />)}
        </Group>
      )}
    </>
  );
}

/* ---------------- security ---------------- */
function SecurityPage() {
  const sec = useLock();
  const [bioOk, setBioOk] = useState(false);
  useEffect(() => { biometricsAvailable().then(setBioOk); }, []);
  const LOCKS: [number, string][] = [[0, 'сразу'], [1, 'через 1 минуту'], [5, 'через 5 минут'], [60, 'через 1 час']];
  const pickLock = () => {
    const opts = LOCKS.map((l) => l[1]);
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...opts, 'Отмена'], cancelButtonIndex: opts.length }, (i) => LOCKS[i] && sec.set({ autoLock: LOCKS[i][0] }));
    else Alert.alert('Блокировать', '', LOCKS.map(([v, l]) => ({ text: l, onPress: () => sec.set({ autoLock: v }) })));
  };
  const deleteAccount = () => Alert.alert('Удалить аккаунт навсегда?', 'Сообщения, посты, истории, файлы, юзернеймы и контакты будут стёрты с сервера. Это нельзя отменить.', [
    { text: 'Отмена' },
    { text: 'Удалить', style: 'destructive', onPress: () => Alert.alert('Точно удалить?', 'Войти по этой сид-фразе больше будет нельзя.', [
      { text: 'Нет' },
      { text: 'Да, удалить', style: 'destructive', onPress: () => run(async () => { await api('/me', { method: 'DELETE', body: { confirm: 'УДАЛИТЬ' } }); await useStore.getState().logout(); }) },
    ]) },
  ]);
  return (
    <>
      <Group title="Код-пароль" footer="Код хранится только на этом устройстве (в защищённом хранилище, в виде хеша). Если забудете — выйдите и войдите снова по сид-фразе.">
        <Row index={0} icon={Lock} color="#ff9500" title="Код-пароль" right={<Switch on={sec.passcode} onChange={(v) => router.push({ pathname: '/passcode', params: { mode: v ? 'set' : 'off' } })} />} />
        {sec.passcode && bioOk && <Row index={1} icon={ScanFace} color="#34c759" title="Вход по Face ID / Touch ID" right={<Switch on={sec.bio} onChange={(v) => sec.set({ bio: v })} />} />}
        {sec.passcode && <Row index={2} icon={Timer} color="#5856d6" title="Автоблокировка" value={LOCKS.find((l) => l[0] === sec.autoLock)?.[1]} onPress={pickLock} />}
        {sec.passcode && <Row index={3} title="Заблокировать сейчас" onPress={() => sec.lock()} />}
      </Group>
      <Group title="Защита экрана" footer="Содержимое чатов скрывается в переключателе приложений; при запрете скриншотов система не даст снять экран или записать видео.">
        <Row index={0} icon={EyeOff} color="#0a84ff" title="Скрывать в переключателе приложений" right={<Switch on={sec.hideSwitcher} onChange={(v) => sec.set({ hideSwitcher: v })} />} />
        <Row index={1} icon={Camera} color="#ff453a" title="Запретить скриншоты и запись экрана" right={<Switch on={sec.noScreenshots} onChange={(v) => sec.set({ noScreenshots: v })} />} />
      </Group>
      <Group title="Сквозное шифрование" footer="Ключ выводится из сид-фразы и хранится только на устройстве; сервер знает лишь открытый ключ и не может прочитать секретные сообщения.">
        <Row index={0} icon={KeyRound} color="#30b0c7" title="Секретные сообщения" sub={e2eReady() ? 'Ключ на устройстве — в личных чатах доступен 🔒' : 'Войдите по сид-фразе, чтобы получить ключ'} />
        <Row index={1} title="Шифровать личные чаты по умолчанию" sub="Если у собеседника тоже есть ключ" right={<Switch on={sec.e2eDefault} onChange={(v) => sec.set({ e2eDefault: v })} />} />
      </Group>
      <Group title="Анонимность" footer="Сервер не хранит IP-адреса, убирает геолокацию и данные камеры из фото, а удалённые сообщения стирает вместе с файлами. В чате можно включить автоудаление (⏱).">
        <Row index={0} icon={Shield} color="#34c759" title="IP-адреса не сохраняются" />
        <Row index={1} icon={MapPinOff} color="#34c759" title="Метаданные фото удаляются" sub="GPS, модель камеры, дата съёмки" />
        <Row index={2} icon={Network} color="#5856d6" title="Прокси" onPress={() => router.push('/settings/proxy')} />
      </Group>
      <Group title="Сид-фраза">
        <View style={st.warn}>
          <ShieldCheck size={18} color="#ffcc00" />
          <T size={13} style={{ flex: 1, lineHeight: 18 }}>Аккаунт защищён сид-фразой из 12 слов. Сервер хранит только хеш ключа — восстановить фразу невозможно. Храните её офлайн и никому не показывайте.</T>
        </View>
      </Group>
      <Group>
        <Row icon={Trash2} color="#ff453a" title="Удалить аккаунт навсегда" danger onPress={deleteAccount} />
      </Group>
    </>
  );
}

/* ---------------- storage ---------------- */
function StoragePage() {
  const [size, setSize] = useState<{ msgs: number; cache: number } | null>(null);
  const measure = () => {
    const m = db.getFirstSync<{ c: number }>('SELECT COALESCE(SUM(LENGTH(json)),0) c FROM messages')?.c || 0;
    const c = db.getFirstSync<{ c: number }>('SELECT COALESCE(SUM(LENGTH(v)),0) c FROM cache')?.c || 0;
    setSize({ msgs: m, cache: c });
  };
  useEffect(measure, []);
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} МБ`;
  return (
    <>
      <Glass radius={22} style={{ padding: 16, marginBottom: 16, gap: 4 }}>
        <T size={13} dim>Занято на устройстве</T>
        <T w={800} size={30}>{size ? mb(size.msgs + size.cache) : '…'}</T>
        <T size={13} dim>Сообщения: {size ? mb(size.msgs) : '…'} · Кэш: {size ? mb(size.cache) : '…'}</T>
      </Glass>
      <Group title="Очистка" footer="Сообщения и файлы хранятся на сервере — после очистки они просто загрузятся заново.">
        <Row index={0} icon={HardDrive} color="#ff9f0a" title="Очистить кэш" onPress={() => { db.execSync('DELETE FROM cache'); measure(); }} />
        <Row index={1} icon={Trash2} color="#ff453a" title="Удалить сохранённые сообщения" onPress={() => { wipe(); measure(); useStore.getState().refreshChats().catch(() => {}); }} />
      </Group>
    </>
  );
}

/* ---------------- language ---------------- */
function LanguagePage() {
  const [lang, setLang] = useState(kv.get('lang', 'ru'));
  const L = [['ru', '🇷🇺', 'Русский'], ['en', '🇬🇧', 'English'], ['uk', '🇺🇦', 'Українська']];
  return (
    <Group footer="Перевод интерфейса постепенно дополняется — непереведённые места остаются на русском.">
      {L.map(([id, flag, name], i) => <Row key={id} index={i} title={<T><T size={19.5}>{flag}</T>  {name}</T>} onPress={() => { kv.set('lang', id); setLang(id); }} right={lang === id ? <Check size={20} color={C.accent} /> : <View />} />)}
    </Group>
  );
}

/* ---------------- wallet ---------------- */
function WalletPage() {
  const me = useMe();
  const [data] = useCached<any>('/wallet', [me.balance]);
  const [filter, setFilter] = useState('all');
  const txs = (data?.transactions || []).filter((x: any) => filter === 'all' || (filter === 'in' ? x.amount > 0 : x.amount < 0));
  return (
    <>
      <WalletCard amount={me.balance} owner={me.username ? `@${me.username}` : me.displayName} />
      <View style={{ flexDirection: 'row', gap: 10, marginVertical: 14 }}>
        <Btn secondary title="Пополнить" icon={<Plus size={18} color={C.text} />} style={{ flex: 1 }} onPress={() => router.push('/topup')} />
        <Btn secondary title="Отправить" icon={<Send size={18} color={C.text} />} style={{ flex: 1 }} onPress={() => router.push('/transfer')} />
      </View>
      <Group footer="Под именем в профиле появится плашка с балансом — её увидит каждый.">
        <Row title="Показывать баланс в профиле" right={<Switch on={!!me.showBalance} onChange={(v) => run(async () => setMe((await api('/me/profile-extra', { body: { showBalance: v } })).user))} />} />
      </Group>
      <T size={12} w={600} dim style={{ paddingHorizontal: 14, paddingBottom: 6 }}>ИСТОРИЯ</T>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {[['all', 'Все'], ['in', 'Пришло'], ['out', 'Ушло']].map(([k, l]) => (
          <Press key={k} onPress={() => setFilter(k)} scale={0.92}>
            {filter === k ? <AccentFill radius={16} style={st.chip}><T size={13.2} color="#fff">{l}</T></AccentFill>
              : <Glass radius={16} style={st.chip}><T size={13.2}>{l}</T></Glass>}
          </Press>
        ))}
      </View>
      {!data ? null : !txs.length ? <T dim center size={13} style={{ padding: 20 }}>Пока пусто</T> : txs.map((x: any, i: number) => (
        <Rise key={x.id} delay={Math.min(i, 12) * 25} style={[st.tx, { borderBottomWidth: 1, borderBottomColor: C.border }]}>
          <IconSq color={x.amount > 0 ? '#34c759' : '#3a3a3c'}>{x.amount > 0 ? <ArrowDownLeft size={18} color="#fff" /> : <ArrowUpRight size={18} color="#fff" />}</IconSq>
          <View style={{ flex: 1, minWidth: 0 }}><T size={13} numberOfLines={1}>{x.description || x.type}</T><T size={11} dim>{new Date(x.createdAt).toLocaleString('ru-RU')}</T></View>
          <T w={700} color={x.amount > 0 ? '#2ecc71' : C.text}>{x.amount > 0 ? '+' : ''}{fmtNum(x.amount)}</T>
        </Rise>
      ))}
    </>
  );
}
export { WalletCard };

/* ---------------- premium ---------------- */
const PERKS: [string, string, any, string][] = [
  ['Искра Premium', 'Рядом с именем — везде, где вас видят', (p: any) => <SparkIcon size={18} color="#fff" />, '#ff3b5c'],
  ['Своё имя', 'Цвет, перелив, свечение и жирность', Sparkles, '#ff2d55'],
  ['Фон профиля', 'Перелив или золото вверху профиля', Crown, '#af52de'],
  ['Живая аватарка', 'GIF двигается, а не стоит', Eye, '#30b0c7'],
  ['Особые шрифты', 'Minecraft, Unbounded и моноширинный', KeyRound, '#5856d6'],
  ['Время захода других', 'Даже если вы скрыли своё', Eye, '#0a84ff'],
  ['Кто смотрел профиль', 'Кто открывал вашу страницу', Eye, '#34c759'],
  ['Кто может вам писать', 'Платные и Premium-сообщения проходят без ограничений', Send, '#ff9f0a'],
  ['Больше своего', '10 каналов и 10 групп вместо 3', Plus, '#ff375f'],
  ['20 постов в день вместо 5', 'Пауза 15 с вместо 30', Sparkles, '#32d74b'],
];
function PremiumPage() {
  const me = useMe();
  const [data, , load] = useCached<any>('/premium');
  const [months, setMonths] = useState(1);
  const active = !!data?.active;
  return (
    <>
      <LinearGradient colors={['#5b2bff', '#c13bff', '#ff4f7b', '#ff9a3c']} locations={[0, 0.4, 0.7, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.premHero}>
        <Float><View style={st.premStar}><SparkIcon size={44} fill="#fff" /></View></Float>
        <T w={900} size={24} color="#fff" center style={{ marginBottom: 6 }}>Recidivist Premium</T>
        <T size={14.3} color="rgba(255,255,255,0.9)" center style={{ maxWidth: 320, alignSelf: 'center', lineHeight: 20, marginBottom: 14 }}>Заметный профиль, особые шрифты, больше лимитов и полный контроль над тем, кто вам пишет.</T>
        {data && (
          <View style={st.premPrice}>
            {active ? <T w={800} color="#fff">активен до {new Date(data.until).toLocaleDateString('ru-RU')}</T> : <><Spark amount={data.price} color="#fff" /><T w={800} color="#fff">/ месяц</T></>}
          </View>
        )}
      </LinearGradient>
      <Group>
        {PERKS.map(([t, sub, I, c], i) => <Row key={t} index={i} icon={I} color={c} title={t} sub={sub} />)}
      </Group>
      <View style={st.seg}>
        {[1, 3, 12].map((m) => (
          <Press key={m} scale={0.95} onPress={() => setMonths(m)} style={[st.segBtn, months === m && st.segOn]}><T w={700} color={months === m ? C.text : C.text2}>{m} мес.</T></Press>
        ))}
      </View>
      <Btn height={50} title={`${active ? 'Продлить' : 'Оформить'} за ✦ ${fmtNum((data?.price || 0) * months)}`} disabled={!data}
        onPress={() => run(async () => { setMe((await api('/premium/buy', { body: { months } })).user); load(); }, 'Premium активирован ⭐')} />
    </>
  );
}

function Float({ children }: { children: React.ReactNode }) {
  const t = useSharedValue(0); const e = useSharedValue(0.5);
  useEffect(() => { e.value = withSpring(1, { damping: 11, stiffness: 160 }); t.value = withDelay(1000, withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1, true)); }, []);
  const a = useAnimatedStyle(() => ({ opacity: Math.min(1, e.value * 1.4), transform: [{ scale: e.value }, { translateY: -6 * t.value }] }));
  return <Animated.View style={[{ alignSelf: 'center', marginBottom: 12 }, a]}>{children}</Animated.View>;
}

/* ---------------- stubs for heavy pages not yet ported ---------------- */
function Soon() {
  return (
    <Rise style={{ alignItems: 'center', paddingVertical: 60, gap: 10 }}>
      <T w={800} size={18}>Скоро в приложении</T>
      <T dim center size={14} style={{ paddingHorizontal: 30, lineHeight: 19 }}>Этот раздел пока работает на сайте. Мы переносим его в нативное приложение.</T>
      <Btn secondary title="Открыть на сайте" onPress={() => Linking.openURL('https://recidivist.lol')} style={{ marginTop: 10 }} />
    </Rise>
  );
}

/* ---------------- appearance: chat wallpaper (same presets as the web) ---------------- */
const WPS: [string, string, string[]][] = [
  ['noir', 'Нуар', ['#2a0a0e', '#000']], ['blood', 'Кровь', ['#3d0008', '#120003', '#000']], ['ember', 'Угли', ['#5a1a00', '#1a0500', '#000']],
  ['aurora', 'Сияние', ['#021b1a', '#0a2a4a', '#2a0a3a']], ['neon', 'Неон', ['#1a0033', '#33001a', '#001a33']], ['ocean', 'Океан', ['#06345a', '#020c1a']],
  ['forest', 'Тайга', ['#0e3a22', '#03120a']], ['gold', 'Золото', ['#4a3500', '#140e00', '#000']], ['steel', 'Сталь', ['#23272e', '#0b0d10']], ['bars', 'Решётка', ['#2a2a2a', '#050505']],
];
function ThemePage() {
  const me = useMe();
  const cur = me.wallpaper?.preset || (me.wallpaper ? 'custom' : null);
  const set = (body: any) => run(async () => setMe((await api('/me/wallpaper', { body })).user));
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (r.canceled) return;
    const a = r.assets[0];
    run(async () => { const up = await upload(a.uri, a.fileName || 'wallpaper.jpg', a.mimeType || 'image/jpeg'); setMe((await api('/me/wallpaper', { body: { url: up.url } })).user); }, 'Обои установлены');
  };
  const tw = Math.floor((Dimensions.get('window').width - 28 - 2 - 20 - 16) / 3);
  return (
    <>
      <Group title="Обои чата" footer="Обои синхронизируются между устройствами.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 }}>
          <Press scale={0.94} onPress={() => set({})}>
            <View style={[st.wp, { width: tw, backgroundColor: C.bg }, !cur && st.wpOn]}><T size={12} w={600} dim>Без обоев</T></View>
          </Press>
          {WPS.map(([id, name, cols]) => (
            <Press key={id} scale={0.94} onPress={() => set({ preset: id })}>
              <LinearGradient colors={cols as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.wp, { width: tw }, cur === id && st.wpOn]}><T size={12} w={700} color="#fff">{name}</T></LinearGradient>
            </Press>
          ))}
          <Press scale={0.94} onPress={pick}>
            <View style={[st.wp, { width: tw, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.2)' }, cur === 'custom' && st.wpOn]}><Plus size={22} color={C.text2} /><T size={12} dim>Своё фото</T></View>
          </Press>
        </View>
      </Group>
      <Group title="Предпросмотр">
        <View style={{ padding: 14, gap: 6 }}>
          <View style={[st.bub, { alignSelf: 'flex-start', backgroundColor: C.bubbleIn, borderBottomLeftRadius: 6 }]}><T>Как тебе новая тема? 🔥</T></View>
          <View style={[st.bub, { alignSelf: 'flex-end', backgroundColor: C.bubbleOut, borderBottomRightRadius: 6 }]}><T>Чёрный OLED с красным — топ</T></View>
        </View>
      </Group>
    </>
  );
}

const PAGES: Record<string, React.ComponentType> = {
  theme: ThemePage,
  profile: ProfilePage, usernames: UsernamesPage, notifications: NotificationsPage, fonts: FontsPage, privacy: PrivacyPage, devices: DevicesPage,
  security: SecurityPage, storage: StoragePage, language: LanguagePage, wallet: WalletPage, premium: PremiumPage,
};

const st = StyleSheet.create({
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  input: { flex: 1, color: C.text, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12, minHeight: 46 },
  smallInput: { flex: 0, width: 90, minHeight: 38, paddingVertical: 6, backgroundColor: C.inputBg, borderRadius: 12 },
  camera: { position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.bg },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  warn: { flexDirection: 'row', gap: 10, margin: 10, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,204,0,0.08)', borderWidth: 1, borderColor: 'rgba(255,204,0,0.25)' },
  chip: { paddingHorizontal: 12, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 4 },
  wcard: { borderRadius: 26, padding: 20, aspectRatio: 1.6, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  wlogo: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  wtag: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.85)' },
  wchip: { width: 44, height: 34, borderRadius: 8 },
  premHero: { marginHorizontal: -14, marginTop: -6, marginBottom: 14, paddingTop: 26, paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  wp: { aspectRatio: 3 / 4, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  wpOn: { borderColor: C.accent },
  bub: { maxWidth: '78%', paddingVertical: 6, paddingHorizontal: 11, borderRadius: 16 },
  premStar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.22)', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.5)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } },
  premPrice: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  seg: { flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: C.glass, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', marginBottom: 10 },
  segBtn: { flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: 'rgba(255,255,255,0.14)' },
});
