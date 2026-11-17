import { stripImageMetadata } from '../security.js';
import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db.js';
import { fail } from '../auth.js';
import { lightUser, getUser, publicUser, emitToUser, now, safeUploadUrl } from '../services.js';

const r = Router();

// ---------- uploads ----------
const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);
    cb(null, crypto.randomBytes(12).toString('hex') + (ext.length > 1 ? ext : ''));
  },
});
const upload = multer({ storage, limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

r.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) fail(400, 'Файл не получен');
  const mime = req.file.mimetype || '';
  if (/^image\/(jpeg|png|webp)$/.test(mime)) stripImageMetadata(req.file.path); // remove EXIF / GPS / XMP
  let kind = 'file';
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') kind = 'image';
  else if (mime.startsWith('video/')) kind = 'video';
  else if (mime.startsWith('audio/')) kind = /^voice-\d+\./.test(req.file.originalname) ? 'voice' : 'audio';
  res.json({
    url: `/uploads/${req.file.filename}`,
    kind,
    mime,
    name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    size: req.file.size,
  });
});

// ---------- stories ----------
const STORY_TTL = 24 * 3600 * 1000;

/** Story feed: me + everyone I share a private chat or group with. */
function audienceOf(userId) {
  return db
    .prepare(
      `SELECT DISTINCT m2.user_id id FROM chat_members m1
       JOIN chats c ON c.id = m1.chat_id AND c.type IN ('private','group')
       JOIN chat_members m2 ON m2.chat_id = c.id
       WHERE m1.user_id = ?`,
    )
    .all(userId)
    .map((x) => x.id);
}

function serializeStory(s, viewerId) {
  const viewed = !!db.prepare('SELECT 1 FROM story_views WHERE story_id = ? AND user_id = ?').get(s.id, viewerId);
  const out = { id: s.id, media: s.media, mediaType: s.media_type, caption: s.caption, bg: s.bg, createdAt: s.created_at, expiresAt: s.expires_at, viewed };
  if (s.user_id === viewerId) out.viewsCount = db.prepare('SELECT COUNT(*) c FROM story_views WHERE story_id = ?').get(s.id).c;
  return out;
}

r.get('/stories', (req, res) => {
  const me = req.user.id;
  const ids = new Set([me, ...audienceOf(me)]);
  const rows = db
    .prepare(`SELECT * FROM stories WHERE expires_at > ? AND user_id IN (${[...ids].map(() => '?').join(',')}) ORDER BY id`)
    .all(now(), ...ids);
  const byUser = new Map();
  for (const s of rows) {
    if (!byUser.has(s.user_id)) byUser.set(s.user_id, []);
    byUser.get(s.user_id).push(serializeStory(s, me));
  }
  const feed = [...byUser.entries()].map(([uid, stories]) => ({
    user: lightUser(getUser(uid)),
    stories,
    allViewed: stories.every((s) => s.viewed),
    isMe: uid === me,
  }));
  feed.sort((a, b) => (b.isMe - a.isMe) || (a.allViewed - b.allViewed) || (b.stories.at(-1).createdAt - a.stories.at(-1).createdAt));
  res.json({ feed });
});

r.post('/stories', (req, res) => {
  const { media, mediaType, caption, bg } = req.body;
  if (!media || !['image', 'video', 'text'].includes(mediaType)) fail(400, 'Нужен файл истории');
  const content = mediaType === 'text' ? String(media).slice(0, 300) : safeUploadUrl(media);
  const safeBg = bg && /^linear-gradient\([#a-z0-9,(). %-]+\)$/i.test(bg) ? bg : null;
  const t = now();
  const ins = db
    .prepare('INSERT INTO stories (user_id, media, media_type, caption, bg, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, content, mediaType, String(caption || '').slice(0, 500), safeBg, t, t + STORY_TTL);
  for (const uid of audienceOf(req.user.id)) if (uid !== req.user.id) emitToUser(uid, 'story:new', { userId: req.user.id });
  res.json({ story: serializeStory(db.prepare('SELECT * FROM stories WHERE id = ?').get(ins.lastInsertRowid), req.user.id) });
});

r.post('/stories/:id/view', (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id = ?').get(Number(req.params.id));
  if (!s) fail(404, 'История не найдена');
  if (s.user_id !== req.user.id) {
    db.prepare('INSERT OR IGNORE INTO story_views (story_id, user_id, viewed_at) VALUES (?, ?, ?)').run(s.id, req.user.id, now());
    if (req.body.reaction) {
      db.prepare('UPDATE story_views SET reaction = ? WHERE story_id = ? AND user_id = ?').run(String(req.body.reaction).slice(0, 16), s.id, req.user.id);
    }
  }
  res.json({ ok: true });
});

r.get('/stories/:id/viewers', (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id = ?').get(Number(req.params.id));
  if (!s || s.user_id !== req.user.id) fail(404, 'История не найдена');
  const rows = db
    .prepare('SELECT u.*, v.reaction, v.viewed_at FROM story_views v JOIN users u ON u.id = v.user_id WHERE v.story_id = ? ORDER BY v.viewed_at DESC')
    .all(s.id);
  res.json({ viewers: rows.map((u) => ({ user: publicUser(u), reaction: u.reaction, viewedAt: u.viewed_at })) });
});

r.delete('/stories/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id = ?').get(Number(req.params.id));
  if (!s || s.user_id !== req.user.id) fail(404, 'История не найдена');
  db.prepare('DELETE FROM stories WHERE id = ?').run(s.id);
  res.json({ ok: true });
});

export default r;
