import { create } from 'zustand';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { secret } from './kv';
import { kv } from './db';

/**
 * App protection: 4-digit passcode (only a salted hash is kept, in the Keychain / Keystore), Face ID / Touch ID,
 * auto-lock, hiding the content in the app switcher and blocking screenshots / screen recording.
 */
type Sec = { passcode: boolean; bio: boolean; autoLock: number; hideSwitcher: boolean; noScreenshots: boolean; e2eDefault: boolean };
const DEF: Sec = { passcode: false, bio: false, autoLock: 0, hideSwitcher: true, noScreenshots: false, e2eDefault: true };
type S = Sec & { locked: boolean; covered: boolean; set: (p: Partial<Sec>) => void; lock: () => void; unlock: () => void };

const hash = (code: string, salt: string) => bytesToHex(sha256(utf8ToBytes(`recidivist-pin:${salt}:${code}`)));

export const useLock = create<S>((set, get) => ({
  ...DEF, ...kv.get<Partial<Sec>>('security', {}),
  locked: false, covered: false,
  set: (p) => { const next = { ...get(), ...p }; kv.set('security', pick(next)); set(p); applyCapture(next); },
  lock: () => { if (get().passcode) set({ locked: true }); },
  unlock: () => set({ locked: false }),
}));
const pick = (s: Sec): Sec => ({ passcode: s.passcode, bio: s.bio, autoLock: s.autoLock, hideSwitcher: s.hideSwitcher, noScreenshots: s.noScreenshots, e2eDefault: s.e2eDefault });

export async function setPasscode(code: string) {
  const salt = bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  await secret.set('pin', `${salt}:${hash(code, salt)}`);
  useLock.getState().set({ passcode: true });
}
export async function clearPasscode() { await secret.del('pin'); useLock.getState().set({ passcode: false, bio: false }); }
export async function checkPasscode(code: string) {
  const v = await secret.get('pin');
  if (!v) return true;
  const [salt, h] = v.split(':');
  return hash(code, salt) === h;
}
export async function biometricsAvailable() {
  try { return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync()); } catch { return false; }
}
export async function tryBiometrics() {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Разблокировать Recidivist', cancelLabel: 'Код-пароль', disableDeviceFallback: true });
    return r.success;
  } catch { return false; }
}

function applyCapture(s: Sec) {
  if (Platform.OS === 'web') return;
  (s.noScreenshots ? ScreenCapture.preventScreenCaptureAsync('recidivist') : ScreenCapture.allowScreenCaptureAsync('recidivist')).catch(() => {});
  if (Platform.OS === 'ios') (s.hideSwitcher ? ScreenCapture.enableAppSwitcherProtectionAsync(0.9) : ScreenCapture.disableAppSwitcherProtectionAsync()).catch(() => {});
}

let wentAway = 0;
/** Call once at start: auto-lock timer + privacy cover while the app is in the switcher. */
export function initLock() {
  const st = useLock.getState();
  applyCapture(st);
  if (st.passcode) useLock.setState({ locked: true });
  AppState.addEventListener('change', (a) => {
    const s = useLock.getState();
    if (a === 'inactive' || a === 'background') {
      if (!wentAway) wentAway = Date.now();
      if (s.hideSwitcher) useLock.setState({ covered: true });
    } else if (a === 'active') {
      const away = wentAway ? Date.now() - wentAway : 0;
      wentAway = 0;
      useLock.setState({ covered: false, locked: s.locked || (s.passcode && away >= s.autoLock * 60_000 && away > 800) });
    }
  });
}
