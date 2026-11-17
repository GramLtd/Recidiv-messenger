import React from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import { api } from '../lib/api';
import { C } from '../lib/theme';
import { T } from '../components/ui';
import { SheetHead, UserPicker, sheetStyle } from '../components/Sheets';

/** Transfer a collectible to another person (web TransferGiftModal). */
export default function GiftTransfer() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const pick = (u: any) => Alert.alert(`Передать подарок ${u.displayName}?`, 'Передача бесплатна и необратима.', [
    { text: 'Отмена' },
    { text: 'Передать', onPress: async () => { try { await api(`/user-gifts/${id}/transfer`, { body: { toUserId: u.id } }); Alert.alert('Подарок передан'); router.dismissAll(); } catch (e: any) { Alert.alert(e.message); } } },
  ]);
  return (
    <View style={sheetStyle}>
      <SheetHead title={`Передать ${title || 'подарок'}`} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 6 }}><Info size={14} color={C.text2} /><T size={13} dim>Передача бесплатна и необратима.</T></View>
        <UserPicker onPick={pick} />
      </ScrollView>
    </View>
  );
}
