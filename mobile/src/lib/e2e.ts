import 'react-native-get-random-values';
import { x25519 } from '@noble/curves/ed25519.js';
import { xsalsa20poly1305 } from '@noble/ciphers/salsa.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes, utf8ToBytes, randomBytes } from '@noble/hashes/utils.js';
import { secret } from './kv';
import { api } from './api';

/**
 * End-to-end encryption for private chats.
 * Each user has an X25519 key pair derived from the seed phrase (so it is the same on every device);
 * the server stores only public keys. Message key = SHA-256(X25519(mine, theirs)), cipher = XSalsa20-Poly1305.
 */
const b64 = {
  enc: (u: Uint8Array) => { let s = ''; u.forEach((b) => (s += String.fromCharCode(b))); return globalThis.btoa(s); },
  dec: (s: string) => Uint8Array.from(globalThis.atob(s), (c) => c.charCodeAt(0)),
};

let priv: Uint8Array | null = null;
const peerKeys = new Map<number, Uint8Array | null>();

export async function initE2E(e2eSecretHex?: string) {
  if (e2eSecretHex) await secret.set('e2e', e2eSecretHex);
  const hex = e2eSecretHex || (await secret.get('e2e'));
  if (!hex) return false;
  priv = hexToBytes(hex);
  const pub = x25519.getPublicKey(priv);
  api('/me/e2e-key', { method: 'PUT', body: { publicKey: b64.enc(pub) } }).catch(() => {});
  return true;
}
export const e2eReady = () => !!priv;

async function peerKey(userId: number) {
  if (!peerKeys.has(userId)) {
    const r = await api<{ publicKey: string | null }>(`/users/${userId}/e2e-key`).catch(() => ({ publicKey: null }));
    peerKeys.set(userId, r.publicKey ? b64.dec(r.publicKey) : null);
  }
  return peerKeys.get(userId) || null;
}
const sharedKey = (theirs: Uint8Array) => sha256(x25519.getSharedSecret(priv!, theirs));

export async function canEncryptTo(userId: number) { return !!priv && !!(await peerKey(userId)); }

export async function encryptFor(userId: number, text: string) {
  const theirs = await peerKey(userId);
  if (!priv || !theirs) throw new Error('У собеседника ещё нет ключа шифрования — он должен войти в приложение');
  const nonce = randomBytes(24);
  const c = xsalsa20poly1305(sharedKey(theirs), nonce).encrypt(utf8ToBytes(text));
  return { n: b64.enc(nonce), c: b64.enc(c) };
}

const plainCache = new Map<number, string>();
export async function decryptFrom(msgId: number, otherUserId: number, media: { n: string; c: string }) {
  if (plainCache.has(msgId)) return plainCache.get(msgId)!;
  const theirs = await peerKey(otherUserId);
  if (!priv || !theirs) return null;
  try {
    const p = xsalsa20poly1305(sharedKey(theirs), b64.dec(media.n)).decrypt(b64.dec(media.c));
    const s = new TextDecoder().decode(p);
    plainCache.set(msgId, s);
    return s;
  } catch { return null; }
}
