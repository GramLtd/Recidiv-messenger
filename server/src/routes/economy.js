import { Router } from 'express';
import { db, tx, getSetting } from '../db.js';
import { fail } from '../auth.js';
import { serializeUserGift, lightUser, getUser, changeBalance, pushBalance, notify, now, weightedPick, emitToUser } from '../services.js';

/*
 * Economy: auctions (escrowed bids, anti-sniping), crafting (5 regular gifts of one kind → a free collectible),
 * market price stats, daily rewards with streaks. Seasonal sale windows live on the gifts table.
 */
const r = Router();
const sym = () => getSetting('currency_symbol') || '✦';

/* ---------------- shared item helpers ---------------- */
export function itemLocked(kind, ref) {
  if (kind === 'gift') {
    return !!db.prepare("SELECT 1 FROM listings WHERE kind = 'gift' AND user_gift_id = ? AND status = 'active'").get(ref)
      || !!db.prepare("SELECT 1 FROM auctions WHERE kind = 'gift' AND user_gift_id = ? AND status = 'active'").get(ref);
  }
  const n = String(ref).toLowerCase();
  return !!db.prepare("SELECT 1 FROM listings WHERE kind = 'username' AND LOWER(username) = ? AND status = 'active'").get(n)
    || !!db.prepare("SELECT 1 FROM auctions WHERE kind = 'username' AND LOWER(username) = ? AND status = 'active'").get(n);
}

function ownsItem(a, userId) {
  if (a.kind === 'gift') { const ug = db.prepare('SELECT owner_id, converted FROM user_gifts WHERE id = ?').get(a.user_gift_id); return ug && !ug.converted && ug.owner_id === userId; }
  return db.prepare('SELECT user_id FROM usernames WHERE name = ?').get(a.username.toLowerCase())?.user_id === userId;
}

function moveItem(a, fromId, toId) {
  if (a.kind === 'gift') {
    db.prepare('UPDATE user_gifts SET owner_id = ?, sender_id = ?, anonymous = 0, hidden = 0, pinned = 0 WHERE id = ?').run(toId, fromId, a.user_gift_id);
    db.prepare('UPDATE users SET worn_gift_id = NULL WHERE worn_gift_id = ?').run(a.user_gift_id);
  } else {
    const row = db.prepare('SELECT * FROM usernames WHERE name = ?').get(a.username.toLowerCase());
    db.prepare('UPDATE usernames SET user_id = ? WHERE name = ?').run(toId, row.name);
    const seller = getUser(fromId);
    if (seller.username?.toLowerCase() === row.name) {
      const other = db.prepare('SELECT display FROM usernames WHERE user_id = ? ORDER BY created_at LIMIT 1').get(seller.id);
      db.prepare('UPDATE users SET username = ? WHERE id = ?').run(other?.display || null, seller.id);
    }
    if (!getUser(toId).username) db.prepare('UPDATE users SET username = ? WHERE id = ?').run(row.display, toId);
  }
}

const itemLabel = (a) => {
  if (a.kind !== 'gift') return `@${a.username}`;
  const ug = db.prepare('SELECT ug.number, g.name FROM user_gifts ug JOIN gifts g ON g.id = ug.gift_id WHERE ug.id = ?').get(a.user_gift_id);
  return `«${ug?.name}» #${ug?.number}`;
};

/* ---------------- auctions ---------------- */
const minNext = (a) => (a.bid ? a.bid + Math.max(a.min_step, Math.ceil(a.bid * 0.05)) : a.start_price);

function serializeAuction(a, viewerId, withBids = false) {
  const out = {
    id: a.id, kind: a.kind, status: a.status, startPrice: a.start_price, bid: a.bid || 0, minNext: minNext(a), bids: a.bids,
    endsAt: a.ends_at, createdAt: a.created_at, closedAt: a.closed_at,
    seller: lightUser(getUser(a.seller_id)), leader: a.bidder_id ? lightUser(getUser(a.bidder_id)) : null,
    userGift: a.user_gift_id ? serializeUserGift(a.user_gift_id, viewerId) : null, username: a.username,
    mine: a.seller_id === viewerId, leading: a.bidder_id === viewerId,
  };
  if (withBids) out.history = db.prepare('SELECT * FROM auction_bids WHERE auction_id = ? ORDER BY id DESC LIMIT 20').all(a.id).map((b) => ({ amount: b.amount, at: b.created_at, user: lightUser(getUser(b.user_id)) }));
  return out;
}

