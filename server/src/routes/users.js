import { Router } from 'express';
import { db, getSetting, tx } from '../db.js';
import { fail } from '../auth.js';
import { meUser, publicUser, getUser, assertUsernameFree, changeBalance, pushBalance, serializeChat, now, safeUploadUrl } from '../services.js';

const r = Router();

r.patch('/me', (req, res) => {
  const { displayName, bio, avatar, emojiStatus } = req.body;
  const u = req.user;
  const name = displayName !== undefined ? String(displayName).trim().slice(0, 64) : u.display_name;
  if (!name) fail(400, 'Имя не может быть пустым');
  db.prepare('UPDATE users SET display_name = ?, bio = ?, avatar = ?, emoji_status = ? WHERE id = ?').run(
    name,
    bio !== undefined ? String(bio).slice(0, 200) : u.bio,
    avatar !== undefined ? safeUploadUrl(avatar) : u.avatar,
    emojiStatus !== undefined ? (emojiStatus ? String(emojiStatus).slice(0, 16) : null) : u.emoji_status,
    u.id,
  );
  res.json({ user: meUser(getUser(u.id)) });
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

function badgesFor(u) {
  const b = [];
  const collectibles = db.prepare('SELECT COUNT(*) c FROM user_gifts WHERE owner_id = ? AND upgraded_at IS NOT NULL').get(u.id).c;
  const gifts = db.prepare('SELECT COUNT(*) c FROM user_gifts WHERE owner_id = ? AND converted = 0').get(u.id).c;
  const tracks = db.prepare('SELECT COUNT(*) c FROM tracks WHERE user_id = ?').get(u.id).c;
  const sales = db.prepare("SELECT COUNT(*) c FROM listings WHERE seller_id = ? AND status = 'sold'").get(u.id).c;
  const channels = db.prepare("SELECT COUNT(*) c FROM chats WHERE owner_id = ? AND type = 'channel'").get(u.id).c;
  if (u.is_admin) b.push({ id: 'admin', emoji: '🛡️', title: 'Администрация Recidivist' });
  if (u.verified) b.push({ id: 'verified', emoji: '💎', title: 'Верифицированный аккаунт' });
  if (u.id <= 1000) b.push({ id: 'early', emoji: '🌟', title: 'Один из первых 1000 пользователей' });
  if (collectibles >= 1) b.push({ id: 'collector', emoji: collectibles >= 10 ? '👑' : '🏆', title: `Коллекционер: ${collectibles} коллекционных` });
  if (gifts >= 10) b.push({ id: 'gifts', emoji: '🎁', title: `${gifts} подарков` });
  if (sales >= 1) b.push({ id: 'trader', emoji: '💰', title: `Трейдер: ${sales} продаж на маркете` });
  if (tracks >= 5) b.push({ id: 'music', emoji: '🎧', title: 'Меломан' });
  if (channels >= 1) b.push({ id: 'author', emoji: '📰', title: 'Автор канала' });
  if (u.profile_views >= 1000) b.push({ id: 'popular', emoji: '🔥', title: 'Популярный профиль' });
  return b;
}

r.get('/users/:id', (req, res) => {
  let u = getUser(Number(req.params.id));
  if (!u) fail(404, 'Пользователь не найден');
  if (u.id !== req.user.id) {
    db.prepare('UPDATE users SET profile_views = profile_views + 1 WHERE id = ?').run(u.id);
    u = getUser(u.id);
  }
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
      badges: badgesFor(u),
      profileTrack: track ? { id: track.id, url: track.url, title: track.title, artist: track.artist, duration: track.duration, cover: track.cover } : null,
      personalChannel: channel ? serializeChat(channel, req.user.id) : null,
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
