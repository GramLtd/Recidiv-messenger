import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { db, tx, getSetting } from '../db.js';
import { fail } from '../auth.js';
import { changeBalance, pushBalance, getUser, notify, now, createMessage, getOrCreatePrivateChat } from '../services.js';

const r = Router();
export const webhooks = Router();

const packages = () => JSON.parse(getSetting('packages') || '[]');
const findPackage = (id) => packages().find((p) => p.id === id) || fail(400, 'Пакет не найден');

function serializePayment(p) {
  return { id: p.id, provider: p.provider, amount: p.amount, currency: p.currency, sparks: p.sparks, status: p.status, payUrl: p.pay_url, comment: p.comment, createdAt: p.created_at, paidAt: p.paid_at };
}

/** Idempotently credit a payment. */
export function creditPayment(paymentId) {
  const res = tx(() => {
    const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    if (!p || p.status === 'paid') return null;
    db.prepare("UPDATE payments SET status = 'paid', paid_at = ? WHERE id = ?").run(now(), p.id);
    changeBalance(p.user_id, p.sparks, 'topup', `Пополнение через ${p.provider === 'xrocket' ? 'xRocket' : p.provider === 'ton' ? 'TON-кошелёк' : 'тест'} (${p.amount} ${p.currency})`, `payment:${p.id}`);
    return p;
  });
  if (res) {
    pushBalance(res.user_id);
    notify(res.user_id, `✅ Баланс пополнен на ${res.sparks} ${getSetting('currency_symbol')} ${getSetting('currency_name')}`);
  }
  return res;
}

r.get('/wallet', (req, res) => {
  const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id);
  res.json({
    balance: getUser(req.user.id).balance,
    transactions: txs.map((t) => ({ id: t.id, amount: t.amount, balanceAfter: t.balance_after, type: t.type, description: t.description, createdAt: t.created_at })),
    packages: packages(),
    currency: { name: getSetting('currency_name'), nameEn: getSetting('currency_name_en'), symbol: getSetting('currency_symbol') },
    providers: {
      xrocket: !!config.xrocket.apiKey,
      ton: !!config.ton.wallet,
      test: config.allowTestPayments,
    },
  });
});

r.get('/config/public', (_req, res) => {
  res.json({
    currency: { name: getSetting('currency_name'), nameEn: getSetting('currency_name_en'), symbol: getSetting('currency_symbol') },
    marketFeePercent: Number(getSetting('market_fee_percent')),
  });
});

r.get('/wallet/payments', (req, res) => {
  const rows = db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  res.json({ payments: rows.map(serializePayment) });
});

