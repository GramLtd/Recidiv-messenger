import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import { config, ROOT } from './config.js';
import './db.js';
import { requireAuth, requireAdmin } from './auth.js';
import { initRealtime } from './realtime.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import chatRoutes from './routes/chats.js';
import storyRoutes from './routes/stories.js';
import giftRoutes from './routes/gifts.js';
import marketRoutes from './routes/market.js';
import walletRoutes, { webhooks } from './routes/wallet.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '2mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhooks);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/api', requireAuth, userRoutes, chatRoutes, storyRoutes, giftRoutes, marketRoutes, walletRoutes);
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
  app.use(express.static(webDist));
  app.get(/^(?!\/(api|uploads|socket\.io)\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
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
server.listen(config.port, () => console.log(`🔴 Recidivist server on http://localhost:${config.port}`));
