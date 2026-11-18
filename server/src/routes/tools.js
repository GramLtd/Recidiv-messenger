import { Router } from 'express';
import dns from 'node:dns/promises';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { fail } from '../auth.js';

/*
 * Link previews and message translation. Everything goes through the server, so third-party sites never see the
 * reader's IP: the page is fetched here (SSRF-guarded), the preview image is saved to our uploads.
 */
const r = Router();

const PRIVATE = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(10|127|192\.168|169\.254)\./i, /^::$/];
async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error('bad protocol');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('bad port');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new Error('private host');
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => PRIVATE.some((re) => re.test(a.address)))) throw new Error('private address');
}

async function safeFetch(url, { maxBytes, accept }) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    const res = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecidivistBot/1.0; +https://recidivist.lol)', Accept: accept, 'Accept-Language': 'ru,en;q=0.8' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { u = new URL(res.headers.get('location'), u); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { reader.cancel().catch(() => {}); break; }
      chunks.push(value);
    }
    return { url: u, type: res.headers.get('content-type') || '', body: Buffer.concat(chunks) };
  }
  throw new Error('too many redirects');
}

const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim();
function meta(html, names) {
  for (const n of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const c = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (c) return decode(c);
  }
  return '';
}

const cache = new Map();
const IMG_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

r.get('/link-preview', async (req, res) => {
  const raw = String(req.query.url || '').slice(0, 2000);
  let key;
  try { key = new URL(raw).toString(); } catch { fail(400, 'Некорректная ссылка'); }
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 6 * 3600_000) return res.json({ preview: hit.data });
  let data = null;
  try {
    const page = await safeFetch(key, { maxBytes: 600_000, accept: 'text/html,application/xhtml+xml' });
    if (/text\/html|xhtml/.test(page.type)) {
      const html = page.body.toString('utf8');
      const title = meta(html, ['og:title', 'twitter:title']) || decode(html.match(/<title[^>]*>([^<]{1,300})/i)?.[1]);
      const description = meta(html, ['og:description', 'twitter:description', 'description']).slice(0, 300);
      const site = meta(html, ['og:site_name']) || page.url.hostname.replace(/^www\./, '');
      let image = null;
      const imgUrl = meta(html, ['og:image', 'og:image:url', 'twitter:image']);
      if (imgUrl) {
        try {
          const img = await safeFetch(new URL(imgUrl, page.url).toString(), { maxBytes: 3_000_000, accept: 'image/*' });
          const ext = IMG_EXT[img.type.split(';')[0].trim()];
          if (ext && img.body.length > 200) {
            const name = `lp-${crypto.createHash('sha1').update(img.body).digest('hex').slice(0, 24)}${ext}`;
            const file = path.join(config.uploadDir, name);
            if (!fs.existsSync(file)) fs.writeFileSync(file, img.body);
            image = `/uploads/${name}`;
          }
        } catch {}
      }
      if (title || description) data = { url: key, title: title.slice(0, 200), description, site: site.slice(0, 80), image };
    }
  } catch {}
  if (cache.size > 800) cache.delete(cache.keys().next().value);
  cache.set(key, { t: Date.now(), data });
  res.json({ preview: data });
});

// ---------- translation (server-side so the reader's IP stays private) ----------
const tcache = new Map();
r.post('/translate', async (req, res) => {
  const text = String(req.body.text || '').slice(0, 3000);
  const to = /^[a-z]{2}$/.test(req.body.to) ? req.body.to : 'ru';
  if (!text.trim()) fail(400, 'Пустой текст');
  const k = `${to}:${text}`;
  if (tcache.has(k)) return res.json(tcache.get(k));
  let out = null;
  try {
    const u = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
    const j = await (await fetch(u, { signal: AbortSignal.timeout(7000) })).json();
    out = { text: (j[0] || []).map((x) => x[0]).join(''), from: j[2] || null };
  } catch {
    try {
      const from = /[а-яё]/i.test(text) ? 'ru' : 'en';
      const j = await (await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=${from}|${to}`, { signal: AbortSignal.timeout(7000) })).json();
      if (j?.responseData?.translatedText) out = { text: j.responseData.translatedText, from };
    } catch {}
  }
  if (!out?.text) fail(502, 'Сервис перевода недоступен, попробуйте позже');
  if (tcache.size > 2000) tcache.delete(tcache.keys().next().value);
  tcache.set(k, out);
  res.json(out);
});

export default r;
