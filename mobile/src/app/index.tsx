import { Redirect } from 'expo-router';
import { useStore } from '../lib/store';

/** App start: go to chats when signed in, otherwise to the login screen. */
export default function Index() {
  const me = useStore((s) => s.me);
  return <Redirect href={me ? '/(tabs)/chats' : '/login'} />;
}
