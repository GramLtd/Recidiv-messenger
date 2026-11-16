import { Router } from 'express';
import { db, tx, getSetting } from '../db.js';
import { fail } from '../auth.js';
import { serializeUserGift, lightUser, getUser, changeBalance, pushBalance, notify, now } from '../services.js';

const r = Router();

function serializeListing(l, viewerId) {
  return {
    id: l.id,
    kind: l.kind,
    price: l.price,
    status: l.status,
    seller: lightUser(getUser(l.seller_id)),
    buyer: l.buyer_id ? lightUser(getUser(l.buyer_id)) : null,
    userGift: l.user_gift_id ? serializeUserGift(l.user_gift_id, viewerId) : null,
    username: l.username,
    mine: l.seller_id === viewerId,
    createdAt: l.created_at,
    closedAt: l.closed_at,
  };
}

r.get('/market', (req, res) => {
  const kind = req.query.kind === 'username' ? 'username' : req.query.kind === 'gift' ? 'gift' : null;
  const sort = { price_asc: 'l.price ASC', price_desc: 'l.price DESC', number: 'ug.number ASC' }[req.query.sort] || 'l.id DESC';
  const q = String(req.query.q || '').trim().toLowerCase();
  const giftId = Number(req.query.giftId) || null;
  const where = ["l.status = 'active'"];
  const args = [];
  if (kind) { where.push('l.kind = ?'); args.push(kind); }
  if (giftId) { where.push('ug.gift_id = ?'); args.push(giftId); }
  if (q) { where.push('(LOWER(l.username) LIKE ? OR LOWER(g.name) LIKE ? OR CAST(ug.number AS TEXT) = ?)'); args.push(`%${q}%`, `%${q}%`, q.replace('#', '')); }
  if (req.query.mine === '1') { where.push('l.seller_id = ?'); args.push(req.user.id); }
  const rows = db
    .prepare(
      `SELECT l.* FROM listings l
       LEFT JOIN user_gifts ug ON ug.id = l.user_gift_id
       LEFT JOIN gifts g ON g.id = ug.gift_id
       WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 200`,
    )
    .all(...args);
  const stats = db
    .prepare(
      `SELECT g.id, g.name, g.emoji, COUNT(*) count, MIN(l.price) floor FROM listings l
       JOIN user_gifts ug ON ug.id = l.user_gift_id JOIN gifts g ON g.id = ug.gift_id
       WHERE l.status = 'active' GROUP BY g.id ORDER BY count DESC`,
    )
    .all();
  res.json({
    listings: rows.map((l) => serializeListing(l, req.user.id)),
    collections: stats,
    feePercent: Number(getSetting('market_fee_percent')),
    minPrice: Number(getSetting('min_listing_price')),
  });
});

r.get('/market/history', (req, res) => {
  const rows = db
    .prepare("SELECT * FROM listings WHERE status = 'sold' AND (seller_id = ? OR buyer_id = ?) ORDER BY closed_at DESC LIMIT 100")
    .all(req.user.id, req.user.id);
  res.json({ listings: rows.map((l) => serializeListing(l, req.user.id)) });
});

r.post('/market/listings', (req, res) => {
  const price = Math.floor(Number(req.body.price));
  const min = Number(getSetting('min_listing_price'));
  if (!Number.isFinite(price) || price < min) fail(400, `Минимальная цена — ${min}`);
  if (price > 100_000_000) fail(400, 'Слишком высокая цена');
  let ins;
  if (req.body.kind === 'gift') {
    const ug = db.prepare('SELECT * FROM user_gifts WHERE id = ?').get(Number(req.body.userGiftId));
    if (!ug || ug.owner_id !== req.user.id || ug.converted) fail(404, 'Подарок не найден');
    if (!ug.upgraded_at) fail(400, 'Продавать можно только коллекционные подарки');
    if (db.prepare("SELECT 1 FROM listings WHERE kind = 'gift' AND user_gift_id = ? AND status = 'active'").get(ug.id)) fail(400, 'Уже выставлен');
    ins = db.prepare('INSERT INTO listings (seller_id, kind, user_gift_id, price, created_at) VALUES (?, ?, ?, ?, ?)').run(req.user.id, 'gift', ug.id, price, now());
  } else if (req.body.kind === 'username') {
    const name = String(req.body.username || '').toLowerCase();
    const row = db.prepare('SELECT * FROM usernames WHERE name = ? AND user_id = ?').get(name, req.user.id);
    if (!row) fail(404, 'Вы не владеете этим юзернеймом');
    if (db.prepare("SELECT 1 FROM listings WHERE kind = 'username' AND LOWER(username) = ? AND status = 'active'").get(name)) fail(400, 'Уже выставлен');
    ins = db.prepare('INSERT INTO listings (seller_id, kind, username, price, created_at) VALUES (?, ?, ?, ?, ?)').run(req.user.id, 'username', row.display, price, now());
  } else fail(400, 'Неизвестный тип лота');
  res.json({ listing: serializeListing(db.prepare('SELECT * FROM listings WHERE id = ?').get(ins.lastInsertRowid), req.user.id) });
});

