import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { cache } from './db';

/**
 * Stale-while-revalidate: the screen renders the copy saved on the device instantly,
 * then refreshes it from the server in the background and saves the new copy.
 */
export function useCached<T = any>(path: string | null, deps: any[] = []): [T | undefined, (v: T) => void, () => Promise<void>] {
  const key = path ? `api:${path}` : '';
  const [data, setData] = useState<T | undefined>(() => (key ? cache.get<T>(key) : undefined));
  const reload = useCallback(async () => {
    if (!path) return;
    try { const d = await api<T>(path); setData(d); cache.set(key, d); } catch {}
  }, [path]);
  useEffect(() => { if (key) setData(cache.get<T>(key)); reload(); }, [path, ...deps]);
  const set = (v: T) => { setData(v); if (key) cache.set(key, v); };
  return [data, set, reload];
}
