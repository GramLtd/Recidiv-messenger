import { Router } from 'express';
import { config } from '../config.js';
import { db, tx, getSetting, setSetting, seedModelsForGift, SYSTEM_USER_ID, giftAssets } from '../db.js';
import { fail } from '../auth.js';
import { meUser, getUser, changeBalance, pushBalance, notify, serializeGift, emitToUser, now } from '../services.js';
import { creditPayment } from './wallet.js';

const r = Router();

r.get('/stats', (_req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const dayAgo = now() - 86400_000;
  res.json({
    users: one('SELECT COUNT(*) c FROM users WHERE is_bot = 0').c,
    newUsers24h: one('SELECT COUNT(*) c FROM users WHERE is_bot = 0 AND created_at > ?', dayAgo).c,
    banned: one('SELECT COUNT(*) c FROM users WHERE is_banned = 1').c,
    chats: one("SELECT COUNT(*) c FROM chats WHERE type IN ('group','channel')").c,
    messages: one('SELECT COUNT(*) c FROM messages').c,
    messages24h: one('SELECT COUNT(*) c FROM messages WHERE created_at > ?', dayAgo).c,
    totalBalance: one('SELECT COALESCE(SUM(balance),0) s FROM users').s,
    giftsSold: one('SELECT COUNT(*) c FROM user_gifts').c,
    collectibles: one('SELECT COUNT(*) c FROM user_gifts WHERE upgraded_at IS NOT NULL').c,
    activeListings: one("SELECT COUNT(*) c FROM listings WHERE status = 'active'").c,
    marketVolume: one("SELECT COALESCE(SUM(price),0) s FROM listings WHERE status = 'sold'").s,
    paidPayments: one("SELECT COUNT(*) c FROM payments WHERE status = 'paid' AND provider != 'test'").c,
    sparksPurchased: one("SELECT COALESCE(SUM(sparks),0) s FROM payments WHERE status = 'paid' AND provider != 'test'").s,
    activeStories: one('SELECT COUNT(*) c FROM stories WHERE expires_at > ?', now()).c,
  });
});

r.get('/users', (req, res) => {
  const q = String(req.query.q || '').trim();
  const like = `%${q}%`;
  const rows = db
    .prepare(
      `SELECT * FROM users WHERE is_bot = 0 AND (? = '' OR display_name LIKE ? OR email LIKE ? OR username LIKE ? OR CAST(id AS TEXT) = ?)
       ORDER BY id DESC LIMIT 200`,
    )
    .all(q, like, like, like, q);
  res.json({ users: rows.map(meUser) });
});

r.get('/users/:id', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) fail(404, 'Не найден');
  const txs = db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id);
  const usernames = db.prepare('SELECT display FROM usernames WHERE user_id = ?').all(u.id).map((x) => x.display);
  const gifts = db.prepare('SELECT COUNT(*) c FROM user_gifts WHERE owner_id = ? AND converted = 0').get(u.id).c;
  res.json({ user: meUser(u), transactions: txs, usernames, gifts });
});

r.post('/users/:id/balance', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) fail(404, 'Не найден');
  const amount = Math.trunc(Number(req.body.amount));
  if (!amount) fail(400, 'Укажите сумму');
  const reason = String(req.body.reason || '').slice(0, 200);
  tx(() => changeBalance(u.id, amount, amount > 0 ? 'admin_grant' : 'admin_revoke', reason || (amount > 0 ? 'Начисление администрацией' : 'Списание администрацией'), `admin:${req.user.id}`));
  pushBalance(u.id);
  if (amount > 0 && req.body.notify !== false) {
    notify(u.id, `🎉 Администрация начислила вам ${amount} ${getSetting('currency_symbol')} ${getSetting('currency_name')}${reason ? `\n«${reason}»` : ''}`);
  }
  res.json({ user: meUser(getUser(u.id)) });
});

