import { Router } from 'express';
import { db } from '../db.js';
import { fail } from '../auth.js';
import { safeUploadUrl, now } from '../services.js';

const r = Router();

const serialize = (t) => ({ id: t.id, url: t.url, title: t.title, artist: t.artist, duration: t.duration, cover: t.cover, createdAt: t.created_at });

/** Parse "Artist - Title.mp3" style file names. */
function fromFileName(name = '') {
  const base = name.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base || 'Без названия' };
}

r.get('/music', (req, res) => {
  const rows = db.prepare('SELECT * FROM tracks WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ tracks: rows.map(serialize) });
});

r.get('/users/:id/music', (req, res) => {
  const rows = db.prepare('SELECT * FROM tracks WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(Number(req.params.id));
  res.json({ tracks: rows.map(serialize) });
});

r.post('/music', (req, res) => {
  const url = safeUploadUrl(req.body.url);
  if (!url) fail(400, 'Нужен аудиофайл');
  const guess = fromFileName(req.body.fileName);
  const title = String(req.body.title || guess.title).slice(0, 200);
  const artist = String(req.body.artist ?? guess.artist).slice(0, 200);
  if (db.prepare('SELECT 1 FROM tracks WHERE user_id = ? AND url = ?').get(req.user.id, url)) fail(409, 'Трек уже в вашей музыке');
  const count = db.prepare('SELECT COUNT(*) c FROM tracks WHERE user_id = ?').get(req.user.id).c;
  if (count >= 2000) fail(400, 'Достигнут лимит треков');
  const ins = db
    .prepare('INSERT INTO tracks (user_id, url, title, artist, duration, cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, url, title, artist, Math.round(Number(req.body.duration) || 0), safeUploadUrl(req.body.cover), now());
  res.json({ track: serialize(db.prepare('SELECT * FROM tracks WHERE id = ?').get(ins.lastInsertRowid)) });
});

r.patch('/music/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!t) fail(404, 'Трек не найден');
  db.prepare('UPDATE tracks SET title = ?, artist = ?, cover = ? WHERE id = ?').run(
    String(req.body.title ?? t.title).slice(0, 200) || t.title,
    String(req.body.artist ?? t.artist).slice(0, 200),
    req.body.cover !== undefined ? safeUploadUrl(req.body.cover) : t.cover,
    t.id,
  );
  res.json({ track: serialize(db.prepare('SELECT * FROM tracks WHERE id = ?').get(t.id)) });
});

r.delete('/music/:id', (req, res) => {
  db.prepare('DELETE FROM tracks WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

export default r;
