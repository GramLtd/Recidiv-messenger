import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config.js';
import { db } from './db.js';

/** Who is making the current request (lets serializers apply privacy rules). */
export const requestContext = new AsyncLocalStorage();
export const currentViewer = () => requestContext.getStore()?.user || null;

function deviceName(ua = '') {
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Устройство';
  const br = /Edg\//.test(ua) ? 'Edge' : /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'браузер';
  return `${br}, ${os}`;
}

/** The native app sends its real model / OS in X-Device (e.g. "iPhone 15 Pro · iOS 18.1"). */
function appDevice(req) {
  const d = String(req?.headers?.['x-device'] || '').replace(/[^\p{L}\p{N} .,·()_+-]/gu, '').trim().slice(0, 64);
  return d ? `Recidivist · ${d}` : '';
}

/** Every login is a session the user can see and terminate in «Устройства». */
export function signToken(userId, req) {
  const sid = crypto.randomBytes(16).toString('hex');
  const ts = Date.now();
  db.prepare('INSERT INTO sessions (id, user_id, device, ip, created_at, last_active) VALUES (?, ?, ?, ?, ?, ?)').run(
    sid, userId, appDevice(req) || deviceName(req?.headers?.['user-agent'] || ''), null, ts, ts, // no IP addresses are stored
  );
  return jwt.sign({ uid: userId, sid }, config.jwtSecret, { expiresIn: '90d' });
}

const touched = new Map();
export function verifyToken(token, withSession = false) {
  try {
    const { uid, sid, iat } = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    if (!user || user.is_banned) return null;
    if (sid) {
      if (!db.prepare('SELECT 1 FROM sessions WHERE id = ? AND user_id = ?').get(sid, uid)) return null;
      if ((touched.get(sid) || 0) < Date.now() - 60_000) {
        touched.set(sid, Date.now());
        db.prepare('UPDATE sessions SET last_active = ? WHERE id = ?').run(Date.now(), sid);
      }
    } else if (user.sessions_after && iat * 1000 < user.sessions_after) return null; // legacy token, revoked
    return withSession ? { user, sid: sid || null } : user;
  } catch {
    return null;
  }
}

/** The client derives `authKey` from the seed phrase; the server only ever stores a hash of it. */
export function hashAuthKey(authKey) {
  return crypto.createHash('sha256').update(`recidivist:${authKey}`).digest('hex');
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const fail = (status, message) => {
  throw new HttpError(status, message);
};

export function requireAuth(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const v = token && verifyToken(token, true);
  if (!v) return next(new HttpError(401, 'Требуется авторизация'));
  req.user = v.user;
  req.sid = v.sid;
  // older app sessions were recorded with a generic name — correct it once the app reports its device
  const dev = v.sid && appDevice(req);
  if (dev && !touched.has(`d:${v.sid}`)) {
    touched.set(`d:${v.sid}`, 1);
    db.prepare('UPDATE sessions SET device = ? WHERE id = ? AND device != ?').run(dev, v.sid, dev);
  }
  requestContext.run({ user: v.user }, next);
}

export function requireAdmin(req, _res, next) {
  if (!req.user?.is_admin) return next(new HttpError(403, 'Только для администраторов'));
  next();
}