r.post('/users/:id/flags', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) fail(404, 'Не найден');
  const { banned, verified, admin, tester } = req.body;
  if (u.id === req.user.id && (banned || admin === false)) fail(400, 'Нельзя заблокировать или разжаловать себя');
  db.prepare('UPDATE users SET is_banned = ?, verified = ?, is_admin = ?, is_tester = ? WHERE id = ?').run(
    banned !== undefined ? (banned ? 1 : 0) : u.is_banned,
    verified !== undefined ? (verified ? 1 : 0) : u.verified,
    admin !== undefined ? (admin ? 1 : 0) : u.is_admin,
    tester !== undefined ? (tester ? 1 : 0) : u.is_tester,
    u.id,
  );
  if (banned) {
    db.prepare("UPDATE listings SET status = 'cancelled', closed_at = ? WHERE seller_id = ? AND status = 'active'").run(now(), u.id);
    emitToUser(u.id, 'force-logout', {});
  }
  res.json({ user: meUser(getUser(u.id)) });
});

// ----- gifts -----
r.get('/gifts', (_req, res) => {
  const gifts = db.prepare('SELECT * FROM gifts ORDER BY sort, id').all().map((g) => ({
    ...serializeGift(g),
    sort: g.sort,
    upgraded: db.prepare('SELECT COUNT(*) c FROM user_gifts WHERE gift_id = ? AND upgraded_at IS NOT NULL').get(g.id).c,
    models: db.prepare('SELECT * FROM gift_models WHERE gift_id = ?').all(g.id),
  }));
  res.json({ gifts });
});

function giftFields(b, prev = {}) {
  const val = (k, d) => (b[k] !== undefined ? b[k] : d);
  const name = String(val('name', prev.name) || '').trim();
  const emoji = String(val('emoji', prev.emoji) || '').trim();
  if (!name || !emoji) fail(400, 'Нужны название и эмодзи');
  const num = (v) => (v === null || v === '' || v === undefined ? null : Math.max(0, Math.floor(Number(v))));
  const price = num(val('price', prev.price));
  if (!price) fail(400, 'Цена должна быть больше 0');
  return {
    name, emoji,
    image: val('image', prev.image) || null,
    price,
    supply: num(val('supply', prev.supply)),
    upgrade_price: num(val('upgradePrice', prev.upgrade_price)),
    convert_value: num(val('convertValue', prev.convert_value)) ?? Math.floor(price * 0.85),
    enabled: val('enabled', prev.enabled ?? true) ? 1 : 0,
    sort: num(val('sort', prev.sort)) ?? 0,
  };
}

