import { Router } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { db, getSetting, tx } from '../db.js';
import { signToken, hashAuthKey, fail, requireAuth } from '../auth.js';
import { meUser, changeBalance, notify, assertUsernameFree, now, getOrCreatePrivateChat } from '../services.js';

const r = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// SMTP can be changed from the admin panel, so the transport is rebuilt when settings change.
let mailerKey = null;
let mailerCache = null;
function getMailer() {
  const cfg = config.smtp;
  const key = JSON.stringify(cfg);
  if (key !== mailerKey) {
    mailerKey = key;
    mailerCache = cfg ? nodemailer.createTransport(cfg) : null;
  }
  return mailerCache;
}

r.get('/config', (_req, res) => {
  res.json({ auth: { registration: config.auth.registration, emailVerification: config.auth.emailVerification } });
});

async function sendMail(to, subject, text) {
  const mailer = getMailer();
  if (!mailer) {
    console.log(`\n📧 [dev mail] to=${to}\n   ${subject}\n   ${text}\n`);
    return;
  }
  await mailer.sendMail({ from: config.smtp.from, to, subject, text });
}

r.post('/send-code', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) fail(400, 'Некорректный email');
  if (!config.auth.registration) fail(403, 'Регистрация временно закрыта');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'Этот email уже зарегистрирован. Войдите по сид-фразе.');
  if (!config.auth.emailVerification) {
    return res.json({ emailToken: jwt.sign({ email, purpose: 'register' }, config.jwtSecret, { expiresIn: '30m' }) });
  }
  const existing = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(email);
  if (existing && existing.expires_at - 9 * 60_000 > now()) fail(429, 'Подождите минуту перед повторной отправкой');
  const code = String(crypto.randomInt(100000, 1000000));
  db.prepare(
    'INSERT INTO email_codes (email, code, expires_at, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0',
  ).run(email, code, now() + 10 * 60_000);
  await sendMail(email, 'Код подтверждения Recidivist', `Ваш код: ${code}\nОн действует 10 минут.`);
  res.json({ ok: true, devMode: !getMailer() });
});

r.post('/verify-code', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();
  const row = db.prepare('SELECT * FROM email_codes WHERE email = ?').get(email);
  if (!row || row.expires_at < now()) fail(400, 'Код истёк, запросите новый');
  if (row.attempts >= 5) fail(429, 'Слишком много попыток, запросите новый код');
  if (row.code !== code) {
    db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
    fail(400, 'Неверный код');
  }
  db.prepare('DELETE FROM email_codes WHERE email = ?').run(email);
  const emailToken = jwt.sign({ email, purpose: 'register' }, config.jwtSecret, { expiresIn: '30m' });
  res.json({ emailToken });
});

r.post('/register', (req, res) => {
  if (!config.auth.registration) fail(403, 'Регистрация временно закрыта');
  const { emailToken, authKey, displayName, username } = req.body;
  let email;
  try {
    const p = jwt.verify(emailToken, config.jwtSecret);
    if (p.purpose !== 'register') throw new Error();
    email = p.email;
  } catch {
    fail(400, 'Подтверждение почты истекло, начните заново');
  }
  if (typeof authKey !== 'string' || authKey.length < 64) fail(400, 'Некорректный ключ');
  const name = String(displayName || '').trim().slice(0, 64);
  if (!name) fail(400, 'Укажите имя');
  const authHash = hashAuthKey(authKey);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'Email уже зарегистрирован');
  if (db.prepare('SELECT 1 FROM users WHERE auth_hash = ?').get(authHash)) fail(409, 'Эта сид-фраза уже используется');
  if (username) assertUsernameFree(username);

  const user = tx(() => {
    const realUsers = db.prepare('SELECT COUNT(*) c FROM users WHERE is_bot = 0').get().c;
    const isAdmin =
      config.adminEmails.includes(email) || (realUsers === 0 && config.adminEmails.length === 0 && process.env.NODE_ENV !== 'production');
    const ins = db
      .prepare('INSERT INTO users (email, auth_hash, display_name, is_admin, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
      .run(email, authHash, name, isAdmin ? 1 : 0, now(), now());
    const id = Number(ins.lastInsertRowid);
    if (username) {
      db.prepare('INSERT INTO usernames (name, display, user_id, created_at) VALUES (?, ?, ?, ?)').run(username.toLowerCase(), username, id, now());
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, id);
    }
    const bonus = Number(getSetting('signup_bonus') || 0);
    if (bonus > 0) changeBalance(id, bonus, 'bonus', 'Бонус за регистрацию');
    getOrCreatePrivateChat(id, id); // "Saved messages"
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  });

  const bonus = Number(getSetting('signup_bonus') || 0);
  notify(
    user.id,
    `Добро пожаловать в Recidivist, ${user.display_name}! 🔴\n\n` +
      (bonus ? `На ваш баланс начислено ${bonus} ${getSetting('currency_symbol')} ${getSetting('currency_name')}.\n` : '') +
      'Никому не сообщайте свою сид-фразу — это единственный ключ к аккаунту.',
  );
  res.json({ token: signToken(user.id, req), user: meUser(user) });
});

r.post('/login', (req, res) => {
  const { authKey } = req.body;
  if (typeof authKey !== 'string' || authKey.length < 64) fail(400, 'Некорректная сид-фраза');
  const user = db.prepare('SELECT * FROM users WHERE auth_hash = ?').get(hashAuthKey(authKey));
  if (!user) fail(401, 'Аккаунт с такой сид-фразой не найден');
  if (user.is_banned) fail(403, 'Аккаунт заблокирован');
  res.json({ token: signToken(user.id, req), user: meUser(user) });
});

r.get('/me', requireAuth, (req, res) => {
  res.json({ user: meUser(req.user) });
});

export default r;
