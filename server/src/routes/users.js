import { Router } from 'express';
import { db, getSetting, tx } from '../db.js';
import { fail } from '../auth.js';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { isPremium, isContact, isBlocked, privacyOf } from '../privacy.js';
import { meUser, publicUser, getUser, assertUsernameFree, changeBalance, pushBalance, serializeChat, now, safeUploadUrl, normalizeLink, LINK_KINDS } from '../services.js';

const r = Router();

r.patch('/me', (req, res) => {
  const { displayName, bio, avatar, emojiStatus } = req.body;
  const u = req.user;
  const name = displayName !== undefined ? String(displayName).trim().slice(0, 64) : u.display_name;
  if (!name) fail(400, 'Имя не может быть пустым');
  db.prepare('UPDATE users SET display_name = ?, bio = ?, avatar = ?, emoji_status = ? WHERE id = ?').run(
    name,
    bio !== undefined ? String(bio).slice(0, 200) : u.bio,
    avatar !== undefined ? (() => { const a = safeUploadUrl(avatar); if (a && /\.gif$/i.test(a) && !isPremium(u)) fail(403, 'Живая аватарка (GIF) — с Premium'); return a; })() : u.avatar,
    emojiStatus !== undefined ? (emojiStatus ? String(emojiStatus).slice(0, 16) : null) : u.emoji_status,
    u.id,
  );
  res.json({ user: meUser(getUser(u.id)) });
});

const MAX_BANNER = 10 * 1024 * 1024;
const uploadedSize = (url) => {
  try { return fs.statSync(path.join(config.uploadDir, path.basename(url))).size; } catch { return -1; }
};

