import { Router } from 'express';
import crypto from 'node:crypto';
import { db, tx } from '../db.js';
import { fail } from '../auth.js';
import { isPremium, isContact, isBlocked, privacyOf } from '../privacy.js';
import { INTERACTIVE_BOTS } from '../bots.js';
import {
  serializeChat, serializeMessage, getOrCreatePrivateChat, getMember, getUser, createMessage, canPost,
  assertUsernameFree, emitToUser, emitToChat, chatMemberIds, publicUser, now, sanitizeMedia, safeUploadUrl, changeBalance, pushBalance,
} from '../services.js';

const r = Router();

function loadChat(id) {
  const c = db.prepare('SELECT * FROM chats WHERE id = ?').get(Number(id));
  if (!c) fail(404, 'Чат не найден');
  return c;
}
function requireMember(chatId, userId) {
  const m = getMember(chatId, userId);
  if (!m) fail(403, 'Вы не участник этого чата');
  return m;
}
function requireAdminRole(chatId, userId) {
  const m = requireMember(chatId, userId);
  if (m.role === 'member') fail(403, 'Нужны права администратора');
  return m;
}
function pushChatUpdate(chatId) {
  for (const uid of chatMemberIds(chatId)) emitToUser(uid, 'chat:update', { chat: serializeChat(chatId, uid) });
}
function systemMessage(chatId, text) {
  return createMessage({ chatId, senderId: null, type: 'system', text });
}