r.post('/gifts', (req, res) => {
  const f = giftFields(req.body);
  const assets = giftAssets(f.emoji);
  const id = tx(() => {
    const ins = db
      .prepare('INSERT INTO gifts (name, emoji, image, animation, price, supply, upgrade_price, convert_value, enabled, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(f.name, f.emoji, f.image || assets.image, assets.animation, f.price, f.supply, f.upgrade_price, f.convert_value, f.enabled, f.sort, now());
    seedModelsForGift(ins.lastInsertRowid, f.emoji);
    return ins.lastInsertRowid;
  });
  res.json({ gift: serializeGift(db.prepare('SELECT * FROM gifts WHERE id = ?').get(id)) });
});

r.patch('/gifts/:id', (req, res) => {
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(Number(req.params.id));
  if (!g) fail(404, 'Не найден');
  const f = giftFields(req.body, g);
  if (f.supply != null && f.supply < g.sold) fail(400, `Тираж не может быть меньше проданного (${g.sold})`);
  db.prepare('UPDATE gifts SET name = ?, emoji = ?, image = ?, price = ?, supply = ?, upgrade_price = ?, convert_value = ?, enabled = ?, sort = ? WHERE id = ?').run(
    f.name, f.emoji, f.image, f.price, f.supply, f.upgrade_price, f.convert_value, f.enabled, f.sort, g.id,
  );
  if (f.emoji !== g.emoji) {
    db.prepare('UPDATE gift_models SET emoji = ? WHERE gift_id = ? AND emoji = ?').run(f.emoji, g.id, g.emoji);
    const a = giftAssets(f.emoji);
    db.prepare('UPDATE gifts SET image = ?, animation = ? WHERE id = ?').run(req.body.image || a.image, a.animation, g.id);
  }
  res.json({ gift: serializeGift(db.prepare('SELECT * FROM gifts WHERE id = ?').get(g.id)) });
});

r.put('/gifts/:id/models', (req, res) => {
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(Number(req.params.id));
  if (!g) fail(404, 'Не найден');
  const models = (req.body.models || []).filter((m) => m.name && m.emoji && Number(m.rarity) > 0);
  if (!models.length) fail(400, 'Нужна хотя бы одна модель');
  tx(() => {
    const keep = new Set(models.filter((m) => m.id).map((m) => Number(m.id)));
    for (const old of db.prepare('SELECT id FROM gift_models WHERE gift_id = ?').all(g.id)) {
      const used = db.prepare('SELECT 1 FROM user_gifts WHERE model_id = ?').get(old.id);
      if (!keep.has(old.id) && !used) db.prepare('DELETE FROM gift_models WHERE id = ?').run(old.id);
      else if (!keep.has(old.id)) db.prepare('UPDATE gift_models SET rarity = 0 WHERE id = ?').run(old.id);
    }
    for (const m of models) {
      if (m.id) db.prepare('UPDATE gift_models SET name = ?, emoji = ?, filter = ?, rarity = ? WHERE id = ? AND gift_id = ?').run(m.name, m.emoji, m.filter || '', Number(m.rarity), Number(m.id), g.id);
      else db.prepare('INSERT INTO gift_models (gift_id, name, emoji, filter, image, animation, rarity) VALUES (?, ?, ?, ?, ?, ?, ?)').run(g.id, m.name, m.emoji, m.filter || '', m.image || null, m.animation || null, Number(m.rarity));
    }
  });
  res.json({ models: db.prepare('SELECT * FROM gift_models WHERE gift_id = ?').all(g.id) });
});

/** Give a gift directly from the admin panel (free, doesn't count towards sold unless asked). */
r.post('/gifts/:id/grant', (req, res) => {
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(Number(req.params.id));
  const to = getUser(Number(req.body.userId));
  if (!g || !to) fail(404, 'Не найден');
  const ins = db.prepare('INSERT INTO user_gifts (gift_id, owner_id, sender_id, message, created_at) VALUES (?, ?, ?, ?, ?)').run(g.id, to.id, SYSTEM_USER_ID, String(req.body.message || ''), now());
  if (req.body.countSold) db.prepare('UPDATE gifts SET sold = sold + 1 WHERE id = ?').run(g.id);
  notify(to.id, '🎁 Подарок от администрации Recidivist', { type: 'gift', userGiftId: Number(ins.lastInsertRowid) });
  res.json({ ok: true });
});

// ----- attributes -----
r.get('/attributes', (_req, res) => {
  res.json({ backdrops: db.prepare('SELECT * FROM backdrops').all(), symbols: db.prepare('SELECT * FROM symbols').all() });
});
r.post('/backdrops', (req, res) => {
  const { name, center, edge, pattern, rarity } = req.body;
  if (!name || !center || !edge || !pattern) fail(400, 'Заполните все поля');
  db.prepare('INSERT INTO backdrops (name, center, edge, pattern, rarity) VALUES (?, ?, ?, ?, ?)').run(name, center, edge, pattern, Number(rarity) || 10);
  res.json({ ok: true });
});
r.post('/symbols', (req, res) => {
  const { name, emoji, rarity } = req.body;
  if (!name || !emoji) fail(400, 'Заполните все поля');
  db.prepare('INSERT INTO symbols (name, emoji, rarity) VALUES (?, ?, ?)').run(name, emoji, Number(rarity) || 10);
  res.json({ ok: true });
});
r.patch('/attributes/:table/:id', (req, res) => {
  const table = { backdrops: 'backdrops', symbols: 'symbols' }[req.params.table] || fail(400, 'Неизвестная таблица');
  db.prepare(`UPDATE ${table} SET rarity = ? WHERE id = ?`).run(Math.max(0, Number(req.body.rarity) || 0), Number(req.params.id));
  res.json({ ok: true });
});

// ----- money -----
r.get('/transactions', (req, res) => {
  const rows = db
    .prepare('SELECT t.*, u.display_name, u.username FROM transactions t JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT ?')
    .all(Math.min(Number(req.query.limit) || 200, 1000));
  res.json({ transactions: rows });
});

r.get('/payments', (_req, res) => {
  const rows = db.prepare('SELECT p.*, u.display_name FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 300').all();
  res.json({ payments: rows });
});

r.post('/payments/:id/approve', (req, res) => {
  const p = creditPayment(Number(req.params.id));
  if (!p) fail(400, 'Платёж уже зачислен или не найден');
  res.json({ ok: true });
});

r.get('/listings', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT l.*, u.display_name seller_name, g.name gift_name, g.emoji, ug.number FROM listings l
       JOIN users u ON u.id = l.seller_id LEFT JOIN user_gifts ug ON ug.id = l.user_gift_id LEFT JOIN gifts g ON g.id = ug.gift_id
       ORDER BY l.id DESC LIMIT 300`,
    )
    .all();
  res.json({ listings: rows });
});

// ----- settings -----
const EDITABLE = ['currency_name', 'currency_name_en', 'currency_symbol', 'market_fee_percent', 'min_listing_price', 'username_price', 'signup_bonus', 'packages'];
r.get('/settings', (_req, res) => {
  res.json({ settings: Object.fromEntries(EDITABLE.map((k) => [k, getSetting(k)])) });
});
r.put('/settings', (req, res) => {
  for (const k of EDITABLE) {
    if (req.body[k] === undefined) continue;
    if (k === 'packages') {
      const pk = typeof req.body[k] === 'string' ? JSON.parse(req.body[k]) : req.body[k];
      if (!Array.isArray(pk) || pk.some((p) => !p.id || !(p.sparks > 0))) fail(400, 'Некорректные пакеты');
      setSetting(k, JSON.stringify(pk));
    } else setSetting(k, req.body[k]);
  }
  res.json({ settings: Object.fromEntries(EDITABLE.map((k) => [k, getSetting(k)])) });
});

// ----- payment methods & sign-in (override .env) -----
const CFG = {
  pay_ton: 'bool', ton_wallet: 'str', toncenter_key: 'secret',
  pay_xrocket: 'bool', xrocket_key: 'secret', test_payments: 'tri',
  registration: 'bool', email_verification: 'bool', admin_emails: 'str',
  tenor_key: 'secret',
  smtp_host: 'str', smtp_port: 'str', smtp_secure: 'tri', smtp_user: 'str', smtp_pass: 'secret', smtp_from: 'str',
};
const mask = (v) => (v ? `••••${String(v).slice(-4)}` : '');
function cfgState() {
  const values = {};
  for (const [k, t] of Object.entries(CFG)) {
    const v = getSetting(`cfg_${k}`) || '';
    values[k] = t === 'secret' ? mask(v) : v;
  }
  return {
    values,
    effective: {
      tonWallet: config.ton.wallet, tonEnabled: config.pay.ton && !!config.ton.wallet,
      xrocketConfigured: !!config.xrocket.apiKey, xrocketEnabled: config.pay.xrocket && !!config.xrocket.apiKey,
      testPayments: config.allowTestPayments, smtp: !!config.smtp, smtpHost: config.smtp?.host || null,
      registration: config.auth.registration, emailVerification: config.auth.emailVerification, adminEmails: config.adminEmails,
    },
  };
}
r.get('/config', (_req, res) => res.json(cfgState()));
r.put('/config', (req, res) => {
  const b = req.body || {};
  for (const [k, t] of Object.entries(CFG)) {
    if (b[k] === undefined) continue;
    let v = b[k] === null ? '' : String(b[k]).trim();
    if (t === 'secret' && v.startsWith('••••')) continue; // unchanged
    if (t === 'bool') v = v === '' ? '' : v === 'true' || v === '1' ? 'true' : 'false';
    if (t === 'tri') v = v === '' ? '' : v === 'true' ? 'true' : 'false';
    if (k === 'smtp_port' && v && !/^\d{2,5}$/.test(v)) fail(400, 'Некорректный порт SMTP');
    if (k === 'ton_wallet' && v && !/^[A-Za-z0-9_\-:]{40,70}$/.test(v)) fail(400, 'Некорректный TON-адрес');
    setSetting(`cfg_${k}`, v.slice(0, 500));
  }
  res.json(cfgState());
});

/** Broadcast an announcement from the official account to every user. */
r.post('/broadcast', (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) fail(400, 'Пустое сообщение');
  const ids = db.prepare('SELECT id FROM users WHERE is_bot = 0 AND is_banned = 0').all();
  for (const { id } of ids) notify(id, `📢 ${text}`);
  res.json({ sent: ids.length });
});

export default r;
