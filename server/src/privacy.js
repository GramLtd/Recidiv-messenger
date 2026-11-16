import { db } from './db.js';

/** Privacy & premium helpers shared by serializers, realtime and routes. */
export const parseJson = (v, d) => {
  try { return v ? JSON.parse(v) : d; } catch { return d; }
};
export const DEFAULT_PRIVACY = { lastSeen: 'everyone', messages: 'everyone', messagePrice: 0, profileViews: true };
export const privacyOf = (u) => ({ ...DEFAULT_PRIVACY, ...parseJson(u?.privacy, {}) });
export const isPremium = (u) => !!u && Number(u.premium_until || 0) > Date.now();

export const isContact = (ownerId, otherId) => !!db.prepare('SELECT 1 FROM contacts WHERE user_id = ? AND contact_id = ?').get(ownerId, otherId);
export const isBlocked = (ownerId, otherId) => !!db.prepare('SELECT 1 FROM blocks WHERE user_id = ? AND blocked_id = ?').get(ownerId, otherId);

/**
 * Telegram-like rule: you see someone's last-seen time if their setting allows you, and — unless you
 * have Premium — only if you show yours too.
 */
export function canSeeLastSeen(target, viewer) {
  if (!target || !viewer || target.id === viewer.id) return true;
  if (target.is_bot) return true;
  const p = privacyOf(target);
  const allowed = p.lastSeen === 'everyone' || (p.lastSeen === 'contacts' && isContact(target.id, viewer.id));
  if (!allowed) return false;
  if (isPremium(viewer)) return true;
  return privacyOf(viewer).lastSeen !== 'nobody';
}
