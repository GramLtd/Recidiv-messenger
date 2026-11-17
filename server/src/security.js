import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import { config } from './config.js';

/*
 * Privacy & protection layer:
 *  - security headers on every response, no X-Powered-By
 *  - simple per-IP rate limits for auth and uploads (IPs live only in memory, never on disk)
 *  - metadata stripping for uploaded photos (EXIF / GPS / XMP / comments)
 *  - hard deletion of uploaded files that belonged to deleted / expired messages
 *  - disappearing messages sweeper
 */

export function securityHeaders(req, res, next) {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(), interest-cohort=(), browsing-topics=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/** Fixed-window limiter; counters are kept in memory only. */
export function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const k = key(req);
    const n = (hits.get(k) || 0) + 1;
    hits.set(k, n);
    if (n > max) return res.status(429).json({ error: 'Слишком много запросов, попробуйте позже' });
    next();
  };
}

// ---------- metadata stripping ----------
function stripJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // start of scan: copy the rest
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    // drop APP1 (EXIF/XMP, incl. GPS), APP2–APP15 except ICC (APP2 "ICC_PROFILE"), and COM comments
    const isApp = marker >= 0xe1 && marker <= 0xef;
    const isIcc = marker === 0xe2 && seg.subarray(4, 15).toString('latin1') === 'ICC_PROFILE';
    if (!(isApp && !isIcc) && marker !== 0xfe) out.push(seg);
    i += 2 + len;
  }
  return null;
}
function stripPng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(sig)) return null;
  const out = [sig];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const chunk = buf.subarray(i, i + 12 + len);
    if (!['tEXt', 'iTXt', 'zTXt', 'eXIf', 'tIME'].includes(type)) out.push(chunk);
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}
function stripWebp(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'RIFF' || buf.subarray(8, 12).toString('latin1') !== 'WEBP') return null;
  const out = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.subarray(i, i + 4).toString('latin1');
    const len = buf.readUInt32LE(i + 4);
    const total = 8 + len + (len & 1);
    let chunk = buf.subarray(i, i + total);
    if (type === 'VP8X') { chunk = Buffer.from(chunk); chunk[8] &= ~(0x08 | 0x04); } // clear EXIF + XMP flags
    if (type !== 'EXIF' && type !== 'XMP ') out.push(chunk);
    i += total;
  }
  const body = Buffer.concat(out);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}
/** Remove EXIF/GPS/XMP/comments from an uploaded image in place (best effort, never breaks the file). */
export function stripImageMetadata(file) {
  try {
    const buf = fs.readFileSync(file);
    const clean = stripJpeg(buf) || stripPng(buf) || stripWebp(buf);
    if (clean && clean.length > 0 && clean.length <= buf.length) fs.writeFileSync(file, clean);
  } catch {}
}

// ---------- hard deletion ----------
function uploadPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const p = path.join(config.uploadDir, path.basename(url));
  return p.startsWith(path.resolve(config.uploadDir)) ? p : null;
}
/** Delete the files of a message's media (and its preview) unless another message still uses them. */
export function deleteMessageFiles(mediaJson) {
  let m = null;
  try { m = typeof mediaJson === 'string' ? JSON.parse(mediaJson) : mediaJson; } catch {}
  if (!m) return;
  for (const url of [m.url, m.preview]) {
    const p = uploadPath(url);
    if (!p) continue;
    const used = db.prepare("SELECT COUNT(*) c FROM messages WHERE media LIKE ? AND deleted = 0").get(`%${path.basename(p)}%`).c;
    if (!used) fs.promises.unlink(p).catch(() => {});
  }
}

export const AUTO_DELETE = [0, 3600, 86400, 7 * 86400, 30 * 86400];
export const autoDeleteLabel = (s) => ({ 0: 'выключено', 3600: '1 час', 86400: '1 день', 604800: '1 неделя', 2592000: '1 месяц' })[s] || `${s} с`;

/** Disappearing messages: wipe expired ones completely (row, reactions, files) and tell the clients. */
export function startExpirySweeper(emitToChat) {
  const tick = () => {
    const rows = db.prepare('SELECT id, chat_id, media FROM messages WHERE expires_at IS NOT NULL AND expires_at <= ? LIMIT 500').all(Date.now());
    for (const r of rows) {
      db.prepare('DELETE FROM reactions WHERE message_id = ?').run(r.id);
      db.prepare("UPDATE messages SET deleted = 1, text = '', media = NULL, expires_at = NULL WHERE id = ?").run(r.id);
      deleteMessageFiles(r.media);
      emitToChat(r.chat_id, 'message:delete', { chatId: r.chat_id, messageId: r.id });
    }
  };
  setInterval(tick, 30_000).unref();
  tick();
}
