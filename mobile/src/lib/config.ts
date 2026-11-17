import Constants from 'expo-constants';

/** Server the app talks to (REST + socket.io). Override via app.json → expo.extra.apiUrl. */
export const API_URL: string = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl || 'https://recidivist.lol';
export const mediaUrl = (u?: string | null) => (!u ? undefined : u.startsWith('/') ? API_URL + u : u);
