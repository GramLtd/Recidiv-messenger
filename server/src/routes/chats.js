import { deleteMessageFiles, AUTO_DELETE, autoDeleteLabel } from '../security.js';
import { Router } from 'express';
import crypto from 'node:crypto';
import { db, tx } from '../db.js';
import { fail, requestContext } from '../auth.js';
import { isPremium, isContact, isBlocked, privacyOf } from '../privacy.js';
import { INTERACTIVE_BOTS } from '../bots.js';
import {
  serializeChat, serializeMessage, getOrCreatePrivateChat, getMember, getUser, createMessage, messagePreview, canPost,
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
  const archived = req.body.archived !== undefined ? (req.body.archived ? 1 : 0) : m.archived || 0;
  db.prepare('UPDATE chat_members SET pinned = ?, muted = ?, archived = ? WHERE chat_id = ? AND user_id = ?').run(archived ? 0 : pinned, muted, archived, c.id, req.user.id);
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
    // start burn timers of «delete after reading» messages the reader has just seen
    const burn = db.prepare('SELECT id FROM messages WHERE chat_id = ? AND id > ? AND id <= ? AND ttl > 0 AND expires_at IS NULL AND sender_id != ? AND deleted = 0').all(c.id, m.last_read_id, upTo, req.user.id);
    for (const b of burn) {
      db.prepare('UPDATE messages SET expires_at = ? + ttl * 1000 WHERE id = ?').run(now(), b.id);
      emitToChat(c.id, 'message:update', { message: serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(b.id)) });
    }
  }
  res.json({ ok: true });
});