/** Profile banner: an image or a short video (≤5 s — checked by the client, ≤10 MB — checked here). */
r.post('/me/banner', (req, res) => {
  const url = req.body.url ? safeUploadUrl(req.body.url) : null;
  let type = null;
  if (url) {
    const size = uploadedSize(url);
    if (size < 0) fail(400, 'Файл не найден');
    if (size > MAX_BANNER) fail(400, 'Баннер должен весить не больше 10 МБ');
    type = /\.(mp4|webm|mov|m4v)$/i.test(url) ? 'video' : /\.(jpe?g|png|webp|gif|avif)$/i.test(url) ? 'image' : null;
    if (!type) fail(400, 'Баннер — это картинка, GIF или видео');
    if (req.body.duration && Number(req.body.duration) > 5.5) fail(400, 'Видео-баннер — не длиннее 5 секунд');
  }
  db.prepare('UPDATE users SET banner = ?, banner_type = ? WHERE id = ?').run(url, type, req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
});

r.post('/me/links', (req, res) => {
  const links = {};
  for (const k of LINK_KINDS) {
    const v = normalizeLink(k, req.body?.[k]);
    if (v) links[k] = v;
  }
  db.prepare('UPDATE users SET links = ? WHERE id = ?').run(Object.keys(links).length ? JSON.stringify(links) : null, req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
});

/** Chat wallpaper (synced between devices): a preset id or an uploaded image / video. */
r.post('/me/wallpaper', (req, res) => {
  const b = req.body || {};
  let wp = null;
  if (b.url) {
    const url = safeUploadUrl(b.url);
    if (uploadedSize(url) > 20 * 1024 * 1024) fail(400, 'Обои должны весить не больше 20 МБ');
    wp = { url, type: /\.(mp4|webm|mov|m4v)$/i.test(url) ? 'video' : 'image' };
  } else if (b.preset) {
    wp = { preset: String(b.preset).replace(/[^a-z0-9-]/gi, '').slice(0, 32) };
  }
  if (wp) {
    wp.dim = Math.max(0, Math.min(0.8, Number(b.dim ?? 0.25)));
    wp.blur = Math.max(0, Math.min(20, Number(b.blur ?? 0)));
  }
  db.prepare('UPDATE users SET wallpaper = ? WHERE id = ?').run(wp ? JSON.stringify(wp) : null, req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
});

// ----- usernames (collectible) -----
r.get('/me/usernames', (req, res) => {
  const rows = db.prepare('SELECT display, created_at FROM usernames WHERE user_id = ? ORDER BY created_at').all(req.user.id);
  const listed = new Set(
    db.prepare("SELECT username FROM listings WHERE kind = 'username' AND status = 'active' AND seller_id = ?").all(req.user.id).map((x) => x.username.toLowerCase()),
  );
  res.json({
    usernames: rows.map((x) => ({ name: x.display, active: x.display === req.user.username, listed: listed.has(x.display.toLowerCase()), createdAt: x.created_at })),
    claimPrice: Number(getSetting('username_price') || 0),
  });
});

r.post('/me/usernames', (req, res) => {
  const name = String(req.body.name || '').trim();
  assertUsernameFree(name);
  const price = Number(getSetting('username_price') || 0);
  tx(() => {
    if (price > 0) changeBalance(req.user.id, -price, 'username', `Юзернейм @${name}`);
    db.prepare('INSERT INTO usernames (name, display, user_id, created_at) VALUES (?, ?, ?, ?)').run(name.toLowerCase(), name, req.user.id, now());
    if (!req.user.username) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(name, req.user.id);
  });
  if (price > 0) pushBalance(req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
});

r.post('/me/usernames/active', (req, res) => {
  const name = req.body.name ? String(req.body.name) : null;
  if (name) {
    const row = db.prepare('SELECT display FROM usernames WHERE name = ? AND user_id = ?').get(name.toLowerCase(), req.user.id);
    if (!row) fail(404, 'Вы не владеете этим юзернеймом');
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(row.display, req.user.id);
  } else db.prepare('UPDATE users SET username = NULL WHERE id = ?').run(req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
});

r.get('/users/search', (req, res) => {
  const q = String(req.query.q || '').trim().replace(/^@/, '');
  if (q.length < 2) return res.json({ users: [], chats: [] });
  const like = `%${q}%`;
  const users = db
    .prepare(
      `SELECT DISTINCT u.* FROM users u LEFT JOIN usernames n ON n.user_id = u.id
       WHERE u.is_banned = 0 AND (u.display_name LIKE ? OR n.name LIKE ?) LIMIT 20`,
    )
    .all(like, like.toLowerCase());
  const chats = db
    .prepare(
      `SELECT c.* FROM chats c LEFT JOIN usernames n ON n.chat_id = c.id
       WHERE c.is_public = 1 AND c.type IN ('group','channel') AND (c.title LIKE ? OR n.name LIKE ?) LIMIT 20`,
    )
    .all(like, like.toLowerCase());
  res.json({ users: users.map(publicUser), chats: chats.map((c) => serializeChat(c, req.user.id)) });
});

r.get('/users/:id', (req, res) => {
  let u = getUser(Number(req.params.id));
  if (!u) fail(404, 'Пользователь не найден');
  if (u.id !== req.user.id) {
    db.prepare('UPDATE users SET profile_views = profile_views + 1 WHERE id = ?').run(u.id);
    if (privacyOf(req.user).profileViews !== false) {
      db.prepare('INSERT INTO profile_views (viewer_id, user_id, viewed_at) VALUES (?, ?, ?) ON CONFLICT(viewer_id, user_id) DO UPDATE SET viewed_at = excluded.viewed_at').run(req.user.id, u.id, now());
    }
    u = getUser(u.id);
  }
  const social = {
    followers: db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id = ?').get(u.id).c,
    following: db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(u.id).c,
    postsCount: db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id = ? AND deleted = 0').get(u.id).c,
    isFollowing: !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(req.user.id, u.id),
    isContact: isContact(req.user.id, u.id),
    isBlocked: isBlocked(req.user.id, u.id),
    blockedMe: isBlocked(u.id, req.user.id),
    premiumUntil: u.id === req.user.id ? u.premium_until || null : undefined,
  };
  const giftsCount = db.prepare('SELECT COUNT(*) c FROM user_gifts WHERE owner_id = ? AND converted = 0 AND hidden = 0').get(u.id).c;
  const usernames = db.prepare('SELECT display FROM usernames WHERE user_id = ? AND display != ?').all(u.id, u.username || '').map((x) => x.display);
  const track = u.profile_track_id && db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(u.profile_track_id, u.id);
  const channel = u.personal_channel_id && db.prepare("SELECT * FROM chats WHERE id = ? AND type = 'channel'").get(u.personal_channel_id);
  const storiesCount = db.prepare('SELECT COUNT(*) c FROM stories WHERE user_id = ? AND expires_at > ?').get(u.id, now()).c;
  res.json({
    user: {
      ...publicUser(u),
      giftsCount,
      storiesCount,
      otherUsernames: usernames,
      createdAt: u.created_at,
      code: 100000 + u.id,
      profileViews: u.profile_views,
      profileTrack: track ? { id: track.id, url: track.url, title: track.title, artist: track.artist, duration: track.duration, cover: track.cover } : null,
      personalChannel: channel ? serializeChat(channel, req.user.id) : null,
      ...social,
    },
  });
});

r.get('/users/:id/stories', (req, res) => {
  const rows = db.prepare('SELECT * FROM stories WHERE user_id = ? AND expires_at > ? ORDER BY id DESC').all(Number(req.params.id), now());
  res.json({ stories: rows.map((s) => ({ id: s.id, media: s.media, mediaType: s.media_type, caption: s.caption, bg: s.bg, createdAt: s.created_at })) });
});

r.post('/me/profile-track', (req, res) => {
  const id = req.body.trackId ? Number(req.body.trackId) : null;
  if (id && !db.prepare('SELECT 1 FROM tracks WHERE id = ? AND user_id = ?').get(id, req.user.id)) fail(404, 'Трек не найден');
  db.prepare('UPDATE users SET profile_track_id = ? WHERE id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

r.post('/me/personal-channel', (req, res) => {
  const id = req.body.chatId ? Number(req.body.chatId) : null;
  if (id && !db.prepare("SELECT 1 FROM chats c JOIN chat_members m ON m.chat_id = c.id WHERE c.id = ? AND c.type = 'channel' AND m.user_id = ? AND m.role = 'owner'").get(id, req.user.id)) {
    fail(403, 'Можно выбрать только свой канал');
  }
  db.prepare('UPDATE users SET personal_channel_id = ? WHERE id = ?').run(id, req.user.id);
  res.json({ ok: true });
});

/** Resolve @name to a user or a public chat. */
r.get('/resolve/:name', (req, res) => {
  const row = db.prepare('SELECT * FROM usernames WHERE name = ?').get(String(req.params.name).replace(/^@/, '').toLowerCase());
  if (!row) fail(404, 'Не найдено');
  if (row.user_id) return res.json({ user: publicUser(getUser(row.user_id)) });
  res.json({ chat: serializeChat(row.chat_id, req.user.id) });
});

export default r;
