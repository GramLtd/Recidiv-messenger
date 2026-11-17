import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getSetting } from '../db.js';
import { fail } from '../auth.js';

/** Built-in sticker packs (made from our gift art) and GIF search via Tenor. */
const r = Router();

const WEB_PUBLIC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'web', 'public');
const COLLECTIONS = JSON.parse(fs.readFileSync(new URL('../gift-collections.json', import.meta.url), 'utf8'));
const PACK_NAMES = { 'kot-stukach': 'Кот-Стукач', 'pahan-pepe': 'Пахан Пепе', 'sigara-smotryashchego': 'Сигара Смотрящего', 'blatnoy-patefon': 'Блатной Патефон' };

let packsCache = null;
function packs() {
  if (packsCache) return packsCache;
  const list = [];
  const regularDir = path.join(WEB_PUBLIC, 'gifts', 'regular');
  if (fs.existsSync(regularDir)) {
    const ids = fs.readdirSync(regularDir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5));
    list.push({ id: 'regular', name: 'Эмоции', stickers: ids.map((id) => ({ url: `/gifts/regular/${id}.webp`, animation: fs.existsSync(path.join(regularDir, `${id}.tgs`)) ? `/gifts/regular/${id}.tgs` : undefined })) });
  }
  for (const [slug, models] of Object.entries(COLLECTIONS)) {
    list.push({ id: slug, name: PACK_NAMES[slug] || slug, stickers: models.map((m) => ({ url: m.image, animation: m.animation, title: m.name })) });
  }
  packsCache = list;
  return list;
}

r.get('/stickers/packs', (_req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json({ packs: packs() });
});

// ---------- GIF search (Tenor v2) ----------
const tenorKey = () => getSetting('cfg_tenor_key') || process.env.TENOR_API_KEY || '';
const pick = (r0) => {
  const f = r0.media_formats || {};
  const mp4 = f.mp4 || f.tinymp4 || f.nanomp4;
  const prev = f.tinymp4 || f.nanomp4 || f.mp4;
  if (!mp4) return null;
  return { id: r0.id, url: mp4.url, preview: prev?.url || mp4.url, width: mp4.dims?.[0], height: mp4.dims?.[1] };
};
async function tenor(endpoint, params) {
  const key = tenorKey();
  if (!key) return { disabled: true, gifs: [] };
  const u = new URL(`https://tenor.googleapis.com/v2/${endpoint}`);
  Object.entries({ key, client_key: 'recidivist', media_filter: 'mp4,tinymp4,nanomp4', contentfilter: 'medium', locale: 'ru_RU', limit: 30, ...params }).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  const resp = await fetch(u, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) fail(502, 'Поиск GIF недоступен');
  const j = await resp.json();
  return { gifs: (j.results || []).map(pick).filter(Boolean), next: j.next || null };
}
r.get('/gifs/trending', async (req, res) => res.json(await tenor('featured', { pos: req.query.pos })));
r.get('/gifs/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 64);
  if (!q) return res.json(await tenor('featured', {}));
  res.json(await tenor('search', { q, pos: req.query.pos }));
});

export default r;
