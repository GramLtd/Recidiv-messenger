import { Router } from 'express';
import { db } from '../db.js';
import { fail } from '../auth.js';
import { safeUploadUrl, now } from '../services.js';
import { config } from '../config.js';
import multer from 'multer';

const r = Router();

const COVER_RE = /^https:\/\/([a-z0-9-]+\.)*(dzcdn\.net|deezer\.com|archive\.org|jamendo\.com)\/[^\s"'<>]+$/i;
const coverUrl = (u) => (typeof u === 'string' && COVER_RE.test(u) ? u : safeUploadUrl(u));

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

// ---------------- search on open sources ----------------
const EXTERNAL_RE = /^(deezer:\d+|https:\/\/(archive\.org|[a-z0-9-]+\.(us\.archive\.org|jamendo\.com))\/[^\s"'<>]+)$/i;
/** Our own uploads, or a track from an open source we can stream later. */
function trackUrl(url) {
  if (typeof url === 'string' && EXTERNAL_RE.test(url)) return url;
  return safeUploadUrl(url);
}

async function getJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout || 8000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': 'RecidivistMusic/1.0', ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function searchDeezer(q) {
  const d = await getJson(`https://api.deezer.com/search?limit=20&q=${encodeURIComponent(q)}`);
  return (d.data || []).filter((t) => t.preview).map((t) => ({
    source: 'deezer', full: false, id: `deezer:${t.id}`, url: `deezer:${t.id}`, stream: t.preview,
    title: t.title, artist: t.artist?.name || '', duration: 30, fullDuration: t.duration, cover: t.album?.cover_medium || null,
  }));
}

async function searchJamendo(q) {
  if (!config.music.jamendoClientId) return [];
  const d = await getJson(`https://api.jamendo.com/v3.0/tracks/?client_id=${config.music.jamendoClientId}&format=json&limit=15&audioformat=mp32&search=${encodeURIComponent(q)}`);
  return (d.results || []).filter((t) => t.audio).map((t) => ({
    source: 'jamendo', full: true, id: `jamendo:${t.id}`, url: t.audio, stream: t.audio,
    title: t.name, artist: t.artist_name || '', duration: t.duration, cover: t.image || null,
  }));
}

async function searchArchive(q) {
  const s = await getJson(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${q}) AND mediatype:audio`)}&fl[]=identifier&fl[]=title&fl[]=creator&rows=6&output=json`,
  );
  const docs = s.response?.docs || [];
  const out = await Promise.all(docs.map(async (doc) => {
    try {
      const m = await getJson(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`, { timeout: 6000 });
      const f = (m.files || []).find((x) => /mp3/i.test(x.format || '') || /\.mp3$/i.test(x.name || ''));
      if (!f) return null;
      const url = `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${f.name.split('/').map(encodeURIComponent).join('/')}`;
      return {
        source: 'archive', full: true, id: `archive:${doc.identifier}`, url, stream: url,
        title: f.title || doc.title || f.name, artist: f.creator || (Array.isArray(doc.creator) ? doc.creator[0] : doc.creator) || '',
        duration: Math.round(Number(f.length) || 0), cover: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
      };
    } catch {
      return null;
    }
  }));
  return out.filter(Boolean);
}

r.get('/music/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  if (q.length < 2) return res.json({ results: [], sources: [] });
  const settled = await Promise.allSettled([searchJamendo(q), searchArchive(q), searchDeezer(q)]);
  const names = ['jamendo', 'archive', 'deezer'];
  const results = settled.flatMap((x) => (x.status === 'fulfilled' ? x.value : []));
  res.json({
    results,
    sources: names.map((n, i) => ({ name: n, ok: settled[i].status === 'fulfilled', enabled: n !== 'jamendo' || !!config.music.jamendoClientId })),
    recognize: !!config.music.auddToken,
  });
});

/** Deezer preview links expire, so saved Deezer tracks are re-resolved on play. */
r.get('/music/resolve', async (req, res) => {
  const m = String(req.query.src || '').match(/^deezer:(\d+)$/);
  if (!m) fail(400, 'Неизвестный источник');
  const t = await getJson(`https://api.deezer.com/track/${m[1]}`);
  if (!t.preview) fail(404, 'Трек недоступен');
  res.json({ url: t.preview });
});

// ---------------- "Shazam": recognise a song from a short recording (AudD) ----------------
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 } });
r.post('/music/recognize', memUpload.single('file'), async (req, res) => {
  if (!config.music.auddToken) fail(400, 'Распознавание не настроено на сервере (AUDD_API_TOKEN)');
  if (!req.file) fail(400, 'Нет записи');
  const fd = new FormData();
  fd.append('api_token', config.music.auddToken);
  fd.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' }), 'sample.webm');
  const d = await getJson('https://api.audd.io/', { method: 'POST', body: fd, timeout: 20000 });
  if (d.status !== 'success') fail(502, d.error?.error_message || 'Сервис распознавания недоступен');
  if (!d.result) return res.json({ match: null });
  res.json({ match: { artist: d.result.artist, title: d.result.title, album: d.result.album } });
});

r.post('/music', (req, res) => {
  const url = trackUrl(req.body.url);
  if (!url) fail(400, 'Нужен аудиофайл');
  const guess = fromFileName(req.body.fileName);
  const title = String(req.body.title || guess.title).slice(0, 200);
  const artist = String(req.body.artist ?? guess.artist).slice(0, 200);
  if (db.prepare('SELECT 1 FROM tracks WHERE user_id = ? AND url = ?').get(req.user.id, url)) fail(409, 'Трек уже в вашей музыке');
  const count = db.prepare('SELECT COUNT(*) c FROM tracks WHERE user_id = ?').get(req.user.id).c;
  if (count >= 2000) fail(400, 'Достигнут лимит треков');
  const ins = db
    .prepare('INSERT INTO tracks (user_id, url, title, artist, duration, cover, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, url, title, artist, Math.round(Number(req.body.duration) || 0), coverUrl(req.body.cover), now());
  res.json({ track: serialize(db.prepare('SELECT * FROM tracks WHERE id = ?').get(ins.lastInsertRowid)) });
});

r.patch('/music/:id', (req, res) => {
  const t = db.prepare('SELECT * FROM tracks WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!t) fail(404, 'Трек не найден');
  db.prepare('UPDATE tracks SET title = ?, artist = ?, cover = ? WHERE id = ?').run(
    String(req.body.title ?? t.title).slice(0, 200) || t.title,
    String(req.body.artist ?? t.artist).slice(0, 200),
    req.body.cover !== undefined ? coverUrl(req.body.cover) : t.cover,
    t.id,
  );
  res.json({ track: serialize(db.prepare('SELECT * FROM tracks WHERE id = ?').get(t.id)) });
});

r.delete('/music/:id', (req, res) => {
  db.prepare('DELETE FROM tracks WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

export default r;
