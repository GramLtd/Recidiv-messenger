import React, { ReactNode, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Search, X } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useFont, fontStyle } from '../lib/fonts';
import { lastSeen } from '../lib/util';
import { C } from '../lib/theme';
import { Avatar, Glass, Press, Rise, T, Verified } from './ui';

/** Header for form-sheet screens (web .modal-head): title + glass close. */
export function SheetHead({ title, right, onClose }: { title: string; right?: ReactNode; onClose?: () => void }) {
  return (
    <View style={st.head}>
      <T w={800} size={17} numberOfLines={1} style={{ flex: 1 }}>{title}</T>
      {right}
      <Press scale={0.88} onPress={onClose || (() => router.back())}>
        <Glass radius={18} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.text} /></Glass>
      </Press>
    </View>
  );
}

/** Web .search-box */
export function SearchBox({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const font = useFont((s) => s.id);
  return (
    <View style={st.search}>
      <Search size={18} color={C.text2} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.text2} autoFocus={autoFocus} autoCapitalize="none" autoCorrect={false}
        style={[{ flex: 1, color: C.text, height: 42 }, fontStyle(font, 400, 15)]} />
    </View>
  );
}

/** Web UserPicker: known chats + global search; single tap or multi-select with checks. */
export function UserPicker({ onPick, selected, single = true, header }: { onPick: (u: any) => void; selected?: any[]; single?: boolean; header?: ReactNode }) {
  const chats = useStore((s) => s.chats);
  const me = useStore((s) => s.me);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<any[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return undefined; }
    const t = setTimeout(() => api(`/users/search?q=${encodeURIComponent(q.trim())}`).then((r) => setFound(r.users || [])).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const known = chats.filter((c) => c.type === 'private' && c.peer && !c.peer.isBot).map((c) => c.peer);
  const ql = q.trim().toLowerCase();
  const seen = new Set<number>();
  const people = [...(ql ? known.filter((u) => u.displayName?.toLowerCase().includes(ql)) : known), ...found]
    .filter((u) => u.id !== me?.id && !seen.has(u.id) && seen.add(u.id));
  return (
    <View>
      {header}
      <SearchBox value={q} onChange={setQ} placeholder="Поиск по имени или @username" />
      {people.length === 0 && <T dim center size={13} style={{ padding: 20 }}>{q ? 'Никого не нашли' : 'Начните вводить имя'}</T>}
      {people.map((u, i) => {
        const on = !!selected?.some((x) => x.id === u.id);
        return (
          <Rise key={u.id} delay={Math.min(i, 12) * 20} duration={280} dy={6}>
            <Pressable onPress={() => onPick(u)} style={({ pressed }) => [st.item, pressed && { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Avatar uri={u.avatar} name={u.displayName} id={u.id} size={44} online={u.online} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><T w={700} numberOfLines={1} style={{ flexShrink: 1 }}>{u.displayName}</T>{u.verified && <Verified size={14} />}</View>
                <T size={13} dim numberOfLines={1}>{u.username ? `@${u.username}` : lastSeen(u)}</T>
              </View>
              {!single && <View style={[st.check, on && { backgroundColor: C.accent, borderColor: C.accent }]}>{on && <Check size={14} color="#fff" strokeWidth={3} />}</View>}
            </Pressable>
          </Rise>
        );
      })}
    </View>
  );
}

export const sheetStyle = { flex: 1, backgroundColor: C.bg2 } as const;

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 18, paddingRight: 12, paddingTop: 16, paddingBottom: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42, borderRadius: 21, backgroundColor: C.bg3, paddingHorizontal: 14, marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.text3, alignItems: 'center', justifyContent: 'center' },
});
