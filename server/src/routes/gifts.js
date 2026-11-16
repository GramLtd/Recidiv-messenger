import { Router } from 'express';
import { db, tx, getSetting } from '../db.js';
import { fail } from '../auth.js';
import {
  serializeGift, serializeUserGift, changeBalance, pushBalance, getUser, notify, createMessage,
  getOrCreatePrivateChat, weightedPick, giftSlug, now, emitToUser,
} from '../services.js';

const r = Router();

r.get('/gifts', (_req, res) => {
  const gifts = db.prepare('SELECT * FROM gifts WHERE enabled = 1 ORDER BY sort, id').all().map(serializeGift);
  res.json({ gifts });
});

/** Preview of possible collectible attributes for a gift (models / backdrops / symbols with chances). */
r.get('/gifts/:id/attributes', (req, res) => {
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(Number(req.params.id));
  if (!g) fail(404, 'Подарок не найден');
  const pct = (rows) => {
    const total = rows.reduce((s, x) => s + x.rarity, 0) || 1;
    return rows.map((x) => ({ ...x, chance: Math.round((x.rarity / total) * 1000) / 10 }));
  };
  res.json({
    gift: serializeGift(g),
    models: pct(db.prepare('SELECT * FROM gift_models WHERE gift_id = ?').all(g.id)),
    backdrops: pct(db.prepare('SELECT * FROM backdrops').all()),
    symbols: pct(db.prepare('SELECT * FROM symbols').all()),
  });
});

