import { useEffect, useState } from 'react';
export function useNow(ms = 1000) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return t;
}
export function left(ms: number) {
  if (ms <= 0) return 'завершён';
  const s = Math.floor(ms / 1000); const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (d) return `${d} д ${h} ч`;
  if (h) return `${h} ч ${m} мин`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
