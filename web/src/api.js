const TOKEN_KEY = 'recidivist.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

// For native wrappers (Capacitor / Electron) set VITE_API_URL to the server origin.
export const API_ORIGIN = import.meta.env.VITE_API_URL || '';

// Public origin used for share links (location.origin is capacitor://localhost / app://… inside native wrappers).
export const PUBLIC_ORIGIN = API_ORIGIN || location.origin;
// True when running inside a native wrapper build (Capacitor / Electron).
export const IS_APP = !!API_ORIGIN && API_ORIGIN !== location.origin;

export const mediaUrl = (u) => (!u ? u : u.startsWith('/') ? API_ORIGIN + u : u);

export async function api(path, { method, body, signal } = {}) {
  const token = getToken();
  const res = await fetch(`${API_ORIGIN}/api${path}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('recidivist:logout'));
    throw new Error(data.error || `Ошибка ${res.status}`);
  }
  return data;
}

api.del = (path) => api(path, { method: 'DELETE' });
api.patch = (path, body) => api(path, { method: 'PATCH', body });
api.put = (path, body) => api(path, { method: 'PUT', body });

export function upload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_ORIGIN}/api/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || '{}');
      xhr.status < 300 ? resolve(data) : reject(new Error(data.error || 'Ошибка загрузки'));
    };
    xhr.onerror = () => reject(new Error('Сеть недоступна'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}