r.post('/gifts/:id/buy', (req, res) => {
  const g = db.prepare('SELECT * FROM gifts WHERE id = ? AND enabled = 1').get(Number(req.params.id));
  if (!g) fail(404, 'Подарок не найден');
  const to = getUser(Number(req.body.toUserId || req.user.id));
  if (!to || to.is_bot) fail(404, 'Получатель не найден');
  const message = String(req.body.message || '').slice(0, 255);
  const anonymous = req.body.anonymous ? 1 : 0;

  const ugId = tx(() => {
    const fresh = db.prepare('SELECT * FROM gifts WHERE id = ?').get(g.id);
    if (fresh.supply != null && fresh.sold >= fresh.supply) fail(410, 'Подарки закончились — ищите их на маркете');
    changeBalance(req.user.id, -fresh.price, 'gift_buy', `Подарок «${fresh.name}» для ${to.display_name}`, `gift:${fresh.id}`);
    db.prepare('UPDATE gifts SET sold = sold + 1 WHERE id = ?').run(fresh.id);
    const ins = db
      .prepare('INSERT INTO user_gifts (gift_id, owner_id, sender_id, message, anonymous, price_paid, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(fresh.id, to.id, req.user.id, message, anonymous, fresh.price, now());
    return Number(ins.lastInsertRowid);
  });
  pushBalance(req.user.id);

  if (to.id !== req.user.id && !anonymous) {
    const chat = getOrCreatePrivateChat(req.user.id, to.id);
    createMessage({ chatId: chat.id, senderId: req.user.id, type: 'gift', text: message, userGiftId: ugId });
  } else {
    notify(to.id, anonymous ? '🎁 Вам отправили анонимный подарок!' : '🎁 Подарок добавлен в ваш профиль', { type: 'gift', userGiftId: ugId });
  }
  emitToUser(to.id, 'gift:received', { userGift: serializeUserGift(ugId, to.id) });
  res.json({ userGift: serializeUserGift(ugId, req.user.id) });
});

r.get('/users/:id/gifts', (req, res) => {
  const ownerId = Number(req.params.id);
  const own = ownerId === req.user.id;
  const rows = db
    .prepare(
      `SELECT * FROM user_gifts WHERE owner_id = ? AND converted = 0 ${own ? '' : 'AND hidden = 0'}
       ORDER BY pinned DESC, (upgraded_at IS NOT NULL) DESC, id DESC`,
    )
    .all(ownerId);
  res.json({ gifts: rows.map((x) => serializeUserGift(x, req.user.id)) });
});

r.get('/user-gifts/:id', (req, res) => {
  const ug = serializeUserGift(Number(req.params.id), req.user.id);
  if (!ug) fail(404, 'Подарок не найден');
  res.json({ userGift: ug });
});

r.get('/collectibles/:slug', (req, res) => {
  const m = String(req.params.slug).match(/^(.+)-(\d+)$/);
  if (!m) fail(404, 'Не найдено');
  const rows = db.prepare('SELECT ug.*, g.name gname FROM user_gifts ug JOIN gifts g ON g.id = ug.gift_id WHERE ug.number = ? AND ug.upgraded_at IS NOT NULL').all(Number(m[2]));
  const row = rows.find((x) => giftSlug(x.gname, x.number) === req.params.slug);
  if (!row) fail(404, 'Не найдено');
  res.json({ userGift: serializeUserGift(row, req.user.id) });
});

function loadOwned(id, userId) {
  const ug = db.prepare('SELECT * FROM user_gifts WHERE id = ?').get(Number(id));
  if (!ug || ug.owner_id !== userId || ug.converted) fail(404, 'Подарок не найден');
  return ug;
}
function assertNotListed(ugId) {
  if (db.prepare("SELECT 1 FROM listings WHERE kind = 'gift' AND user_gift_id = ? AND status = 'active'").get(ugId)) {
    fail(400, 'Сначала снимите подарок с продажи');
  }
}

r.post('/user-gifts/:id/upgrade', (req, res) => {
  const ug = loadOwned(req.params.id, req.user.id);
  if (ug.upgraded_at) fail(400, 'Подарок уже коллекционный');
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(ug.gift_id);
  if (g.upgrade_price == null) fail(400, 'Этот подарок нельзя улучшить');
  tx(() => {
    changeBalance(req.user.id, -g.upgrade_price, 'gift_upgrade', `Улучшение «${g.name}»`, `ug:${ug.id}`);
    const number = (db.prepare('SELECT MAX(number) n FROM user_gifts WHERE gift_id = ?').get(g.id).n || 0) + 1;
    const model = weightedPick(db.prepare('SELECT * FROM gift_models WHERE gift_id = ?').all(g.id));
    const backdrop = weightedPick(db.prepare('SELECT * FROM backdrops').all());
    const symbol = weightedPick(db.prepare('SELECT * FROM symbols').all());
    if (!model) fail(500, 'У подарка нет моделей');
    db.prepare('UPDATE user_gifts SET number = ?, model_id = ?, backdrop_id = ?, symbol_id = ?, upgraded_at = ? WHERE id = ?').run(
      number, model.id, backdrop.id, symbol.id, now(), ug.id,
    );
  });
  pushBalance(req.user.id);
  res.json({ userGift: serializeUserGift(ug.id, req.user.id) });
});

r.post('/user-gifts/:id/convert', (req, res) => {
  const ug = loadOwned(req.params.id, req.user.id);
  if (ug.upgraded_at) fail(400, 'Коллекционный подарок нельзя конвертировать — продайте его на маркете');
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(ug.gift_id);
  tx(() => {
    db.prepare('UPDATE user_gifts SET converted = 1 WHERE id = ?').run(ug.id);
    db.prepare('UPDATE users SET worn_gift_id = NULL WHERE worn_gift_id = ?').run(ug.id);
    changeBalance(req.user.id, g.convert_value, 'gift_convert', `Конвертация «${g.name}»`, `ug:${ug.id}`);
  });
  pushBalance(req.user.id);
  res.json({ ok: true, amount: g.convert_value });
});

r.post('/user-gifts/:id/transfer', (req, res) => {
  const ug = loadOwned(req.params.id, req.user.id);
  if (!ug.upgraded_at) fail(400, 'Передавать можно только коллекционные подарки');
  assertNotListed(ug.id);
  const to = getUser(Number(req.body.toUserId));
  if (!to || to.is_bot || to.id === req.user.id) fail(400, 'Некорректный получатель');
  db.prepare('UPDATE user_gifts SET owner_id = ?, sender_id = ?, anonymous = 0, hidden = 0, pinned = 0 WHERE id = ?').run(to.id, req.user.id, ug.id);
  db.prepare('UPDATE users SET worn_gift_id = NULL WHERE worn_gift_id = ?').run(ug.id);
  const chat = getOrCreatePrivateChat(req.user.id, to.id);
  createMessage({ chatId: chat.id, senderId: req.user.id, type: 'gift', text: '', userGiftId: ug.id });
  res.json({ ok: true });
});

/** "Wear" a collectible: it is shown next to the owner's name. */
r.post('/user-gifts/:id/wear', (req, res) => {
  const ug = loadOwned(req.params.id, req.user.id);
  if (!ug.upgraded_at) fail(400, 'Надеть можно только коллекционный подарок');
  db.prepare('UPDATE users SET worn_gift_id = ? WHERE id = ?').run(req.body.wear === false ? null : ug.id, req.user.id);
  res.json({ userGift: serializeUserGift(ug.id, req.user.id) });
});

r.post('/user-gifts/:id/visibility', (req, res) => {
  const ug = loadOwned(req.params.id, req.user.id);
  db.prepare('UPDATE user_gifts SET hidden = ?, pinned = ? WHERE id = ?').run(
    req.body.hidden !== undefined ? (req.body.hidden ? 1 : 0) : ug.hidden,
    req.body.pinned !== undefined ? (req.body.pinned ? 1 : 0) : ug.pinned,
    ug.id,
  );
  res.json({ userGift: serializeUserGift(ug.id, req.user.id) });
});

/** Admins can remove a gift from their own profile (it disappears; history messages stay). */
r.delete('/user-gifts/:id', (req, res) => {
  if (!req.user.is_admin) fail(403, 'Только для администраторов');
  const ug = loadOwned(req.params.id, req.user.id);
  tx(() => {
    db.prepare("UPDATE listings SET status = 'cancelled', closed_at = ? WHERE kind = 'gift' AND user_gift_id = ? AND status = 'active'").run(now(), ug.id);
    db.prepare('UPDATE users SET worn_gift_id = NULL WHERE worn_gift_id = ?').run(ug.id);
    db.prepare('UPDATE user_gifts SET converted = 1, pinned = 0, hidden = 1 WHERE id = ?').run(ug.id);
  });
  res.json({ ok: true });
});

export { assertNotListed };
export default r;