r.get('/auctions', (req, res) => {
  const mine = req.query.mine === '1';
  const rows = mine
    ? db.prepare("SELECT * FROM auctions WHERE seller_id = ? OR id IN (SELECT auction_id FROM auction_bids WHERE user_id = ?) ORDER BY (status = 'active') DESC, ends_at DESC LIMIT 100").all(req.user.id, req.user.id)
    : db.prepare("SELECT * FROM auctions WHERE status = 'active' ORDER BY ends_at ASC LIMIT 100").all();
  res.json({ auctions: rows.map((a) => serializeAuction(a, req.user.id)), feePercent: Number(getSetting('market_fee_percent')) });
});

r.get('/auctions/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM auctions WHERE id = ?').get(Number(req.params.id));
  if (!a) fail(404, 'Аукцион не найден');
  res.json({ auction: serializeAuction(a, req.user.id, true) });
});

r.post('/auctions', (req, res) => {
  const start = Math.floor(Number(req.body.startPrice));
  const min = Number(getSetting('min_listing_price')) || 1;
  if (!Number.isFinite(start) || start < min) fail(400, `Стартовая цена — от ${min}`);
  if (start > 100_000_000) fail(400, 'Слишком высокая цена');
  const hours = [1, 6, 12, 24, 72].includes(Number(req.body.hours)) ? Number(req.body.hours) : 24;
  const step = Math.max(1, Math.min(Math.floor(Number(req.body.minStep) || Math.ceil(start * 0.05)), 10_000_000));
  let ins;
  if (req.body.kind === 'gift') {
    const ug = db.prepare('SELECT * FROM user_gifts WHERE id = ?').get(Number(req.body.userGiftId));
    if (!ug || ug.owner_id !== req.user.id || ug.converted) fail(404, 'Подарок не найден');
    if (!ug.upgraded_at) fail(400, 'На аукцион можно выставить только коллекционный подарок');
    if (itemLocked('gift', ug.id)) fail(400, 'Подарок уже выставлен на продажу или аукцион');
    ins = db.prepare('INSERT INTO auctions (seller_id, kind, user_gift_id, start_price, min_step, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.user.id, 'gift', ug.id, start, step, now() + hours * 3600_000, now());
  } else if (req.body.kind === 'username') {
    const name = String(req.body.username || '').toLowerCase();
    const row = db.prepare('SELECT * FROM usernames WHERE name = ? AND user_id = ?').get(name, req.user.id);
    if (!row) fail(404, 'Вы не владеете этим юзернеймом');
    if (itemLocked('username', name)) fail(400, 'Юзернейм уже выставлен на продажу или аукцион');
    ins = db.prepare('INSERT INTO auctions (seller_id, kind, username, start_price, min_step, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.user.id, 'username', row.display, start, step, now() + hours * 3600_000, now());
  } else fail(400, 'Неизвестный тип лота');
  res.json({ auction: serializeAuction(db.prepare('SELECT * FROM auctions WHERE id = ?').get(ins.lastInsertRowid), req.user.id) });
});

r.post('/auctions/:id/bid', (req, res) => {
  const amount = Math.floor(Number(req.body.amount));
  const out = tx(() => {
    const a = db.prepare("SELECT * FROM auctions WHERE id = ? AND status = 'active'").get(Number(req.params.id));
    if (!a || a.ends_at <= now()) fail(404, 'Аукцион завершён');
    if (a.seller_id === req.user.id) fail(400, 'Нельзя делать ставки на свой лот');
    if (a.bidder_id === req.user.id) fail(400, 'Ваша ставка уже лидирует');
    if (!Number.isFinite(amount) || amount < minNext(a)) fail(400, `Минимальная ставка — ${minNext(a)} ${sym()}`);
    const label = itemLabel(a);
    changeBalance(req.user.id, -amount, 'auction_bid', `Ставка на ${label}`, `auction:${a.id}`); // escrow
    if (a.bidder_id) changeBalance(a.bidder_id, a.bid, 'auction_refund', `Ставку на ${label} перебили — возврат`, `auction:${a.id}`);
    const endsAt = a.ends_at - now() < 120_000 ? now() + 120_000 : a.ends_at; // anti-sniping
    db.prepare('UPDATE auctions SET bid = ?, bidder_id = ?, bids = bids + 1, ends_at = ? WHERE id = ?').run(amount, req.user.id, endsAt, a.id);
    db.prepare('INSERT INTO auction_bids (auction_id, user_id, amount, created_at) VALUES (?, ?, ?, ?)').run(a.id, req.user.id, amount, now());
    return { a, label, prev: a.bidder_id };
  });
  pushBalance(req.user.id, ...(out.prev ? [out.prev] : []));
  if (out.prev) notify(out.prev, `⚡ Вашу ставку на ${out.label} перебили: ${amount} ${sym()}. Деньги вернулись на баланс.`);
  const fresh = db.prepare('SELECT * FROM auctions WHERE id = ?').get(out.a.id);
  for (const uid of new Set([out.a.seller_id, out.prev].filter(Boolean))) emitToUser(uid, 'auction:update', { id: out.a.id });
  res.json({ auction: serializeAuction(fresh, req.user.id, true) });
});

r.delete('/auctions/:id', (req, res) => {
  const a = db.prepare("SELECT * FROM auctions WHERE id = ? AND status = 'active'").get(Number(req.params.id));
  if (!a || (a.seller_id !== req.user.id && !req.user.is_admin)) fail(404, 'Аукцион не найден');
  if (a.bidder_id) fail(400, 'Нельзя отменить аукцион, на который уже есть ставки');
  db.prepare("UPDATE auctions SET status = 'cancelled', closed_at = ? WHERE id = ?").run(now(), a.id);
  res.json({ ok: true });
});

/** Settle finished auctions (called every 15 s). */
export function settleAuctions() {
  const due = db.prepare("SELECT * FROM auctions WHERE status = 'active' AND ends_at <= ? LIMIT 50").all(now());
  for (const a of due) {
    try {
      const res = tx(() => {
        const label = itemLabel(a);
        if (!a.bidder_id) { db.prepare("UPDATE auctions SET status = 'expired', closed_at = ? WHERE id = ?").run(now(), a.id); return { label, kind: 'expired' }; }
        if (!ownsItem(a, a.seller_id)) {
          changeBalance(a.bidder_id, a.bid, 'auction_refund', `Аукцион ${label} отменён — возврат`, `auction:${a.id}`);
          db.prepare("UPDATE auctions SET status = 'cancelled', closed_at = ? WHERE id = ?").run(now(), a.id);
          return { label, kind: 'void' };
        }
        const fee = Math.floor((a.bid * Number(getSetting('market_fee_percent'))) / 100);
        moveItem(a, a.seller_id, a.bidder_id);
        changeBalance(a.seller_id, a.bid - fee, 'auction_sell', `Продажа ${label} на аукционе (комиссия ${fee})`, `auction:${a.id}`);
        db.prepare("UPDATE auctions SET status = 'sold', closed_at = ? WHERE id = ?").run(now(), a.id);
        db.prepare("INSERT INTO price_points (gift_id, price, source, created_at) SELECT gift_id, ?, 'auction', ? FROM user_gifts WHERE id = ?").run(a.bid, now(), a.user_gift_id || -1);
        return { label, kind: 'sold', fee };
      });
      if (res.kind === 'sold') {
        pushBalance(a.seller_id, a.bidder_id);
        notify(a.seller_id, `🔨 Аукцион завершён: ${res.label} продан за ${a.bid} ${sym()} (комиссия ${res.fee}).`);
        notify(a.bidder_id, `🏆 Вы выиграли аукцион: ${res.label} за ${a.bid} ${sym()}!`);
      } else if (res.kind === 'expired') notify(a.seller_id, `⌛ Аукцион ${res.label} завершился без ставок — лот остался у вас.`);
      else { pushBalance(a.bidder_id); notify(a.bidder_id, `Аукцион ${res.label} отменён: продавец больше не владеет лотом. Ставка возвращена.`); }
    } catch (e) { console.error('auction settle', a.id, e.message); }
  }
}

/* ---------------- market price stats ---------------- */
r.get('/market/stats/:giftId', (req, res) => {
  const giftId = Number(req.params.giftId);
  const since = now() - 30 * 86400_000;
  const pts = db.prepare('SELECT price, created_at FROM price_points WHERE gift_id = ? AND created_at >= ? ORDER BY created_at').all(giftId, since);
  const days = new Map();
  for (const p of pts) {
    const d = new Date(p.created_at); d.setHours(0, 0, 0, 0);
    const k = d.getTime();
    const v = days.get(k) || { t: k, min: Infinity, max: 0, sum: 0, n: 0 };
    v.min = Math.min(v.min, p.price); v.max = Math.max(v.max, p.price); v.sum += p.price; v.n += 1;
    days.set(k, v);
  }
  const series = [...days.values()].map((v) => ({ t: v.t, avg: Math.round(v.sum / v.n), min: v.min, max: v.max, volume: v.n }));
  const floor = db.prepare("SELECT MIN(l.price) p FROM listings l JOIN user_gifts ug ON ug.id = l.user_gift_id WHERE l.status = 'active' AND ug.gift_id = ?").get(giftId).p || null;
  const last = pts.length ? pts[pts.length - 1].price : null;
  const first = pts.length ? pts[0].price : null;
  res.json({ series, floor, last, change: first && last ? Math.round(((last - first) / first) * 1000) / 10 : null, sales: pts.length });
});

/* ---------------- crafting ---------------- */
const CRAFT_N = 5;
r.post('/craft', (req, res) => {
  const ids = [...new Set((req.body.userGiftIds || []).map(Number))];
  if (ids.length !== CRAFT_N) fail(400, `Для крафта нужно ровно ${CRAFT_N} подарков`);
  const ugs = ids.map((id) => db.prepare('SELECT * FROM user_gifts WHERE id = ?').get(id));
  if (ugs.some((u) => !u || u.owner_id !== req.user.id || u.converted)) fail(404, 'Подарок не найден');
  if (ugs.some((u) => u.upgraded_at)) fail(400, 'Для крафта нужны обычные (не коллекционные) подарки');
  if (new Set(ugs.map((u) => u.gift_id)).size !== 1) fail(400, 'Все подарки должны быть одного вида');
  if (ugs.some((u) => itemLocked('gift', u.id))) fail(400, 'Один из подарков выставлен на продажу');
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(ugs[0].gift_id);
  if (g.upgrade_price == null) fail(400, 'Этот подарок нельзя улучшить, а значит и скрафтить');
  const keep = ugs[0];
  tx(() => {
    for (const u of ugs.slice(1)) {
      db.prepare('UPDATE user_gifts SET converted = 1, pinned = 0, hidden = 1 WHERE id = ?').run(u.id);
      db.prepare('UPDATE users SET worn_gift_id = NULL WHERE worn_gift_id = ?').run(u.id);
    }
    const number = (db.prepare('SELECT MAX(number) n FROM user_gifts WHERE gift_id = ?').get(g.id).n || 0) + 1;
    const model = weightedPick(db.prepare('SELECT * FROM gift_models WHERE gift_id = ?').all(g.id));
    const backdrop = weightedPick(db.prepare('SELECT * FROM backdrops').all());
    const symbol = weightedPick(db.prepare('SELECT * FROM symbols').all());
    if (!model) fail(500, 'У подарка нет моделей');
    db.prepare('UPDATE user_gifts SET number = ?, model_id = ?, backdrop_id = ?, symbol_id = ?, upgraded_at = ? WHERE id = ?').run(number, model.id, backdrop.id, symbol.id, now(), keep.id);
  });
  res.json({ userGift: serializeUserGift(keep.id, req.user.id), crafted: CRAFT_N });
});

/* ---------------- daily rewards ---------------- */
const DEFAULT_REWARDS = [10, 15, 20, 30, 40, 60, 100];
const rewards = () => { try { const v = JSON.parse(getSetting('cfg_daily_rewards') || 'null'); return Array.isArray(v) && v.length ? v.map(Number) : DEFAULT_REWARDS; } catch { return DEFAULT_REWARDS; } };
const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
function dailyState(u) {
  const today = dayKey(); const yesterday = dayKey(Date.now() - 86400_000);
  const list = rewards();
  const streak = u.daily_last === today || u.daily_last === yesterday ? u.daily_streak || 0 : 0;
  const can = u.daily_last !== today;
  const nextIdx = can ? streak % list.length : (streak) % list.length;
  return { canClaim: can, streak, nextReward: list[can ? nextIdx : nextIdx], rewards: list, claimedToday: !can };
}
r.get('/daily', (req, res) => res.json(dailyState(req.user)));
r.post('/daily/claim', (req, res) => {
  if (getSetting('cfg_daily_enabled') === 'false') fail(400, 'Ежедневные награды отключены');
  const out = tx(() => {
    const u = getUser(req.user.id);
    const st = dailyState(u);
    if (!st.canClaim) fail(400, 'Награда за сегодня уже получена — возвращайтесь завтра');
    const streak = st.streak + 1;
    const amount = st.rewards[(streak - 1) % st.rewards.length];
    db.prepare('UPDATE users SET daily_streak = ?, daily_last = ? WHERE id = ?').run(streak, dayKey(), u.id);
    changeBalance(u.id, amount, 'daily_reward', `Ежедневная награда · день ${streak}`, `daily:${dayKey()}`);
    return { amount, streak };
  });
  pushBalance(req.user.id);
  res.json({ ...out, ...dailyState(getUser(req.user.id)) });
});

export default r;