// ----- xRocket Pay -----
async function xrocket(method, path, body) {
  const resp = await fetch(config.xrocket.baseUrl + path, {
    method,
    headers: { 'Rocket-Pay-Key': config.xrocket.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || data.success === false) fail(502, `xRocket: ${data.message || resp.status}`);
  return data.data;
}

r.post('/wallet/topup/xrocket', async (req, res) => {
  if (!config.xrocket.apiKey) fail(400, 'xRocket не настроен на сервере');
  const pkg = findPackage(req.body.packageId);
  const currency = req.body.currency === 'USDT' ? 'USDT' : 'TONCOIN';
  const amount = currency === 'USDT' ? pkg.usdt : pkg.ton;
  const comment = `xr-${crypto.randomBytes(8).toString('hex')}`;
  const ins = db
    .prepare('INSERT INTO payments (user_id, provider, package_id, amount, currency, sparks, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, 'xrocket', pkg.id, String(amount), currency, pkg.sparks, comment, now());
  const invoice = await xrocket('POST', '/tg-invoices', {
    amount,
    numPayments: 1,
    currency,
    description: `${pkg.sparks} ${getSetting('currency_name')} — Recidivist`,
    payload: comment,
    callbackUrl: config.publicUrl,
    expiredIn: 3600,
  });
  db.prepare('UPDATE payments SET external_id = ?, pay_url = ? WHERE id = ?').run(String(invoice.id), invoice.link, ins.lastInsertRowid);
  res.json({ payment: serializePayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(ins.lastInsertRowid)) });
});

/** xRocket webhook: HMAC-SHA256(body, sha256(apiKey)) in `rocket-pay-signature`. */
webhooks.post('/xrocket', (req, res) => {
  if (!config.xrocket.apiKey) return res.status(404).end();
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const secret = crypto.createHash('sha256').update(config.xrocket.apiKey).digest();
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const got = String(req.headers['rocket-pay-signature'] || '');
  if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) return res.status(401).end();
  const data = req.body?.data || {};
  if (req.body?.type === 'invoicePay' || data.status === 'paid') {
    const p = db.prepare("SELECT * FROM payments WHERE provider = 'xrocket' AND (external_id = ? OR comment = ?)").get(String(data.id), String(data.payload || ''));
    if (p) creditPayment(p.id);
  }
  res.json({ ok: true });
});

// ----- TON Connect -----
r.post('/wallet/topup/ton', (req, res) => {
  if (!config.ton.wallet) fail(400, 'TON-кошелёк проекта не настроен на сервере');
  const pkg = findPackage(req.body.packageId);
  const comment = `RCD-${crypto.randomBytes(6).toString('hex')}`;
  const ins = db
    .prepare('INSERT INTO payments (user_id, provider, package_id, amount, currency, sparks, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, 'ton', pkg.id, String(pkg.ton), 'TON', pkg.sparks, comment, now());
  res.json({
    payment: serializePayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(ins.lastInsertRowid)),
    address: config.ton.wallet,
    amountNano: String(Math.round(pkg.ton * 1e9)),
    comment,
  });
});

async function checkTon(p) {
  const url = `${config.ton.toncenter}/getTransactions?address=${encodeURIComponent(config.ton.wallet)}&limit=100&archival=true`;
  const resp = await fetch(url, { headers: config.ton.toncenterKey ? { 'X-API-Key': config.ton.toncenterKey } : {} });
  const data = await resp.json().catch(() => ({}));
  if (!data.ok) return false;
  const need = BigInt(Math.round(Number(p.amount) * 1e9));
  return data.result.some((t) => t.in_msg?.message === p.comment && BigInt(t.in_msg.value || 0) >= need);
}

r.post('/wallet/payments/:id/check', async (req, res) => {
  const p = db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!p) fail(404, 'Платёж не найден');
  if (p.status === 'pending') {
    let paid = false;
    if (p.provider === 'xrocket' && p.external_id) {
      const inv = await xrocket('GET', `/tg-invoices/${p.external_id}`);
      paid = inv?.status === 'paid';
      if (inv?.status === 'expired') db.prepare("UPDATE payments SET status = 'expired' WHERE id = ?").run(p.id);
    } else if (p.provider === 'ton') paid = await checkTon(p);
    if (paid) creditPayment(p.id);
  }
  res.json({ payment: serializePayment(db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id)) });
});

// ----- dev test payments -----
r.post('/wallet/topup/test', (req, res) => {
  if (!config.allowTestPayments) fail(403, 'Тестовые платежи отключены');
  const pkg = findPackage(req.body.packageId);
  const ins = db
    .prepare('INSERT INTO payments (user_id, provider, package_id, amount, currency, sparks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, 'test', pkg.id, '0', 'TEST', pkg.sparks, now());
  creditPayment(Number(ins.lastInsertRowid));
  res.json({ ok: true });
});

// ----- P2P transfer of currency -----
r.post('/wallet/transfer', (req, res) => {
  const to = getUser(Number(req.body.toUserId));
  const amount = Math.floor(Number(req.body.amount));
  if (!to || to.is_bot || to.id === req.user.id) fail(400, 'Некорректный получатель');
  if (!(amount > 0)) fail(400, 'Некорректная сумма');
  const comment = String(req.body.comment || '').slice(0, 140);
  tx(() => {
    changeBalance(req.user.id, -amount, 'transfer_out', `Перевод ${to.display_name}${comment ? `: ${comment}` : ''}`, `user:${to.id}`);
    changeBalance(to.id, amount, 'transfer_in', `Перевод от ${req.user.display_name}${comment ? `: ${comment}` : ''}`, `user:${req.user.id}`);
  });
  pushBalance(req.user.id, to.id);
  const chat = getOrCreatePrivateChat(req.user.id, to.id);
  createMessage({ chatId: chat.id, senderId: req.user.id, type: 'transfer', text: comment, media: { amount } });
  res.json({ ok: true });
});

export default r;
