import * as Font from 'expo-font';
import { create } from 'zustand';
import { kv } from './db';

/** Interface fonts — the same list as the web client (Settings → Шрифты). */
type Files = Partial<Record<number, number>>;
export const FONTS: { id: string; name: string; premium?: boolean; scale?: number; files?: Files }[] = [
  { id: 'system', name: 'Системный' },
  { id: 'rubik', name: 'Rubik', files: {
    400: require('@expo-google-fonts/rubik/400Regular/Rubik_400Regular.ttf'), 500: require('@expo-google-fonts/rubik/500Medium/Rubik_500Medium.ttf'),
    600: require('@expo-google-fonts/rubik/600SemiBold/Rubik_600SemiBold.ttf'), 700: require('@expo-google-fonts/rubik/700Bold/Rubik_700Bold.ttf'),
    800: require('@expo-google-fonts/rubik/800ExtraBold/Rubik_800ExtraBold.ttf'), 900: require('@expo-google-fonts/rubik/900Black/Rubik_900Black.ttf') } },
  { id: 'inter', name: 'Inter', files: {
    400: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'), 500: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    600: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'), 700: require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf'),
    800: require('@expo-google-fonts/inter/800ExtraBold/Inter_800ExtraBold.ttf'), 900: require('@expo-google-fonts/inter/900Black/Inter_900Black.ttf') } },
  { id: 'montserrat', name: 'Montserrat', files: {
    400: require('@expo-google-fonts/montserrat/400Regular/Montserrat_400Regular.ttf'), 500: require('@expo-google-fonts/montserrat/500Medium/Montserrat_500Medium.ttf'),
    600: require('@expo-google-fonts/montserrat/600SemiBold/Montserrat_600SemiBold.ttf'), 700: require('@expo-google-fonts/montserrat/700Bold/Montserrat_700Bold.ttf'),
    800: require('@expo-google-fonts/montserrat/800ExtraBold/Montserrat_800ExtraBold.ttf'), 900: require('@expo-google-fonts/montserrat/900Black/Montserrat_900Black.ttf') } },
  { id: 'manrope', name: 'Manrope', files: {
    400: require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'), 500: require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
    600: require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'), 700: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
    800: require('@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf') } },
  { id: 'nunito', name: 'Nunito', files: {
    400: require('@expo-google-fonts/nunito/400Regular/Nunito_400Regular.ttf'), 600: require('@expo-google-fonts/nunito/600SemiBold/Nunito_600SemiBold.ttf'),
    700: require('@expo-google-fonts/nunito/700Bold/Nunito_700Bold.ttf'), 800: require('@expo-google-fonts/nunito/800ExtraBold/Nunito_800ExtraBold.ttf'),
    900: require('@expo-google-fonts/nunito/900Black/Nunito_900Black.ttf') } },
  { id: 'unbounded', name: 'Unbounded', premium: true, files: {
    400: require('@expo-google-fonts/unbounded/400Regular/Unbounded_400Regular.ttf'), 500: require('@expo-google-fonts/unbounded/500Medium/Unbounded_500Medium.ttf'),
    600: require('@expo-google-fonts/unbounded/600SemiBold/Unbounded_600SemiBold.ttf'), 700: require('@expo-google-fonts/unbounded/700Bold/Unbounded_700Bold.ttf'),
    800: require('@expo-google-fonts/unbounded/800ExtraBold/Unbounded_800ExtraBold.ttf') } },
  { id: 'pixel', name: 'Minecraft (пиксели)', premium: true, scale: 0.72, files: {
    400: require('@expo-google-fonts/press-start-2p/400Regular/PressStart2P_400Regular.ttf') } },
  { id: 'mono', name: 'JetBrains Mono', premium: true, files: {
    400: require('@expo-google-fonts/jetbrains-mono/400Regular/JetBrainsMono_400Regular.ttf'), 600: require('@expo-google-fonts/jetbrains-mono/600SemiBold/JetBrainsMono_600SemiBold.ttf'),
    700: require('@expo-google-fonts/jetbrains-mono/700Bold/JetBrainsMono_700Bold.ttf'), 800: require('@expo-google-fonts/jetbrains-mono/800ExtraBold/JetBrainsMono_800ExtraBold.ttf') } },
];

async function load(id: string) {
  const f = FONTS.find((x) => x.id === id);
  if (!f?.files) return;
  await Font.loadAsync(Object.fromEntries(Object.entries(f.files).map(([w, src]) => [`${id}-${w}`, src as number])));
}

type S = { id: string; set: (id: string) => Promise<void> };
export const useFont = create<S>((set) => ({
  id: 'system',
  set: async (id) => { await load(id).catch(() => {}); kv.set('font', id); set({ id }); },
}));
/** Load the saved font before the first frame. */
export async function initFont() {
  const id = kv.get('font', 'system');
  try { await load(id); useFont.setState({ id }); } catch { useFont.setState({ id: 'system' }); }
}

/** Text style for a weight in the current font (custom fonts need a family per weight). */
export function fontStyle(id: string, weight: number, size?: number) {
  const f = FONTS.find((x) => x.id === id);
  const sz = size != null ? Math.round(size * (f?.scale || 1) * 10) / 10 : undefined;
  if (!f?.files) return { fontWeight: String(weight) as any, ...(sz ? { fontSize: sz } : null) };
  const ws = Object.keys(f.files).map(Number);
  const w = ws.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), ws[0]);
  return { fontFamily: `${id}-${w}`, fontWeight: 'normal' as const, ...(sz ? { fontSize: sz } : null) };
}
export const useFontStyle = (weight = 400, size?: number) => {
  const id = useFont((s) => s.id);
  return fontStyle(id, weight, size);
};