// ---------------- messages ----------------
r.get('/chats/:id/messages', (req, res) => {
  const c = loadChat(req.params.id);
  if (!getMember(c.id, req.user.id) && !c.is_public) fail(403, 'Нет доступа');
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  // forum groups: ?topic=<id> for one topic, ?topic=0 for «General» (messages without a topic)
  const topic = req.query.topic;
  const rows = topic === undefined || topic === ''
    ? db.prepare('SELECT * FROM messages WHERE chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(c.id, before, limit)
    : Number(topic)
      ? db.prepare('SELECT * FROM messages WHERE chat_id = ? AND topic_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(c.id, Number(topic), before, limit)
      : db.prepare('SELECT * FROM messages WHERE chat_id = ? AND topic_id IS NULL AND id < ? ORDER BY id DESC LIMIT ?').all(c.id, before, limit);
  res.json({ messages: rows.reverse().map(serializeMessage), hasMore: rows.length === limit });
});

/** Send a message as `user` (used by the API and by the scheduled-messages sweeper). */
export function sendMessageAs(user, chatId, body) {
  const c = loadChat(chatId);
  const m = requireMember(c.id, user.id);
  if (!canPost(c, m)) fail(403, 'Только администраторы могут публиковать в канале');
  if (c.type === 'private') {
    const peer = db.prepare('SELECT u.* FROM chat_members m JOIN users u ON u.id = m.user_id WHERE m.chat_id = ? AND m.user_id != ?').get(c.id, user.id);
    if (peer?.is_bot && !INTERACTIVE_BOTS.has(peer.id)) fail(403, 'Этот аккаунт не принимает сообщения');
    if (peer && peer.id !== user.id) {
      if (isBlocked(peer.id, user.id)) fail(403, 'Пользователь ограничил вам отправку сообщений');
      if (isBlocked(user.id, peer.id)) fail(403, 'Вы заблокировали этого пользователя — разблокируйте его в профиле');
      // the peer's "who can message me" setting; once they wrote to you, the chat is open
      const p = privacyOf(peer);
      const replied = !!db.prepare('SELECT 1 FROM messages WHERE chat_id = ? AND sender_id = ? LIMIT 1').get(c.id, peer.id);
      if (!replied && !isContact(peer.id, user.id) && !user.is_admin) {
        if (p.messages === 'contacts') fail(403, 'Пользователь принимает сообщения только от контактов');
        if (p.messages === 'premium' && !isPremium(user)) fail(403, 'Пользователь принимает сообщения только от Premium');
        if (p.messages === 'paid' && !isPremium(user)) {
          const price = Math.max(1, Number(p.messagePrice) || 1);
          tx(() => {
            changeBalance(user.id, -price, 'paid_message', `Платное сообщение ${peer.display_name}`, `user:${peer.id}`);
            changeBalance(peer.id, price, 'paid_message_in', `Платное сообщение от ${user.display_name}`, `user:${user.id}`);
          });
          pushBalance(user.id, peer.id);
        }
      }
    }
  }
  const text = String(body.text || '').slice(0, 4096);
  const media = sanitizeMedia(body.media);
  if (!text.trim() && !media && !body.e2e) fail(400, 'Пустое сообщение');
  let type = 'text';
  if (media) type = ['image', 'video', 'voice', 'audio', 'file', 'sticker', 'gif', 'album', 'poll'].includes(media.kind) ? media.kind : 'file';
  if (body.e2e && c.type === 'private') {
    // end-to-end encrypted: server stores only {n: nonce, c: ciphertext}; text is opaque
    const e = body.e2e;
    if (typeof e.n !== 'string' || typeof e.c !== 'string' || e.n.length > 64 || e.c.length > 12000) fail(400, 'Некорректное зашифрованное сообщение');
    type = 'secret';
    body.text = '';
    body._media = { kind: 'secret', n: e.n, c: e.c, k: String(e.k || '').slice(0, 64) };
  }
  let replyTo = body.replyTo ? Number(body.replyTo) : null;
  if (replyTo && !db.prepare('SELECT 1 FROM messages WHERE id = ? AND chat_id = ?').get(replyTo, c.id)) replyTo = null;
  // «delete after reading»: 5 s … 1 week, the countdown starts when the other side reads it
  const ttl = [5, 10, 30, 60, 300, 3600, 86400, 604800].includes(Number(body.ttl)) && c.type !== 'channel' ? Number(body.ttl) : 0;
  let topicId = null;
  if (c.forum && body.topicId) {
    const t = db.prepare('SELECT * FROM topics WHERE id = ? AND chat_id = ?').get(Number(body.topicId), c.id);
    if (!t) fail(404, 'Тема не найдена');
    const mm = getMember(c.id, user.id);
    if (t.closed && mm?.role === 'member') fail(403, 'Тема закрыта');
    topicId = t.id;
  }
  const msg = createMessage({ chatId: c.id, senderId: user.id, type, text: type === 'secret' ? '' : text, media: type === 'secret' ? body._media : media, replyTo, silent: !!body.silent, ttl, topicId });
  if (topicId) pushTopic(c.id, topicId);
  if (c.type === 'private') {
    const peerId = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').get(c.id, user.id)?.user_id;
    const bot = INTERACTIVE_BOTS.get(peerId);
    if (bot) setTimeout(() => { try { bot(user.id, text); } catch (e) { console.error(e); } }, 350);
  }
  return msg;
}

r.post('/chats/:id/messages', (req, res) => {
  const at = Number(req.body.scheduleAt) || 0;
  if (at) {
    // scheduled: validate now (membership / rights), store, send later
    const c = loadChat(req.params.id);
    const m = requireMember(c.id, req.user.id);
    if (!canPost(c, m)) fail(403, 'Нет прав на публикацию');
    if (req.body.e2e) fail(400, 'Зашифрованные сообщения нельзя отложить');
    if (at < Date.now() + 30_000 || at > Date.now() + 366 * 86400_000) fail(400, 'Выберите время от минуты до года вперёд');
    if (!String(req.body.text || '').trim() && !req.body.media) fail(400, 'Пустое сообщение');
    const cnt = db.prepare('SELECT COUNT(*) n FROM scheduled_messages WHERE sender_id = ?').get(req.user.id).n;
    if (cnt >= 100) fail(400, 'Слишком много отложенных сообщений');
    const payload = { text: String(req.body.text || '').slice(0, 4096), media: req.body.media || null, replyTo: req.body.replyTo || null, silent: !!req.body.silent, topicId: req.body.topicId || null };
    const r2 = db.prepare('INSERT INTO scheduled_messages (chat_id, sender_id, payload, send_at, created_at) VALUES (?, ?, ?, ?, ?)').run(c.id, req.user.id, JSON.stringify(payload), at, Date.now());
    return res.json({ scheduled: { id: Number(r2.lastInsertRowid), chatId: c.id, sendAt: at, ...payload } });
  }
  res.json({ message: sendMessageAs(req.user, req.params.id, req.body) });
});

r.get('/chats/:id/scheduled', (req, res) => {
  const c = loadChat(req.params.id);
  requireMember(c.id, req.user.id);
  const list = db.prepare('SELECT * FROM scheduled_messages WHERE chat_id = ? AND sender_id = ? ORDER BY send_at').all(c.id, req.user.id)
    .map((x) => ({ id: x.id, chatId: x.chat_id, sendAt: x.send_at, ...JSON.parse(x.payload) }));
  res.json({ scheduled: list });
});

r.delete('/scheduled/:id', (req, res) => {
  db.prepare('DELETE FROM scheduled_messages WHERE id = ? AND sender_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

r.post('/scheduled/:id/send-now', (req, res) => {
  const x = db.prepare('SELECT * FROM scheduled_messages WHERE id = ? AND sender_id = ?').get(Number(req.params.id), req.user.id);
  if (!x) fail(404, 'Сообщение не найдено');
  db.prepare('DELETE FROM scheduled_messages WHERE id = ?').run(x.id);
  res.json({ message: sendMessageAs(req.user, x.chat_id, JSON.parse(x.payload)) });
});

// ---------- polls ----------
r.post('/messages/:id/vote', (req, res) => {
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.id));
  if (!msg || msg.deleted || msg.type !== 'poll') fail(404, 'Опрос не найден');
  const c = loadChat(msg.chat_id);
  if (!getMember(c.id, req.user.id) && !c.is_public) fail(403, 'Нет доступа');
  const p = JSON.parse(msg.media);
  if (p.closed) fail(400, 'Опрос завершён');
  const opts = [...new Set((Array.isArray(req.body.options) ? req.body.options : [req.body.option]).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < p.options.length);
  const had = db.prepare('SELECT 1 FROM poll_votes WHERE message_id = ? AND user_id = ?').get(msg.id, req.user.id);
  if (p.quiz && had) fail(400, 'В викторине ответ можно дать только один раз');
  if (!opts.length && !p.quiz) db.prepare('DELETE FROM poll_votes WHERE message_id = ? AND user_id = ?').run(msg.id, req.user.id); // retract
  else {
    if (!opts.length) fail(400, 'Выберите вариант');
    tx(() => {
      db.prepare('DELETE FROM poll_votes WHERE message_id = ? AND user_id = ?').run(msg.id, req.user.id);
      for (const o of p.multiple ? opts : opts.slice(0, 1)) db.prepare('INSERT INTO poll_votes (message_id, user_id, option) VALUES (?, ?, ?)').run(msg.id, req.user.id, o);
    });
  }
  pushPollUpdate(msg);
  res.json({ message: serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id)) });
});

r.post('/messages/:id/close-poll', (req, res) => {
  const msg = loadOwnMessage(req.params.id, req.user.id, true);
  if (msg.type !== 'poll') fail(400, 'Это не опрос');
  const p = JSON.parse(msg.media);
  p.closed = true;
  db.prepare('UPDATE messages SET media = ? WHERE id = ?').run(JSON.stringify(p), msg.id);
  pushPollUpdate(msg);
  res.json({ message: serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id)) });
});

