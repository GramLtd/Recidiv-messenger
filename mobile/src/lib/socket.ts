import { io, Socket } from 'socket.io-client';
import { API_URL } from './config';
import { getToken } from './api';
import { kv } from './db';

/**
 * Realtime layer (socket.io over WebSocket). When an HTTP/SOCKS proxy is enabled we fall back to long-polling:
 * polling goes through the OS HTTP stack, which honours the proxy; native WebSockets do not on iOS.
 */
let socket: Socket | null = null;
type Handler = (payload: any) => void;
const handlers = new Map<string, Set<Handler>>();

export function connect() {
  socket?.disconnect();
  const proxy = kv.get<{ enabled?: boolean }>('proxy', {});
  socket = io(API_URL, { auth: { token: getToken() }, transports: proxy.enabled ? ['polling'] : ['websocket', 'polling'], reconnectionDelayMax: 8000 });
  for (const [ev, set] of handlers) for (const h of set) socket.on(ev, h);
  return socket;
}
export const disconnect = () => { socket?.disconnect(); socket = null; };
export function on(ev: string, h: Handler) {
  if (!handlers.has(ev)) handlers.set(ev, new Set());
  handlers.get(ev)!.add(h);
  socket?.on(ev, h);
  return () => { handlers.get(ev)?.delete(h); socket?.off(ev, h); };
}
export const emit = (ev: string, payload?: unknown) => socket?.emit(ev, payload);
