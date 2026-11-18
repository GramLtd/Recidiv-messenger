import { deleteMessageFiles } from '../security.js';
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

// emoji status with optional text and expiry («🎧 слушаю музыку · до 18:00»)
r.post('/me/status', (req, res) => {
  const emoji = req.body.emoji ? String(req.body.emoji).trim().slice(0, 16) : null;
  const text = emoji && req.body.text ? String(req.body.text).trim().slice(0, 70) : null;
  const until = emoji && Number(req.body.until) > Date.now() ? Math.min(Number(req.body.until), Date.now() + 366 * 86400_000) : null;
  db.prepare('UPDATE users SET emoji_status = ?, status_text = ?, status_until = ? WHERE id = ?').run(emoji, text, until, req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
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

/** Blurred profile background: from the avatar, the banner, a custom picture, or off. */
r.post('/me/blur-bg', (req, res) => {
  const mode = ['avatar', 'banner', 'custom', 'off'].includes(req.body?.mode) ? req.body.mode : 'avatar';
  let url = null;
  if (mode === 'custom') {
    url = safeUploadUrl(req.body.url);
    if (!url || !/\.(jpe?g|png|webp|gif|avif)$/i.test(url)) fail(400, 'Выберите картинку');
    if (uploadedSize(url) > MAX_BANNER) fail(400, 'Картинка должна весить не больше 10 МБ');
  }
  db.prepare('UPDATE users SET blur_bg = ? WHERE id = ?').run(JSON.stringify(url ? { mode, url } : { mode }), req.user.id);
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
    subPrice: u.sub_price || 0,
    subscribedUntil: db.prepare('SELECT until FROM subscriptions WHERE subscriber_id = ? AND author_id = ? AND until > ?').get(req.user.id, u.id, now())?.until || null,
    subscribers: u.id === req.user.id ? db.prepare('SELECT COUNT(*) n FROM subscriptions WHERE author_id = ? AND until > ?').get(u.id, now()).n : undefined,
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

/** Info card for a collectible username: who owns it and how it was acquired. */
r.get('/usernames/:name/info', (req, res) => {
  const name = String(req.params.name).replace(/^@/, '').toLowerCase();
  const row = db.prepare('SELECT * FROM usernames WHERE name = ?').get(name);
  if (!row) fail(404, 'Юзернейм не найден');
  const sale = db.prepare("SELECT price, closed_at FROM listings WHERE kind = 'username' AND status = 'sold' AND lower(username) = ? ORDER BY closed_at DESC LIMIT 1").get(name);
  const owner = row.user_id ? getUser(row.user_id) : null;
  res.json({
    name: row.display,
    owner: owner ? { id: owner.id, displayName: owner.display_name, avatar: owner.avatar } : null,
    chatId: row.chat_id || null,
    acquiredAt: sale?.closed_at || row.created_at,
    purchase: sale ? { price: sale.price, at: sale.closed_at } : null,
    listed: !!db.prepare("SELECT 1 FROM listings WHERE kind = 'username' AND status = 'active' AND lower(username) = ?").get(name),
  });
});

/** Resolve @name to a user or a public chat. */
r.get('/resolve/:name', (req, res) => {
  const row = db.prepare('SELECT * FROM usernames WHERE name = ?').get(String(req.params.name).replace(/^@/, '').toLowerCase());
  if (!row) fail(404, 'Не найдено');
  if (row.user_id) return res.json({ user: publicUser(getUser(row.user_id)) });
  res.json({ chat: serializeChat(row.chat_id, req.user.id) });
});

/**
 * Delete my account for good: messages, posts, comments, stories, files, usernames, contacts, sessions and
 * wallets are wiped; the profile becomes «Удалённый аккаунт» and can never log in again (the seed hash is erased).
 */
r.delete('/me', (req, res) => {
  if (String(req.body?.confirm || '') !== 'УДАЛИТЬ') fail(400, 'Подтвердите удаление словом УДАЛИТЬ');
  const uid = req.user.id;
  if (req.user.is_admin) fail(400, 'Администратор не может удалить аккаунт из приложения');
  const media = db.prepare('SELECT media FROM messages WHERE sender_id = ? AND media IS NOT NULL').all(uid);
  tx(() => {
    db.prepare('DELETE FROM reactions WHERE user_id = ?').run(uid);
    db.prepare("UPDATE messages SET deleted = 1, text = '', media = NULL, expires_at = NULL WHERE sender_id = ?").run(uid);
    db.prepare('DELETE FROM post_comments WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM posts WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM story_views WHERE user_id = ? OR story_id IN (SELECT id FROM stories WHERE user_id = ?)').run(uid, uid);
    db.prepare('DELETE FROM stories WHERE user_id = ?').run(uid);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
    for (const t of ['contacts', 'blocks']) db.prepare(`DELETE FROM ${t} WHERE user_id = ? OR ${t === 'contacts' ? 'contact_id' : 'blocked_id'} = ?`).run(uid, uid);
    db.prepare('DELETE FROM follows WHERE follower_id = ? OR followee_id = ?').run(uid, uid);
    db.prepare('DELETE FROM profile_views WHERE viewer_id = ? OR user_id = ?').run(uid, uid);
    db.prepare("UPDATE listings SET status = 'cancelled' WHERE seller_id = ? AND status = 'active'").run(uid);
    db.prepare('DELETE FROM usernames WHERE user_id = ?').run(uid);
    db.prepare('UPDATE user_gifts SET hidden = 1, pinned = 0 WHERE owner_id = ?').run(uid);
    try { db.prepare('DELETE FROM user_wallets WHERE user_id = ?').run(uid); } catch {}
    db.prepare(`UPDATE users SET email = NULL, auth_hash = NULL, display_name = 'Удалённый аккаунт', bio = '', avatar = NULL, username = NULL,
      banner = NULL, banner_type = NULL, links = NULL, location = NULL, anon_number = NULL, e2e_key = NULL, wallpaper = NULL, name_style = NULL,
      profile_bg = NULL, blur_bg = NULL, privacy = NULL, worn_gift_id = NULL, profile_track_id = NULL, personal_channel_id = NULL,
      emoji_status = NULL, balance = 0, is_banned = 1, deleted_at = ? WHERE id = ?`).run(Date.now(), uid);
  });
  for (const m of media) deleteMessageFiles(m.media);
  res.json({ ok: true });
});

export default r;