r.patch('/market/listings/:id', (req, res) => {
  const l = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").get(Number(req.params.id));
  if (!l || l.seller_id !== req.user.id) fail(404, 'Лот не найден');
  const price = Math.floor(Number(req.body.price));
  if (!Number.isFinite(price) || price < Number(getSetting('min_listing_price'))) fail(400, 'Некорректная цена');
  db.prepare('UPDATE listings SET price = ? WHERE id = ?').run(price, l.id);
  res.json({ listing: serializeListing(db.prepare('SELECT * FROM listings WHERE id = ?').get(l.id), req.user.id) });
});

r.delete('/market/listings/:id', (req, res) => {
  const l = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").get(Number(req.params.id));
  if (!l || (l.seller_id !== req.user.id && !req.user.is_admin)) fail(404, 'Лот не найден');
  db.prepare("UPDATE listings SET status = 'cancelled', closed_at = ? WHERE id = ?").run(now(), l.id);
  res.json({ ok: true });
});

r.post('/market/listings/:id/buy', (req, res) => {
  const result = tx(() => {
    const l = db.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").get(Number(req.params.id));
    if (!l) fail(404, 'Лот уже продан или снят');
    if (l.seller_id === req.user.id) fail(400, 'Нельзя купить свой лот');
    if (req.body.expectedPrice != null && Number(req.body.expectedPrice) !== l.price) fail(409, 'Цена изменилась, обновите страницу');
    const fee = Math.floor((l.price * Number(getSetting('market_fee_percent'))) / 100);
    const label = l.kind === 'gift' ? (() => {
      const ug = db.prepare('SELECT ug.number, g.name FROM user_gifts ug JOIN gifts g ON g.id = ug.gift_id WHERE ug.id = ?').get(l.user_gift_id);
      return `«${ug.name}» #${ug.number}`;
    })() : `@${l.username}`;

    changeBalance(req.user.id, -l.price, 'market_buy', `Покупка ${label}`, `listing:${l.id}`);
    changeBalance(l.seller_id, l.price - fee, 'market_sell', `Продажа ${label} (комиссия ${fee})`, `listing:${l.id}`);

    if (l.kind === 'gift') {
      const ug = db.prepare('SELECT * FROM user_gifts WHERE id = ?').get(l.user_gift_id);
      if (ug.owner_id !== l.seller_id) fail(409, 'Продавец больше не владеет подарком');
      db.prepare('UPDATE user_gifts SET owner_id = ?, sender_id = ?, anonymous = 0, hidden = 0, pinned = 0 WHERE id = ?').run(req.user.id, l.seller_id, ug.id);
    } else {
      const row = db.prepare('SELECT * FROM usernames WHERE name = ?').get(l.username.toLowerCase());
      if (!row || row.user_id !== l.seller_id) fail(409, 'Продавец больше не владеет юзернеймом');
      db.prepare('UPDATE usernames SET user_id = ? WHERE name = ?').run(req.user.id, row.name);
      const seller = getUser(l.seller_id);
      if (seller.username?.toLowerCase() === row.name) {
        const other = db.prepare('SELECT display FROM usernames WHERE user_id = ? ORDER BY created_at LIMIT 1').get(seller.id);
        db.prepare('UPDATE users SET username = ? WHERE id = ?').run(other?.display || null, seller.id);
      }
      if (!req.user.username) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(row.display, req.user.id);
    }
    db.prepare("UPDATE listings SET status = 'sold', buyer_id = ?, closed_at = ? WHERE id = ?").run(req.user.id, now(), l.id);
    return { l, label, fee };
  });
  pushBalance(req.user.id, result.l.seller_id);
  notify(result.l.seller_id, `💰 ${req.user.display_name} купил(а) ${result.label} за ${result.l.price} ${getSetting('currency_symbol')}. Комиссия: ${result.fee}.`);
  res.json({ listing: serializeListing(db.prepare('SELECT * FROM listings WHERE id = ?').get(result.l.id), req.user.id) });
});

export default r;
