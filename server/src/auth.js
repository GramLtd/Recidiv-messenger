import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';

export function signToken(userId) {
  return jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '90d' });
}

export function verifyToken(token) {
  try {
    const { uid } = jwt.verify(token, config.jwtSecret);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    if (!user || user.is_banned) return null;
    return user;
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
  const user = token && verifyToken(token);
  if (!user) return next(new HttpError(401, 'Требуется авторизация'));
  req.user = user;
  next();
}

export function requireAdmin(req, _res, next) {
  if (!req.user?.is_admin) return next(new HttpError(403, 'Только для администраторов'));
  next();
}