/** Results are per-viewer (own votes, hidden quiz answer), so every member gets their own copy. */
function pushPollUpdate(msg) {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id);
  for (const uid of chatMemberIds(msg.chat_id)) {
    const viewer = getUser(uid);
    requestContext.run({ user: viewer }, () => emitToUser(uid, 'message:update', { message: serializeMessage(row) }));
  }
}

r.post('/messages/:id/forward', (req, res) => {
  const src = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(req.params.id));
  if (!src || src.deleted) fail(404, 'Сообщение не найдено');
  const srcChat = loadChat(src.chat_id);
  if (!getMember(src.chat_id, req.user.id) && !srcChat.is_public) fail(403, 'Нет доступа');
  if (srcChat.protected) fail(403, 'В этом чате запрещено пересылать сообщения');
  if (src.ttl) fail(403, 'Самоуничтожающиеся сообщения нельзя пересылать');
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
  db.prepare('DELETE FROM reactions WHERE message_id = ?').run(msg.id);
  db.prepare("UPDATE messages SET deleted = 1, text = '', media = NULL, edited_at = NULL WHERE id = ?").run(msg.id);
  deleteMessageFiles(msg.media); // the photo / video / voice file is removed from the server too
  emitToChat(msg.chat_id, 'message:delete', { chatId: msg.chat_id, messageId: msg.id });
  res.json({ ok: true });
});

