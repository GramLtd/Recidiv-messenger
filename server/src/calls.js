import crypto from 'node:crypto';
import { db, getSetting } from './db.js';

/*
 * Calls over WebRTC — the server only relays signalling (SDP / ICE) between the two sockets that hold the call;
 * media goes peer-to-peer (or through a TURN relay if one is configured in the admin panel).
 *   1:1 calls in private chats: call:start → call:incoming (all callee devices) → call:accept (one device) → signal ↔ → call:end
 *   group voice rooms: room:join / room:leave, mesh signalling room:signal between participants
 */
const calls = new Map(); // callId -> { id, chatId, from, to, video, state, callerSock, calleeSock, startedAt, created, timer }
const rooms = new Map(); // chatId -> Map(userId -> socketId)

const user = (id) => db.prepare('SELECT id, display_name, avatar, username, verified FROM users WHERE id = ?').get(id);
const light = (u) => (u ? { id: u.id, displayName: u.display_name, avatar: u.avatar, username: u.username, verified: !!u.verified } : null);
const blocked = (a, b) => !!db.prepare('SELECT 1 FROM blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)').get(a, b, b, a);

export function iceConfig() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const turn = getSetting('cfg_turn_url');
  if (turn) servers.push({ urls: turn.split(',').map((s) => s.trim()).filter(Boolean), username: getSetting('cfg_turn_user') || undefined, credential: getSetting('cfg_turn_pass') || undefined });
  return { iceServers: servers, hasRelay: !!turn };
}

export function wireCalls(io, socket, { emitToUser, createMessage, chatMemberIds }) {
  const uid = socket.data.user.id;
  const toSock = (sid, ev, p) => io.to(sid).emit(ev, p);

  const finish = (c, reason, byUid) => {
    if (!calls.has(c.id)) return;
    calls.delete(c.id);
    clearTimeout(c.timer);
    const payload = { callId: c.id, reason };
    if (c.callerSock) toSock(c.callerSock, 'call:end', payload);
    if (c.calleeSock) toSock(c.calleeSock, 'call:end', payload); else emitToUser(c.to, 'call:end', payload);
    const secs = c.startedAt ? Math.round((Date.now() - c.startedAt) / 1000) : 0;
    const kind = c.video ? 'Видеозвонок' : 'Звонок';
    const text = secs ? `📞 ${kind} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : reason === 'declined' ? `📞 ${kind} отклонён` : reason === 'busy' ? `📞 ${kind}: занято` : `📞 Пропущенный ${kind.toLowerCase()}`;
    try { createMessage({ chatId: c.chatId, senderId: c.from, type: 'text', text, silent: !!secs || byUid === c.to }); } catch {}
  };

  socket.on('call:start', ({ chatId, video } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(Number(chatId));
    if (!chat || chat.type !== 'private') return reply({ error: 'Звонить можно в личном чате' });
    if (!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chat.id, uid)) return reply({ error: 'Нет доступа' });
    const peer = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').get(chat.id, uid)?.user_id;
    if (!peer) return reply({ error: 'Некому звонить' });
    if (db.prepare('SELECT is_bot FROM users WHERE id = ?').get(peer)?.is_bot) return reply({ error: 'Боту позвонить нельзя' });
    if (blocked(uid, peer)) return reply({ error: 'Звонок невозможен' });
    if ([...calls.values()].some((c) => c.from === peer || c.to === peer)) return reply({ error: 'Абонент сейчас разговаривает' });
    const c = { id: crypto.randomBytes(12).toString('hex'), chatId: chat.id, from: uid, to: peer, video: !!video, state: 'ringing', callerSock: socket.id, calleeSock: null, created: Date.now() };
    c.timer = setTimeout(() => finish(c, 'missed'), 45_000);
    calls.set(c.id, c);
    emitToUser(peer, 'call:incoming', { callId: c.id, chatId: chat.id, video: c.video, from: light(user(uid)) });
    reply({ callId: c.id, ...iceConfig() });
  });

  socket.on('call:accept', ({ callId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const c = calls.get(callId);
    if (!c || c.to !== uid || c.state !== 'ringing') return reply({ error: 'Звонок уже завершён' });
    c.state = 'active'; c.calleeSock = socket.id; c.startedAt = Date.now();
    clearTimeout(c.timer);
    emitToUser(uid, 'call:taken', { callId }); // other devices of the callee stop ringing
    toSock(c.callerSock, 'call:accepted', { callId });
    reply({ ok: true, ...iceConfig() });
  });

  socket.on('call:decline', ({ callId } = {}) => {
    const c = calls.get(callId);
    if (c && c.to === uid && c.state === 'ringing') finish(c, 'declined', uid);
  });

  socket.on('call:signal', ({ callId, data } = {}) => {
    const c = calls.get(callId);
    if (!c || (uid !== c.from && uid !== c.to)) return;
    const target = socket.id === c.callerSock ? c.calleeSock : c.callerSock;
    if (target && data && JSON.stringify(data).length < 20_000) toSock(target, 'call:signal', { callId, data });
  });

  socket.on('call:end', ({ callId } = {}) => {
    const c = calls.get(callId);
    if (c && (uid === c.from || uid === c.to)) finish(c, c.state === 'ringing' ? 'cancelled' : 'ended', uid);
  });

  // ---------- group voice rooms (mesh) ----------
  const roomUsers = (chatId) => [...(rooms.get(chatId)?.keys() || [])].map((id) => light(user(id)));
  const announce = (chatId) => { for (const m of chatMemberIds(chatId)) emitToUser(m, 'room:count', { chatId, users: roomUsers(chatId) }); };
  const leave = (chatId) => {
    const r = rooms.get(chatId);
    if (!r || r.get(uid) !== socket.id) return;
    r.delete(uid);
    for (const sid of r.values()) toSock(sid, 'room:left', { chatId, userId: uid });
    if (!r.size) rooms.delete(chatId);
    announce(chatId);
  };
  socket.on('room:join', ({ chatId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(Number(chatId));
    if (!chat || chat.type !== 'group') return reply({ error: 'Голосовые комнаты есть только в группах' });
    if (!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chat.id, uid)) return reply({ error: 'Нет доступа' });
    const r = rooms.get(chat.id) || new Map();
    if (r.size >= 8 && !r.has(uid)) return reply({ error: 'В комнате уже 8 человек' });
    const peers = [...r.entries()].filter(([id]) => id !== uid).map(([id]) => light(user(id)));
    r.set(uid, socket.id);
    rooms.set(chat.id, r);
    for (const [id, sid] of r) if (id !== uid) toSock(sid, 'room:joined', { chatId: chat.id, user: light(user(uid)) });
    announce(chat.id);
    reply({ peers, ...iceConfig() });
  });
  socket.on('room:leave', ({ chatId } = {}) => leave(Number(chatId)));
  socket.on('room:signal', ({ chatId, to, data } = {}) => {
    const r = rooms.get(Number(chatId));
    if (!r || r.get(uid) !== socket.id || !r.has(to) || !data || JSON.stringify(data).length > 20_000) return;
    toSock(r.get(to), 'room:signal', { chatId: Number(chatId), from: uid, data });
  });

  socket.on('disconnect', () => {
    for (const c of [...calls.values()]) if (c.callerSock === socket.id || c.calleeSock === socket.id) finish(c, 'ended', uid);
    for (const chatId of [...rooms.keys()]) leave(chatId);
  });
}

export const roomState = (chatId) => [...(rooms.get(chatId)?.keys() || [])];
