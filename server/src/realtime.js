import { Server } from 'socket.io';
import { db } from './db.js';
import { verifyToken } from './auth.js';

let io;
const online = new Map(); // userId -> socket count

export const isOnline = (userId) => online.has(userId);

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function chatMemberIds(chatId) {
  return db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ?').all(chatId).map((r) => r.user_id);
}

export function emitToChat(chatId, event, payload, exceptUserId) {
  for (const uid of chatMemberIds(chatId)) if (uid !== exceptUserId) emitToUser(uid, event, payload);
}

/** Users who share a chat with `userId` — they get presence updates. */
function peersOf(userId) {
  return db
    .prepare(
      `SELECT DISTINCT m2.user_id FROM chat_members m1
       JOIN chats c ON c.id = m1.chat_id AND c.type IN ('private','group')
       JOIN chat_members m2 ON m2.chat_id = m1.chat_id
       WHERE m1.user_id = ? AND m2.user_id != ?`,
    )
    .all(userId, userId)
    .map((r) => r.user_id);
}

function broadcastPresence(userId, isOn) {
  const lastSeen = Date.now();
  for (const peer of peersOf(userId)) emitToUser(peer, 'presence', { userId, online: isOn, lastSeen });
}

export function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const user = verifyToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const uid = socket.data.user.id;
    socket.join(`user:${uid}`);
    const count = (online.get(uid) || 0) + 1;
    online.set(uid, count);
    if (count === 1) broadcastPresence(uid, true);

    socket.on('typing', ({ chatId, action } = {}) => {
      const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, uid);
      if (!member) return;
      emitToChat(chatId, 'typing', { chatId, userId: uid, name: socket.data.user.display_name, action: action || 'typing' }, uid);
    });

    socket.on('disconnect', () => {
      const c = (online.get(uid) || 1) - 1;
      if (c <= 0) {
        online.delete(uid);
        db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), uid);
        broadcastPresence(uid, false);
      } else online.set(uid, c);
    });
  });
  return io;
}