/** Disappearing messages: 0 (off), 1 hour, 1 day, 1 week, 1 month. Private chats — either side; groups/channels — admins. */
// protected content: no forwarding / copying / screenshots (enforced by the server for forwards, by clients for the rest)
// ---------------- topics (forum groups) ----------------
const TOPIC_COLORS = ['#6fb9f0', '#ffd67e', '#cb86db', '#8eee98', '#ff93b2', '#fb6f5f'];
function serializeTopic(t) {
  const last = db.prepare('SELECT * FROM messages WHERE chat_id = ? AND topic_id = ? AND deleted = 0 ORDER BY id DESC LIMIT 1').get(t.chat_id, t.id);
  const count = db.prepare('SELECT COUNT(*) n FROM messages WHERE chat_id = ? AND topic_id = ? AND deleted = 0').get(t.chat_id, t.id).n;
  const sender = last?.sender_id ? db.prepare('SELECT display_name FROM users WHERE id = ?').get(last.sender_id) : null;
  return {
    id: t.id, chatId: t.chat_id, title: t.title, icon: t.icon || null, color: t.color || TOPIC_COLORS[t.id % TOPIC_COLORS.length],
    closed: !!t.closed, pinned: !!t.pinned, createdBy: t.created_by, createdAt: t.created_at, count,
    lastMessage: last ? { id: last.id, text: messagePreview(last), senderName: sender?.display_name, createdAt: last.created_at } : null,
  };
}
function generalTopic(chatId) {
  const last = db.prepare('SELECT * FROM messages WHERE chat_id = ? AND topic_id IS NULL AND deleted = 0 ORDER BY id DESC LIMIT 1').get(chatId);
  const sender = last?.sender_id ? db.prepare('SELECT display_name FROM users WHERE id = ?').get(last.sender_id) : null;
  return { id: 0, chatId, title: 'Общее', icon: '#', color: '#8e8e93', general: true, closed: false, pinned: true,
    lastMessage: last ? { id: last.id, text: messagePreview(last), senderName: sender?.display_name, createdAt: last.created_at } : null };
}
function pushTopic(chatId, topicId) {
  const t = db.prepare('SELECT * FROM topics WHERE id = ?').get(topicId);
  if (t) emitToChat(chatId, 'topic:update', { topic: serializeTopic(t) });
}
function topicAdmin(c, user, t) {
  const m = requireMember(c.id, user.id);
  if (m.role === 'member' && (!t || t.created_by !== user.id)) fail(403, 'Только администраторы или автор темы');
  return m;
}

r.post('/chats/:id/forum', (req, res) => {
  const c = loadChat(req.params.id);
  if (c.type !== 'group') fail(400, 'Темы доступны только в группах');
  const m = requireMember(c.id, req.user.id);
  if (m.role === 'member') fail(403, 'Только администраторы могут включать темы');
  const on = req.body.on ? 1 : 0;
  db.prepare('UPDATE chats SET forum = ? WHERE id = ?').run(on, c.id);
  systemMessage(c.id, on ? `${req.user.display_name} включил(а) темы в группе` : `${req.user.display_name} выключил(а) темы`);
  for (const uid of chatMemberIds(c.id)) emitToUser(uid, 'chat:update', { chat: serializeChat(c.id, uid) });
  res.json({ chat: serializeChat(c.id, req.user.id) });
});

r.get('/chats/:id/topics', (req, res) => {
  const c = loadChat(req.params.id);
  if (!getMember(c.id, req.user.id) && !c.is_public) fail(403, 'Нет доступа');
  const list = db.prepare('SELECT * FROM topics WHERE chat_id = ?').all(c.id).map(serializeTopic);
  list.sort((a, b) => (b.pinned - a.pinned) || ((b.lastMessage?.id || 0) - (a.lastMessage?.id || 0)) || b.id - a.id);
  res.json({ topics: [generalTopic(c.id), ...list] });
});

