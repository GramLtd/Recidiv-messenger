import { API_URL } from './config';
import { secret } from './kv';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Real model + OS for «Устройства» (e.g. "iPhone 15 Pro · iOS 18.1"). */
const DEVICE = `${Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android')}, ${Device.osName || Platform.OS} ${Device.osVersion || ''}`.replace(/[^\x20-\x7e]/g, '').trim();

let token: string | null = null;
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
export async function loadToken() { token = await secret.get('token'); return token; }
export async function saveToken(t: string | null) { token = t; if (t) await secret.set('token', t); else await secret.del('token'); }
export const getToken = () => token;

/** REST client. All requests go through the OS network stack, so the in-app proxy applies to them. */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'X-Device': DEVICE, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new Error((data as any).error || `Ошибка ${res.status}`);
  }
  return data as T;
}
api.patch = <T = any>(p: string, body: unknown) => api<T>(p, { method: 'PATCH', body });
api.del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });

export async function upload(uri: string, name: string, type: string) {
  return postFile<{ url: string; kind: string }>('/upload', uri, name, type);
}

/** multipart POST of one local file (uri) to an API path */
export async function postFile<T = any>(path: string, uri: string, name: string, type: string): Promise<T> {
  const form = new FormData();
  form.append('file', { uri, name, type } as any);
  const res = await fetch(`${API_URL}/api${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'X-Device': DEVICE }, body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data as T;
}
