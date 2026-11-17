import { create } from 'zustand';
import { AccessibilityInfo } from 'react-native';
import { kv } from './db';

/** Performance mode: fewer/lighter effects (no blur, no particles, no looping animations). */
type Perf = { low: boolean; setLow: (v: boolean) => void };
export const usePerf = create<Perf>((set) => ({
  low: kv.get('perf.low', false),
  setLow: (low) => { kv.set('perf.low', low); set({ low }); },
}));
AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (r && kv.get('perf.low', null) === null) usePerf.getState().setLow(true); }).catch(() => {});
