import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

/** OS notifications for incoming messages while the app is in the background (socket still alive). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

export async function requestNotifications() {
  const s = await Notifications.getPermissionsAsync();
  if (s.granted) return true;
  const r = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('messages', { name: 'Сообщения', importance: Notifications.AndroidImportance.HIGH });
  return r.granted;
}

export function notifyMessage(title: string, body: string, chatId: number) {
  if (AppState.currentState === 'active') return;
  Notifications.scheduleNotificationAsync({ content: { title, body, data: { chatId }, sound: true }, trigger: null }).catch(() => {});
}
export const onNotificationTap = (fn: (chatId: number) => void) =>
  Notifications.addNotificationResponseReceivedListener((r) => { const id = Number(r.notification.request.content.data?.chatId); if (id) fn(id); });
