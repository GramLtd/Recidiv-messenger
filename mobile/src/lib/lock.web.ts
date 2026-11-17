import { create } from 'zustand';
type S = { passcode: boolean; bio: boolean; autoLock: number; hideSwitcher: boolean; noScreenshots: boolean; e2eDefault: boolean; locked: boolean; covered: boolean; set: (p: any) => void; lock: () => void; unlock: () => void };
export const useLock = create<S>((set) => ({ passcode: false, bio: false, autoLock: 0, hideSwitcher: true, noScreenshots: false, e2eDefault: true, locked: false, covered: false, set: (p) => set(p), lock: () => {}, unlock: () => set({ locked: false }) }));
export async function setPasscode(_c: string) { useLock.getState().set({ passcode: true }); }
export async function clearPasscode() { useLock.getState().set({ passcode: false }); }
export async function checkPasscode(_c: string) { return true; }
export async function biometricsAvailable() { return false; }
export async function tryBiometrics() { return false; }
export function initLock() {}
