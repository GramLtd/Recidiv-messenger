import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

const env = process.env;

if (env.NODE_ENV === 'production' && (!env.JWT_SECRET || env.JWT_SECRET === 'dev-secret-change-me')) {
  console.error('❌ Set a strong JWT_SECRET in production (see server/.env.example)');
  process.exit(1);
}

export const config = {
  port: Number(env.PORT || 4000),
  publicUrl: env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`,
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  dbPath: env.DB_PATH || path.join(ROOT, 'data', 'recidivist.db'),
  uploadDir: env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 50),
  adminEmails: (env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  // When SMTP is not configured, email codes are printed to the server console (dev mode).
  smtp: env.SMTP_HOST
    ? {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: env.SMTP_SECURE === 'true',
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        from: env.SMTP_FROM || 'Recidivist <no-reply@recidivist.app>',
      }
    : null,
  xrocket: {
    apiKey: env.XROCKET_API_KEY || '',
    baseUrl: env.XROCKET_BASE_URL || 'https://pay.xrocket.tg',
  },
  ton: {
    wallet: env.TON_WALLET_ADDRESS || '',
    toncenter: env.TONCENTER_URL || 'https://toncenter.com/api/v2',
    toncenterKey: env.TONCENTER_API_KEY || '',
  },
  // Allows the "test payment" button in the wallet. Disable in production.
  allowTestPayments: env.ALLOW_TEST_PAYMENTS ? env.ALLOW_TEST_PAYMENTS === 'true' : env.NODE_ENV !== 'production',
};
