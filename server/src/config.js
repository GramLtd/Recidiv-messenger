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

// Settings saved from the admin panel override the .env values (empty = use .env).
let override = () => undefined;
export function setConfigOverride(fn) { override = fn; }
const ov = (k) => {
  const v = override(k);
  return v === undefined || v === null || v === '' ? undefined : String(v);
};
const flag = (k, dflt) => {
  const v = ov(k);
  return v === undefined ? dflt : v === 'true' || v === '1';
};

export const config = {
  port: Number(env.PORT || 4000),
  publicUrl: env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`,
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  dbPath: env.DB_PATH || path.join(ROOT, 'data', 'recidivist.db'),
  uploadDir: env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads'),
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 50),
  get adminEmails() {
    return (ov('admin_emails') ?? env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  },
  // When SMTP is not configured, email codes are printed to the server console (dev mode).
  get smtp() {
    const host = ov('smtp_host') ?? env.SMTP_HOST;
    if (!host) return null;
    const fromAdmin = ov('smtp_host') !== undefined;
    const pick = (k, e) => (fromAdmin ? ov(k) : env[e]);
    const user = pick('smtp_user', 'SMTP_USER');
    return {
      host,
      port: Number(pick('smtp_port', 'SMTP_PORT') || 587),
      secure: (pick('smtp_secure', 'SMTP_SECURE') || '') === 'true',
      auth: user ? { user, pass: pick('smtp_pass', 'SMTP_PASS') } : undefined,
      from: pick('smtp_from', 'SMTP_FROM') || 'Recidivist <no-reply@recidivist.app>',
    };
  },
  xrocket: {
    get apiKey() { return ov('xrocket_key') ?? env.XROCKET_API_KEY ?? ''; },
    baseUrl: env.XROCKET_BASE_URL || 'https://pay.xrocket.tg',
  },
  ton: {
    get wallet() { return ov('ton_wallet') ?? env.TON_WALLET_ADDRESS ?? ''; },
    toncenter: env.TONCENTER_URL || 'https://toncenter.com/api/v2',
    get toncenterKey() { return ov('toncenter_key') ?? env.TONCENTER_API_KEY ?? ''; },
  },
  // Payment methods can be switched off from the admin panel without removing keys.
  pay: {
    get ton() { return flag('pay_ton', true); },
    get xrocket() { return flag('pay_xrocket', true); },
  },
  auth: {
    get registration() { return flag('registration', true); },
    get emailVerification() { return flag('email_verification', true); },
    get anonRegistration() { return flag('anon_registration', true); },
  },
  music: {
    jamendoClientId: env.JAMENDO_CLIENT_ID || '',
    auddToken: env.AUDD_API_TOKEN || '',
  },
  // Allows the "test payment" button in the wallet. Disable in production.
  get allowTestPayments() {
    const v = ov('test_payments');
    if (v !== undefined) return v === 'true';
    return env.ALLOW_TEST_PAYMENTS ? env.ALLOW_TEST_PAYMENTS === 'true' : env.NODE_ENV !== 'production';
  },
};
