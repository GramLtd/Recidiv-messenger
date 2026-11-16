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

r.get('/users/:id', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) fail(404, 'Пользователь не найден');
  const giftsCount = db.prepare('SELECT COUNT(*) c FROM user_gifts WHERE owner_id = ? AND converted = 0 AND hidden = 0').get(u.id).c;
  const usernames = db.prepare('SELECT display FROM usernames WHERE user_id = ? AND display != ?').all(u.id, u.username || '').map((x) => x.display);
  res.json({ user: { ...publicUser(u), giftsCount, otherUsernames: usernames, createdAt: u.created_at } });
});

/** Resolve @name to a user or a public chat. */
r.get('/resolve/:name', (req, res) => {
  const row = db.prepare('SELECT * FROM usernames WHERE name = ?').get(String(req.params.name).replace(/^@/, '').toLowerCase());
  if (!row) fail(404, 'Не найдено');
  if (row.user_id) return res.json({ user: publicUser(getUser(row.user_id)) });
  res.json({ chat: serializeChat(row.chat_id, req.user.id) });
});

export default r;
