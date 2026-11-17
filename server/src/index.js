import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import compression from 'compression';
import { config, ROOT } from './config.js';
import './db.js';
import { requireAuth, requireAdmin } from './auth.js';
import { securityHeaders, rateLimit, startExpirySweeper } from './security.js';
import { emitToChat } from './services.js';
import { initRealtime } from './realtime.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chats.js';
import storyRoutes from './routes/stories.js';
import giftRoutes from './routes/gifts.js';
import marketRoutes from './routes/market.js';
import walletRoutes, { webhooks } from './routes/wallet.js';
import adminRoutes from './routes/admin.js';
import musicRoutes from './routes/music.js';
import walletLinkRoutes from './routes/wallets.js';
import socialRoutes from './routes/social.js';
import stickerRoutes from './routes/stickers.js';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors());
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', rateLimit({ windowMs: 10 * 60_000, max: 60 }), authRoutes);
app.use('/api/upload', rateLimit({ windowMs: 10 * 60_000, max: 200 }));
app.use('/api/webhooks', webhooks);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/api', requireAuth, userRoutes, chatRoutes, storyRoutes, giftRoutes, marketRoutes, walletRoutes, musicRoutes, walletLinkRoutes, socialRoutes, stickerRoutes);
// TonConnect manifest for whatever domain the app is opened on (wallets check it for ton_proof).
app.get('/tonconnect-manifest.json', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res.json({ url: origin, name: 'Recidivist', iconUrl: `${origin}/icon-192.png` });
});
// Uploaded files: never let the browser render user-supplied HTML/SVG on our origin.
const INLINE_EXT = /\.(jpe?g|png|gif|webp|avif|mp4|webm|mov|m4a|mp3|ogg|wav|opus)$/i;
app.use('/uploads', express.static(config.uploadDir, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!INLINE_EXT.test(filePath)) res.setHeader('Content-Disposition', 'attachment');
  },
}));

// Serve the built web client (web/dist) in production.
const webDist = path.resolve(ROOT, '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  // hashed build assets never change; gift art / icons are cached for a week; index.html always fresh
  app.use('/assets', express.static(path.join(webDist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(webDist, {
    maxAge: '7d',
    setHeaders: (res, filePath) => { if (filePath.endsWith('.html') || filePath.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache'); },
  }));
  app.get(/^(?!\/(api|uploads|socket\.io)\/).*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(webDist, 'index.html')); });
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.status ? 'Внутренняя ошибка сервера' : err.message });
});

const server = http.createServer(app);
initRealtime(server);
startExpirySweeper(emitToChat);
server.listen(config.port, () => console.log(`🔴 Recidivist server on http://localhost:${config.port}`));