r.get('/chats', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.* FROM chats c JOIN chat_members m ON m.chat_id = c.id AND m.user_id = ?
       ORDER BY m.pinned DESC, COALESCE((SELECT MAX(id) FROM messages WHERE chat_id = c.id), 0) DESC, c.id DESC`,
    )
    .all(req.user.id);
  const chats = rows
    .map((c) => serializeChat(c, req.user.id))
    // hide empty private chats the user didn't start
    .filter((c) => c.type !== 'private' || c.lastMessage || c.ownerId === req.user.id);
  res.json({ chats });
});

r.post('/chats/private', (req, res) => {
  const other = getUser(Number(req.body.userId));
  if (!other) fail(404, 'Пользователь не найден');
  const chat = getOrCreatePrivateChat(req.user.id, other.id);
  const bot = INTERACTIVE_BOTS.get(other.id);
  if (bot && !db.prepare('SELECT 1 FROM messages WHERE chat_id = ?').get(chat.id)) bot(req.user.id, '/start');
  res.json({ chat: serializeChat(chat, req.user.id) });
});

function createGroupLike(req, type) {
  const limit = isPremium(req.user) ? 10 : 3;
  const owned = db.prepare("SELECT COUNT(*) c FROM chats WHERE owner_id = ? AND type = ?").get(req.user.id, type).c;
  if (owned >= limit && !req.user.is_admin) fail(403, `Можно создать не больше ${limit} ${type === 'channel' ? 'каналов' : 'групп'}${isPremium(req.user) ? '' : ' (с Premium — 10)'}`);
  const title = String(req.body.title || '').trim().slice(0, 128);
  if (!title) fail(400, 'Укажите название');
  const username = req.body.username ? String(req.body.username).trim() : null;
  if (username) assertUsernameFree(username);
  const memberIds = [...new Set((req.body.memberIds || []).map(Number))].filter((id) => id !== req.user.id && getUser(id));
  const chatId = tx(() => {
    const ins = db
      .prepare('INSERT INTO chats (type, title, description, avatar, owner_id, is_public, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(type, title, String(req.body.description || '').slice(0, 500), safeUploadUrl(req.body.avatar), req.user.id, username ? 1 : 0, crypto.randomBytes(8).toString('hex'), now());
    const id = Number(ins.lastInsertRowid);
    const addM = db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
    addM.run(id, req.user.id, 'owner', now());
    for (const uid of memberIds) addM.run(id, uid, 'member', now());
    if (username) db.prepare('INSERT INTO usernames (name, display, chat_id, created_at) VALUES (?, ?, ?, ?)').run(username.toLowerCase(), username, id, now());
    return id;
  });
  systemMessage(chatId, type === 'channel' ? `Канал «${title}» создан` : `${req.user.display_name} создал(а) группу «${title}»`);
  return serializeChat(chatId, req.user.id);
}

r.post('/chats/group', (req, res) => res.json({ chat: createGroupLike(req, 'group') }));
r.post('/chats/channel', (req, res) => res.json({ chat: createGroupLike(req, 'channel') }));

r.get('/chats/:id', (req, res) => {
  const c = loadChat(req.params.id);
  const m = getMember(c.id, req.user.id);
  if (!m && !c.is_public) fail(403, 'Чат приватный');
  res.json({ chat: serializeChat(c, req.user.id) });
});

r.get('/chats/:id/members', (req, res) => {
  const c = loadChat(req.params.id);
  if (!getMember(c.id, req.user.id) && !c.is_public) fail(403, 'Нет доступа');
  if (c.type === 'channel' && getMember(c.id, req.user.id)?.role === 'member') return res.json({ members: [] });
  const rows = db
    .prepare(
      `SELECT u.*, m.role FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.chat_id = ?
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.display_name LIMIT 500`,
    )
    .all(c.id);
  res.json({ members: rows.map((u) => ({ ...publicUser(u), role: u.role })) });
});

r.patch('/chats/:id', (req, res) => {
  const c = loadChat(req.params.id);
  if (!['group', 'channel'].includes(c.type)) fail(400, 'Нельзя изменить этот чат');
  requireAdminRole(c.id, req.user.id);
  const { title, description, avatar, username } = req.body;
  tx(() => {
    db.prepare('UPDATE chats SET title = ?, description = ?, avatar = ? WHERE id = ?').run(
      title !== undefined ? String(title).trim().slice(0, 128) || c.title : c.title,
      description !== undefined ? String(description).slice(0, 500) : c.description,
      avatar !== undefined ? safeUploadUrl(avatar) : c.avatar,
      c.id,
    );
    if (username !== undefined) {
      const current = db.prepare('SELECT name FROM usernames WHERE chat_id = ?').get(c.id);
      if (username && username.toLowerCase() !== current?.name) {
        assertUsernameFree(username);
        db.prepare('DELETE FROM usernames WHERE chat_id = ?').run(c.id);
        db.prepare('INSERT INTO usernames (name, display, chat_id, created_at) VALUES (?, ?, ?, ?)').run(username.toLowerCase(), username, c.id, now());
        db.prepare('UPDATE chats SET is_public = 1 WHERE id = ?').run(c.id);
      } else if (!username) {
        db.prepare('DELETE FROM usernames WHERE chat_id = ?').run(c.id);
        db.prepare('UPDATE chats SET is_public = 0 WHERE id = ?').run(c.id);
      }
    }
  });
  pushChatUpdate(c.id);
  res.json({ chat: serializeChat(c.id, req.user.id) });
});

r.post('/chats/:id/join', (req, res) => {
  const c = loadChat(req.params.id);
  if (!['group', 'channel'].includes(c.type)) fail(400, 'Нельзя вступить');
  if (!c.is_public && req.body.inviteCode !== c.invite_code) fail(403, 'Чат приватный');
  if (!getMember(c.id, req.user.id)) {
    db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(c.id, req.user.id, 'member', now());
    if (c.type === 'group') systemMessage(c.id, `${req.user.display_name} вступил(а) в группу`);
    else pushChatUpdate(c.id);
  }
  res.json({ chat: serializeChat(c.id, req.user.id) });
});

r.post('/join/:code', (req, res) => {
  const c = db.prepare('SELECT * FROM chats WHERE invite_code = ?').get(req.params.code);
  if (!c) fail(404, 'Ссылка недействительна');
  if (!getMember(c.id, req.user.id)) {
    db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(c.id, req.user.id, 'member', now());
    if (c.type === 'group') systemMessage(c.id, `${req.user.display_name} вступил(а) по ссылке`);
  }
  res.json({ chat: serializeChat(c.id, req.user.id) });
});

r.post('/chats/:id/leave', (req, res) => {
  const c = loadChat(req.params.id);
  const m = requireMember(c.id, req.user.id);
  if (c.type === 'private' || c.type === 'saved') {
    // Deleting a private chat removes it (and its history) for both sides, like Telegram's "delete for both".
    const peers = chatMemberIds(c.id).filter((id) => id !== req.user.id);
    db.prepare('DELETE FROM chats WHERE id = ?').run(c.id);
    for (const id of peers) emitToUser(id, 'chat:removed', { chatId: c.id });
    return res.json({ ok: true });
  }
  if (m.role === 'owner') {
    const next = db.prepare("SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ? ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at LIMIT 1").get(c.id, req.user.id);
    if (!next) {
      db.prepare('DELETE FROM chats WHERE id = ?').run(c.id);
      return res.json({ ok: true });
    }
    db.prepare("UPDATE chat_members SET role = 'owner' WHERE chat_id = ? AND user_id = ?").run(c.id, next.user_id);
    db.prepare('UPDATE chats SET owner_id = ? WHERE id = ?').run(next.user_id, c.id);
  }
  db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(c.id, req.user.id);
  if (c.type === 'group') systemMessage(c.id, `${req.user.display_name} покинул(а) группу`);
  res.json({ ok: true });
});

r.post('/chats/:id/members', (req, res) => {
  const c = loadChat(req.params.id);
  if (c.type !== 'group' && c.type !== 'channel') fail(400, 'Нельзя добавить участников');
  requireAdminRole(c.id, req.user.id);
  const added = [];
  for (const uid of (req.body.userIds || []).map(Number)) {
    const u = getUser(uid);
    if (!u || getMember(c.id, uid)) continue;
    db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(c.id, uid, 'member', now());
    added.push(u.display_name);
  }
  if (added.length) systemMessage(c.id, `${req.user.display_name} добавил(а): ${added.join(', ')}`);
  res.json({ chat: serializeChat(c.id, req.user.id) });
});

r.delete('/chats/:id/members/:userId', (req, res) => {
  const c = loadChat(req.params.id);
  const me = requireAdminRole(c.id, req.user.id);
  const target = getMember(c.id, Number(req.params.userId));
  if (!target) fail(404, 'Не участник');
  if (target.role === 'owner' || (target.role === 'admin' && me.role !== 'owner')) fail(403, 'Недостаточно прав');
  db.prepare('DELETE FROM chat_members WHERE chat_id = ? AND user_id = ?').run(c.id, target.user_id);
  emitToUser(target.user_id, 'chat:removed', { chatId: c.id });
  systemMessage(c.id, `${getUser(target.user_id)?.display_name} исключён(а) из чата`);
  res.json({ ok: true });
});

r.post('/chats/:id/members/:userId/role', (req, res) => {
  const c = loadChat(req.params.id);
  const me = requireMember(c.id, req.user.id);
  if (me.role !== 'owner') fail(403, 'Только владелец может назначать админов');
  const role = req.body.role === 'admin' ? 'admin' : 'member';
  db.prepare("UPDATE chat_members SET role = ? WHERE chat_id = ? AND user_id = ? AND role != 'owner'").run(role, c.id, Number(req.params.userId));
  pushChatUpdate(c.id);
  res.json({ ok: true });
});

r.post('/chats/:id/settings', (req, res) => {
  const c = loadChat(req.params.id);
  const m = requireMember(c.id, req.user.id);
  const pinned = req.body.pinned !== undefined ? (req.body.pinned ? 1 : 0) : m.pinned;
  const muted = req.body.muted !== undefined ? (req.body.muted ? 1 : 0) : m.muted;
  db.prepare('UPDATE chat_members SET pinned = ?, muted = ? WHERE chat_id = ? AND user_id = ?').run(pinned, muted, c.id, req.user.id);
  res.json({ chat: serializeChat(c.id, req.user.id) });
});

r.post('/chats/:id/read', (req, res) => {
  const c = loadChat(req.params.id);
  const m = getMember(c.id, req.user.id);
  if (!m) return res.json({ ok: true });
  const upTo = Number(req.body.messageId) || db.prepare('SELECT MAX(id) m FROM messages WHERE chat_id = ?').get(c.id).m || 0;
  if (upTo > m.last_read_id) {
    db.prepare('UPDATE chat_members SET last_read_id = ? WHERE chat_id = ? AND user_id = ?').run(upTo, c.id, req.user.id);
    if (c.type === 'channel') {
      db.prepare('UPDATE messages SET views = views + 1 WHERE chat_id = ? AND id > ? AND id <= ?').run(c.id, m.last_read_id, upTo);
    } else emitToChat(c.id, 'read', { chatId: c.id, userId: req.user.id, messageId: upTo }, req.user.id);
  }
  res.json({ ok: true });
});

// ---------------- messages ----------------
r.get('/chats/:id/messages', (req, res) => {
  const c = loadChat(req.params.id);
  if (!getMember(c.id, req.user.id) && !c.is_public) fail(403, 'Нет доступа');
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(c.id, before, limit);
  res.json({ messages: rows.reverse().map(serializeMessage), hasMore: rows.length === limit });
});

r.post('/chats/:id/messages', (req, res) => {
  const c = loadChat(req.params.id);
  const m = requireMember(c.id, req.user.id);
  if (!canPost(c, m)) fail(403, 'Только администраторы могут публиковать в канале');
  if (c.type === 'private') {
    const peer = db.prepare('SELECT u.* FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? AND m.user_id != ?').get(c.id, req.user.id);
    if (peer?.is_bot && !INTERACTIVE_BOTS.has(peer.id)) fail(403, 'Этот аккаунт не принимает сообщения');
    if (peer && peer.id !== req.user.id) {
      if (isBlocked(peer.id, req.user.id)) fail(403, 'Пользователь ограничил вам отправку сообщений');
      if (isBlocked(req.user.id, peer.id)) fail(403, 'Вы заблокировали этого пользователя — разблокируйте его в профиле');
      // the peer's "who can message me" setting; once they wrote to you, the chat is open
      const p = privacyOf(peer);
      const replied = !!db.prepare('SELECT 1 FROM messages WHERE chat_id = ? AND sender_id = ? LIMIT 1').get(c.id, peer.id);
      if (!replied && !isContact(peer.id, req.user.id) && !req.user.is_admin) {
        if (p.messages === 'contacts') fail(403, 'Пользователь принимает сообщения только от контактов');
        if (p.messages === 'premium' && !isPremium(req.user)) fail(403, 'Пользователь принимает сообщения только от Premium');
        if (p.messages === 'paid' && !isPremium(req.user)) {
          const price = Math.max(1, Number(p.messagePrice) || 1);
          tx(() => {
            changeBalance(req.user.id, -price, 'paid_message', `Платное сообщение ${peer.display_name}`, `user:${peer.id}`);
            changeBalance(peer.id, price, 'paid_message_in', `Платное сообщение от ${req.user.display_name}`, `user:${req.user.id}`);
          });
          pushBalance(req.user.id, peer.id);
        }
      }
    }
  }
  const text = String(req.body.text || '').slice(0, 4096);
  const media = sanitizeMedia(req.body.media);
  if (!text.trim() && !media) fail(400, 'Пустое сообщение');
  let type = 'text';
  if (media) type = ['image', 'video', 'voice', 'audio', 'file', 'sticker', 'gif'].includes(media.kind) ? media.kind : 'file';
  let replyTo = req.body.replyTo ? Number(req.body.replyTo) : null;
  if (replyTo && !db.prepare('SELECT 1 FROM messages WHERE id = ? AND chat_id = ?').get(replyTo, c.id)) replyTo = null;
  const msg = createMessage({ chatId: c.id, senderId: req.user.id, type, text, media, replyTo });
  res.json({ message: msg });
  if (c.type === 'private') {
    const peerId = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').get(c.id, req.user.id)?.user_id;
    const bot = INTERACTIVE_BOTS.get(peerId);
    if (bot) setTimeout(() => { try { bot(req.user.id, text); } catch (e) { console.error(e); } }, 350);
  }
});

r.post('/messages/:id/forward', (req, res) => {
  const src = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.id));
  if (!src || src.deleted) fail(404, 'Сообщение не найдено');
  const srcChat = loadChat(src.chat_id);
  if (!getMember(src.chat_id, req.user.id) && !srcChat.is_public) fail(403, 'Нет доступа');
  const target = loadChat(req.body.chatId);
  const m = requireMember(target.id, req.user.id);
  if (!canPost(target, m)) fail(403, 'Нет прав на публикацию');
  const msg = createMessage({
    chatId: target.id, senderId: req.user.id, type: src.type === 'gift' ? 'text' : src.type,
    text: src.text, media: src.media ? JSON.parse(src.media) : null, forwardFrom: src.sender_id,
  });
  res.json({ message: msg });
});

function loadOwnMessage(id, userId, allowAdmin = false) {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(id));
  if (!msg || msg.deleted) fail(404, 'Сообщение не найдено');
  if (msg.sender_id !== userId) {
    const m = getMember(msg.chat_id, userId);
    if (!allowAdmin || !m || m.role === 'member') fail(403, 'Это не ваше сообщение');
  }
  return msg;
}

r.patch('/messages/:id', (req, res) => {
  const msg = loadOwnMessage(req.params.id, req.user.id);
  if (msg.type === 'gift' || msg.type === 'system') fail(400, 'Нельзя редактировать');
  const text = String(req.body.text || '').slice(0, 4096);
  if (!text.trim() && !msg.media) fail(400, 'Пустое сообщение');
  db.prepare('UPDATE messages SET text = ?, edited_at = ? WHERE id = ?').run(text, now(), msg.id);
  const out = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id));
  emitToChat(msg.chat_id, 'message:update', { message: out });
  res.json({ message: out });
});

r.delete('/messages/:id', (req, res) => {
  const msg = loadOwnMessage(req.params.id, req.user.id, true);
  db.prepare("UPDATE messages SET deleted = 1, text = '', media = NULL WHERE id = ?").run(msg.id);
  emitToChat(msg.chat_id, 'message:delete', { chatId: msg.chat_id, messageId: msg.id });
  res.json({ ok: true });
});

r.post('/messages/:id/react', (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.id));
  if (!msg || msg.deleted) fail(404, 'Сообщение не найдено');
  requireMember(msg.chat_id, req.user.id);
  const emoji = String(req.body.emoji || '').slice(0, 16);
  const existing = db.prepare('SELECT emoji FROM reactions WHERE message_id = ? AND user_id = ?').get(msg.id, req.user.id);
  if (!emoji || existing?.emoji === emoji) db.prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ?').run(msg.id, req.user.id);
  else db.prepare('INSERT INTO reactions (message_id, user_id, emoji) VALUES (?, ?, ?) ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji').run(msg.id, req.user.id, emoji);
  const out = serializeMessage(msg);
  emitToChat(msg.chat_id, 'message:update', { message: out });
  res.json({ message: out });
});

r.get('/chats/:id/search', (req, res) => {
  const c = loadChat(req.params.id);
  if (!getMember(c.id, req.user.id) && !c.is_public) fail(403, 'Нет доступа');
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = db.prepare('SELECT * FROM messages WHERE chat_id = ? AND deleted = 0 AND text LIKE ? ORDER BY id DESC LIMIT 50').all(c.id, q);
  res.json({ messages: rows.map(serializeMessage) });
});

export default r;