r.post('/chats/:id/topics', (req, res) => {
  const c = loadChat(req.params.id);
  if (!c.forum) fail(400, 'В группе выключены темы');
  requireMember(c.id, req.user.id);
  const title = String(req.body.title || '').trim().slice(0, 64);
  if (!title) fail(400, 'Введите название темы');
  if (db.prepare('SELECT COUNT(*) n FROM topics WHERE chat_id = ?').get(c.id).n >= 200) fail(400, 'Слишком много тем');
  const icon = req.body.icon ? [...String(req.body.icon)].slice(0, 2).join('') : null;
  const color = TOPIC_COLORS.includes(req.body.color) ? req.body.color : null;
  const id = Number(db.prepare('INSERT INTO topics (chat_id, title, icon, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(c.id, title, icon, color, req.user.id, Date.now()).lastInsertRowid);
  const t = db.prepare('SELECT * FROM topics WHERE id = ?').get(id);
  createMessage({ chatId: c.id, senderId: null, type: 'system', text: `${req.user.display_name} создал(а) тему «${title}»`, topicId: id });
  pushTopic(c.id, id);
  res.json({ topic: serializeTopic(t) });
});

r.patch('/topics/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM topics WHERE id = ?').get(Number(req.params.id));
  if (!t) fail(404, 'Тема не найдена');
  const c = loadChat(t.chat_id);
  const m = topicAdmin(c, req.user, t);
  if (req.body.title !== undefined) {
    const title = String(req.body.title || '').trim().slice(0, 64);
    if (!title) fail(400, 'Введите название темы');
    db.prepare('UPDATE topics SET title = ? WHERE id = ?').run(title, t.id);
  }
  if (req.body.icon !== undefined) db.prepare('UPDATE topics SET icon = ? WHERE id = ?').run(req.body.icon ? [...String(req.body.icon)].slice(0, 2).join('') : null, t.id);
  if (req.body.closed !== undefined) db.prepare('UPDATE topics SET closed = ? WHERE id = ?').run(req.body.closed ? 1 : 0, t.id);
  if (req.body.pinned !== undefined) {
    if (m.role === 'member') fail(403, 'Закреплять темы могут только администраторы');
    db.prepare('UPDATE topics SET pinned = ? WHERE id = ?').run(req.body.pinned ? 1 : 0, t.id);
  }
  pushTopic(c.id, t.id);
  res.json({ topic: serializeTopic(db.prepare('SELECT * FROM topics WHERE id = ?').get(t.id)) });
});

r.delete('/topics/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM topics WHERE id = ?').get(Number(req.params.id));
  if (!t) fail(404, 'Тема не найдена');
  const c = loadChat(t.chat_id);
  topicAdmin(c, req.user, t);
  const ids = db.prepare('SELECT id FROM messages WHERE chat_id = ? AND topic_id = ?').all(c.id, t.id).map((x) => x.id);
  tx(() => {
    db.prepare("UPDATE messages SET deleted = 1, text = '', media = NULL WHERE chat_id = ? AND topic_id = ?").run(c.id, t.id);
    db.prepare('DELETE FROM topics WHERE id = ?').run(t.id);
  });
  emitToChat(c.id, 'topic:delete', { chatId: c.id, topicId: t.id, messageIds: ids });
  res.json({ ok: true });
});

r.post('/chats/:id/protect', (req, res) => {
  const c = loadChat(req.params.id);
  const m = getMember(c.id, req.user.id);
  if (!m) fail(403, 'Нет доступа');
  if (c.type !== 'private' && m.role === 'member') fail(403, 'Только администраторы могут менять защиту');
  const on = req.body.on ? 1 : 0;
  db.prepare('UPDATE chats SET protected = ? WHERE id = ?').run(on, c.id);
  systemMessage(c.id, on ? `${req.user.display_name} включил(а) защиту чата: нельзя пересылать, копировать и делать скриншоты` : `${req.user.display_name} выключил(а) защиту чата`);
  for (const uid of chatMemberIds(c.id)) emitToUser(uid, 'chat:update', { chat: serializeChat(c.id, uid) });
  res.json({ chat: serializeChat(c.id, req.user.id) });
});

r.post('/chats/:id/auto-delete', (req, res) => {
  const c = loadChat(req.params.id);
  const m = getMember(c.id, req.user.id);
  if (!m) fail(403, 'Нет доступа');
  if (c.type !== 'private' && c.type !== 'saved' && m.role === 'member') fail(403, 'Только администраторы могут менять автоудаление');
  const seconds = Number(req.body.seconds) || 0;
  if (!AUTO_DELETE.includes(seconds)) fail(400, 'Недопустимый срок');
  db.prepare('UPDATE chats SET auto_delete = ? WHERE id = ?').run(seconds, c.id);
  systemMessage(c.id, seconds ? `${req.user.display_name} включил(а) автоудаление сообщений: ${autoDeleteLabel(seconds)}` : `${req.user.display_name} выключил(а) автоудаление сообщений`);
  for (const uid of chatMemberIds(c.id)) emitToUser(uid, 'chat:update', { chat: serializeChat(c.id, uid) });
  res.json({ chat: serializeChat(c.id, req.user.id) });
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
