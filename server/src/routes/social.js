import { Router } from 'express';
import { db, tx, getSetting } from '../db.js';
import { fail } from '../auth.js';
import {
  lightUser, publicUser, meUser, getUser, now, sanitizeMedia, changeBalance, pushBalance, notify, createMessage, getOrCreatePrivateChat, serializeChat,
} from '../services.js';
import { isPremium, privacyOf, isBlocked, isContact, parseJson, DEFAULT_PRIVACY } from '../privacy.js';

/** Feed of posts, follows, contacts, blocks, Premium, privacy and device sessions. */
const r = Router();

// ---------------- posts ----------------
const TAG_RE = /#([\p{L}\p{N}_]{2,40})/gu;
const tagsOf = (text) => [...new Set([...String(text).matchAll(TAG_RE)].map((m) => m[1].toLowerCase()))].slice(0, 10);

/** Paid subscription to an author: active if `until` is in the future. */
export const isSubscribed = (subscriberId, authorId) => subscriberId === authorId || !!db.prepare('SELECT 1 FROM subscriptions WHERE subscriber_id = ? AND author_id = ? AND until > ?').get(subscriberId, authorId, now());

function serializePost(p, viewerId, depth = 0) {
  if (!p) return null;
  const author = getUser(p.user_id);
  const locked = !!p.paid && !p.deleted && !isSubscribed(viewerId, p.user_id) && !getUser(viewerId)?.is_admin;
  const repost = p.repost_of && depth === 0 ? serializePost(db.prepare('SELECT * FROM posts WHERE id = ?').get(p.repost_of), viewerId, 1) : null;
  return {
    id: p.id,
    author: lightUser(author),
    text: p.deleted ? '' : locked ? `${p.text.slice(0, 60)}${p.text.length > 60 ? '…' : ''}` : p.text,
    media: p.deleted || locked ? [] : parseJson(p.media, []),
    paid: !!p.paid,
    locked,
    lockedMedia: locked ? parseJson(p.media, []).length : 0,
    subPrice: locked ? author?.sub_price || 0 : undefined,
    deleted: !!p.deleted,
    repost,
    likes: db.prepare('SELECT COUNT(*) c FROM post_likes WHERE post_id = ?').get(p.id).c,
    liked: !!db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(p.id, viewerId),
    comments: db.prepare('SELECT COUNT(*) c FROM post_comments WHERE post_id = ?').get(p.id).c,
    reposts: db.prepare('SELECT COUNT(*) c FROM posts WHERE repost_of = ? AND deleted = 0').get(p.id).c,
    views: p.views,
    edited: !!p.edited_at,
    createdAt: p.created_at,
    mine: p.user_id === viewerId,
  };
}

const PAGE = 20;
const notBlocked = `p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE user_id = @me) AND p.user_id NOT IN (SELECT user_id FROM blocks WHERE blocked_id = @me)`;

/** Messages of public channels shown in the feed next to posts (click → open the channel). */
function channelItems(me, before, onlyMember) {
  const rows = db.prepare(`
    SELECT m.* FROM messages m JOIN chats c ON c.id = m.chat_id
    WHERE c.type = 'channel' AND m.deleted = 0 AND m.type IN ('text','image','video') AND m.created_at < @before
      AND ${onlyMember ? 'c.id IN (SELECT chat_id FROM chat_members WHERE user_id = @me)' : 'c.is_public = 1'}
    ORDER BY m.created_at DESC LIMIT ${PAGE}`).all({ me, before });
  return rows.map((m) => {
    const media = parseJson(m.media, null);
    return {
      kind: 'channel', id: `c${m.id}`, msgId: m.id, chat: serializeChat(m.chat_id, me), text: m.text || '',
      media: media && ['image', 'video'].includes(m.type) ? [{ url: media.url, kind: m.type }] : [], views: m.views, createdAt: m.created_at,
    };
  });
}

r.get('/feed', (req, res) => {
  const me = req.user.id;
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER; // created_at cursor
  const tab = String(req.query.tab || 'all');
  const tag = String(req.query.tag || '').replace(/^#/, '').toLowerCase();
  let rows;
  if (tab === 'following') {
    rows = db.prepare(`SELECT p.* FROM posts p WHERE p.deleted = 0 AND p.created_at < @before AND (p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = @me) OR p.user_id = @me) AND ${notBlocked} ORDER BY p.created_at DESC LIMIT ${PAGE}`).all({ me, before });
  } else if (tab === 'top') {
    // «Тренды»: hot posts of the last 3 days — engagement decayed by age
    const pool = db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) l, (SELECT COUNT(*) FROM post_comments WHERE post_id = p.id) c, (SELECT COUNT(*) FROM posts r WHERE r.repost_of = p.id AND r.deleted = 0) rp
      FROM posts p JOIN users u ON u.id = p.user_id AND u.is_banned = 0 WHERE p.deleted = 0 AND p.created_at > @since AND ${notBlocked} LIMIT 500`).all({ me, since: now() - 3 * 86400_000 });
    const score = (p) => (p.l * 3 + p.c * 4 + p.rp * 5 + p.views * 0.05 + 1) / Math.pow((now() - p.created_at) / 3600_000 + 2, 1.3);
    const page = Number(req.query.page) || 0;
    rows = pool.sort((a, b) => score(b) - score(a)).slice(page * PAGE, page * PAGE + PAGE);
    return res.json({ posts: rows.map((p) => ({ kind: 'post', ...serializePost(p, me) })), hasMore: pool.length > (page + 1) * PAGE, page: page + 1 });
  } else if (tab === 'tag' && tag) {
    rows = db.prepare(`SELECT p.* FROM posts p JOIN post_tags t ON t.post_id = p.id AND t.tag = @tag WHERE p.deleted = 0 AND p.created_at < @before AND ${notBlocked} ORDER BY p.created_at DESC LIMIT ${PAGE}`).all({ me, before, tag });
  } else {
    rows = db.prepare(`SELECT p.* FROM posts p JOIN users u ON u.id = p.user_id AND u.is_banned = 0 WHERE p.deleted = 0 AND p.created_at < @before AND ${notBlocked} ORDER BY p.created_at DESC LIMIT ${PAGE}`).all({ me, before });
  }
  let items = rows.map((p) => ({ kind: 'post', ...serializePost(p, me) }));
  let more = rows.length === PAGE;
  if (tab === 'all' || tab === 'following') {
    const ch = channelItems(me, before, tab === 'following');
    more = more || ch.length === PAGE;
    items = [...items, ...ch].sort((x, y) => y.createdAt - x.createdAt).slice(0, PAGE);
  }
  res.json({ posts: items, hasMore: more });
});

r.get('/tags/trending', (_req, res) => {
  const rows = db.prepare('SELECT tag, COUNT(*) c FROM post_tags WHERE created_at > ? GROUP BY tag ORDER BY c DESC LIMIT 30').all(now() - 14 * 86400_000);
  res.json({ tags: rows.map((x) => ({ tag: x.tag, count: x.c })) });
});

r.get('/users/:id/posts', (req, res) => {
  const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
  const uid = Number(req.params.id);
  if (isBlocked(uid, req.user.id)) return res.json({ posts: [], hasMore: false });
  const rows = db.prepare(`SELECT * FROM posts WHERE user_id = ? AND deleted = 0 AND created_at < ? ORDER BY created_at DESC LIMIT ${PAGE}`).all(uid, before);
  res.json({ posts: rows.map((p) => serializePost(p, req.user.id)), hasMore: rows.length === PAGE });
});

r.get('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!p) fail(404, 'Пост не найден');
  res.json({ post: serializePost(p, req.user.id) });
});

function assertPostLimits(u) {
  const prem = isPremium(u);
  const perDay = Number(getSetting(prem ? 'posts_per_day_premium' : 'posts_per_day')) || 5;
  const cooldown = (Number(getSetting(prem ? 'post_cooldown_premium' : 'post_cooldown')) || 30) * 1000;
  const today = db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id = ? AND created_at > ?').get(u.id, now() - 86400_000).c;
  if (today >= perDay && !u.is_admin) fail(429, `Лимит: ${perDay} постов в сутки${prem ? '' : ' (с Premium — больше)'}`);
  const last = db.prepare('SELECT created_at FROM posts WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(u.id)?.created_at || 0;
  const wait = Math.ceil((last + cooldown - now()) / 1000);
  if (wait > 0 && !u.is_admin) fail(429, `Подождите ${wait} с перед следующим постом`);
}

r.post('/posts', (req, res) => {
  assertPostLimits(req.user);
  const text = String(req.body.text || '').trim().slice(0, 2000);
  const media = (Array.isArray(req.body.media) ? req.body.media : []).slice(0, 4).map(sanitizeMedia).filter((m) => m && ['image', 'video'].includes(m.kind));
  const repostOf = req.body.repostOf ? Number(req.body.repostOf) : null;
  if (repostOf && !db.prepare('SELECT 1 FROM posts WHERE id = ? AND deleted = 0').get(repostOf)) fail(404, 'Пост не найден');
  if (!text && !media.length && !repostOf) fail(400, 'Пустой пост');
  const id = tx(() => {
    const paid = req.body.paid && req.user.sub_price > 0 && !repostOf ? 1 : 0;
    const ins = db.prepare('INSERT INTO posts (user_id, text, media, repost_of, created_at, paid) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, text, media.length ? JSON.stringify(media) : null, repostOf, now(), paid);
    const pid = Number(ins.lastInsertRowid);
    for (const t of tagsOf(text)) db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag, created_at) VALUES (?, ?, ?)').run(pid, t, now());
    return pid;
  });
  res.json({ post: serializePost(db.prepare('SELECT * FROM posts WHERE id = ?').get(id), req.user.id) });
});

r.patch('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0').get(Number(req.params.id));
  if (!p || p.user_id !== req.user.id) fail(404, 'Пост не найден');
  const text = String(req.body.text ?? p.text).trim().slice(0, 2000);
  if (!text && !p.media && !p.repost_of) fail(400, 'Пустой пост');
  tx(() => {
    db.prepare('UPDATE posts SET text = ?, edited_at = ? WHERE id = ?').run(text, now(), p.id);
    db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(p.id);
    for (const t of tagsOf(text)) db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag, created_at) VALUES (?, ?, ?)').run(p.id, t, now());
  });
  res.json({ post: serializePost(db.prepare('SELECT * FROM posts WHERE id = ?').get(p.id), req.user.id) });
});

// ---------------- end-to-end encryption keys ----------------
// Clients derive an X25519 key pair from the seed phrase; the server only stores public keys.
r.put('/me/e2e-key', (req, res) => {
  const k = String(req.body?.publicKey || '');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(k)) fail(400, 'Некорректный ключ');
  db.prepare('UPDATE users SET e2e_key = ? WHERE id = ?').run(k, req.user.id);
  res.json({ ok: true });
});
r.get('/users/:id/e2e-key', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u) fail(404, 'Не найден');
  res.json({ publicKey: u.e2e_key || null });
});

r.delete('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!p || (p.user_id !== req.user.id && !req.user.is_admin)) fail(404, 'Пост не найден');
  db.prepare('UPDATE posts SET deleted = 1 WHERE id = ?').run(p.id);
  db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(p.id);
  res.json({ ok: true });
});

r.post('/posts/:id/like', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0').get(Number(req.params.id));
  if (!p) fail(404, 'Пост не найден');
  const had = db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(p.id, req.user.id);
  if (had) db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(p.id, req.user.id);
  else db.prepare('INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)').run(p.id, req.user.id, now());
  res.json({ post: serializePost(p, req.user.id) });
});

r.post('/posts/views', (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).slice(0, 50).map(Number).filter(Boolean);
  for (const id of ids) {
    const ins = db.prepare('INSERT OR IGNORE INTO post_views (post_id, user_id) SELECT id, ? FROM posts WHERE id = ?').run(req.user.id, id);
    if (ins.changes) db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(id);
  }
  res.json({ ok: true });
});

const serializeComment = (c, viewerId) => {
  const parent = c.reply_to ? db.prepare('SELECT user_id FROM post_comments WHERE id = ?').get(c.reply_to) : null;
  return {
    id: c.id, text: c.text, author: lightUser(getUser(c.user_id)), createdAt: c.created_at, mine: c.user_id === viewerId,
    replyTo: c.reply_to || null, replyToName: parent ? getUser(parent.user_id)?.display_name : null,
    likes: db.prepare('SELECT COUNT(*) n FROM comment_likes WHERE comment_id = ?').get(c.id).n,
    liked: !!db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(c.id, viewerId),
  };
};

r.get('/posts/:id/comments', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (p?.paid && !isSubscribed(req.user.id, p.user_id) && !req.user.is_admin) return res.json({ comments: [], locked: true });
  const rows = db.prepare('SELECT * FROM post_comments WHERE post_id = ? ORDER BY id LIMIT 500').all(Number(req.params.id));
  res.json({ comments: rows.map((c) => serializeComment(c, req.user.id)) });
});

r.post('/comments/:id/like', (req, res) => {
  const c = db.prepare('SELECT * FROM post_comments WHERE id = ?').get(Number(req.params.id));
  if (!c) fail(404, 'Комментарий не найден');
  if (db.prepare('SELECT 1 FROM comment_likes WHERE comment_id = ? AND user_id = ?').get(c.id, req.user.id)) db.prepare('DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?').run(c.id, req.user.id);
  else db.prepare('INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)').run(c.id, req.user.id);
  res.json({ comment: serializeComment(c, req.user.id) });
});

r.post('/posts/:id/comments', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0').get(Number(req.params.id));
  if (!p) fail(404, 'Пост не найден');
  if (isBlocked(p.user_id, req.user.id)) fail(403, 'Автор ограничил комментарии для вас');
  const text = String(req.body.text || '').trim().slice(0, 1000);
  if (!text) fail(400, 'Пустой комментарий');
  const last = db.prepare('SELECT created_at FROM post_comments WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id)?.created_at || 0;
  if (now() - last < 3000) fail(429, 'Слишком часто');
  if (p.paid && !isSubscribed(req.user.id, p.user_id) && !req.user.is_admin) fail(403, 'Комментировать могут только подписчики автора');
  let replyTo = req.body.replyTo ? Number(req.body.replyTo) : null;
  const parent = replyTo ? db.prepare('SELECT * FROM post_comments WHERE id = ? AND post_id = ?').get(replyTo, p.id) : null;
  if (!parent) replyTo = null;
  const id = Number(db.prepare('INSERT INTO post_comments (post_id, user_id, text, created_at, reply_to) VALUES (?, ?, ?, ?, ?)').run(p.id, req.user.id, text, now(), replyTo).lastInsertRowid);
  if (parent && parent.user_id !== req.user.id) notify(parent.user_id, `💬 ${req.user.display_name} ответил(а) на ваш комментарий: «${text.slice(0, 120)}»`);
  res.json({ comment: serializeComment(db.prepare('SELECT * FROM post_comments WHERE id = ?').get(id), req.user.id) });
});

r.delete('/comments/:id', (req, res) => {
  const c = db.prepare('SELECT c.*, p.user_id author FROM post_comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?').get(Number(req.params.id));
  if (!c || (c.user_id !== req.user.id && c.author !== req.user.id && !req.user.is_admin)) fail(404, 'Не найдено');
  db.prepare('DELETE FROM post_comments WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// ---------------- paid subscriptions to authors ----------------
r.post('/me/subscription-price', (req, res) => {
  const price = Math.max(0, Math.min(1_000_000, Math.floor(Number(req.body.price) || 0)));
  db.prepare('UPDATE users SET sub_price = ? WHERE id = ?').run(price, req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
});

r.post('/users/:id/subscribe', (req, res) => {
  const a = getUser(Number(req.params.id));
  if (!a || a.is_bot || a.id === req.user.id) fail(400, 'Нельзя подписаться');
  if (!a.sub_price) fail(400, 'Автор не принимает платные подписки');
  if (isBlocked(a.id, req.user.id)) fail(403, 'Автор ограничил вам доступ');
  const fee = Math.floor((a.sub_price * (Number(getSetting('cfg_sub_fee_percent')) || 10)) / 100);
  const out = tx(() => {
    const cur = db.prepare('SELECT until FROM subscriptions WHERE subscriber_id = ? AND author_id = ?').get(req.user.id, a.id)?.until || 0;
    const until = Math.max(cur, now()) + 30 * 86400_000;
    changeBalance(req.user.id, -a.sub_price, 'subscription', `Подписка на ${a.display_name} (30 дней)`, `sub:${a.id}`);
    changeBalance(a.id, a.sub_price - fee, 'subscription_in', `Подписка от ${req.user.display_name} (комиссия ${fee})`, `sub:${req.user.id}`);
    db.prepare('INSERT INTO subscriptions (subscriber_id, author_id, until, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(subscriber_id, author_id) DO UPDATE SET until = excluded.until').run(req.user.id, a.id, until, now());
    db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(req.user.id, a.id, now());
    return until;
  });
  pushBalance(req.user.id, a.id);
  notify(a.id, `⭐ ${req.user.display_name} оформил(а) платную подписку на вас: +${a.sub_price - fee} ${getSetting('currency_symbol') || '✦'}`);
  res.json({ until: out });
});

/** Share a post into a chat. */
r.post('/posts/:id/share', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id = ? AND deleted = 0').get(Number(req.params.id));
  if (!p) fail(404, 'Пост не найден');
  const chatId = Number(req.body.chatId);
  if (!db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, req.user.id)) fail(403, 'Нет доступа к чату');
  const author = getUser(p.user_id);
  createMessage({ chatId, senderId: req.user.id, type: 'post', text: String(req.body.text || '').slice(0, 500), media: { postId: p.id, author: author?.display_name, text: p.text.slice(0, 300), image: parseJson(p.media, []).find((m) => m.kind === 'image')?.url || null } });
  res.json({ ok: true });
});

// ---------------- follows / contacts / blocks ----------------
r.post('/users/:id/follow', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u || u.id === req.user.id || u.is_bot) fail(400, 'Нельзя подписаться');
  const had = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(req.user.id, u.id);
  if (had) db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(req.user.id, u.id);
  else db.prepare('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(req.user.id, u.id, now());
  res.json({ following: !had, followers: db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id = ?').get(u.id).c });
});

r.get('/users/:id/followers', (req, res) => {
  const rows = db.prepare('SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? ORDER BY f.created_at DESC LIMIT 200').all(Number(req.params.id));
  res.json({ users: rows.map(publicUser) });
});
r.get('/users/:id/following', (req, res) => {
  const rows = db.prepare('SELECT u.* FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 200').all(Number(req.params.id));
  res.json({ users: rows.map(publicUser) });
});

r.get('/contacts', (req, res) => {
  const rows = db.prepare('SELECT u.* FROM contacts c JOIN users u ON u.id = c.contact_id WHERE c.user_id = ? ORDER BY u.display_name').all(req.user.id);
  res.json({ users: rows.map(publicUser) });
});
r.post('/contacts/:id', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u || u.id === req.user.id) fail(400, 'Некорректный пользователь');
  const had = isContact(req.user.id, u.id);
  if (had) db.prepare('DELETE FROM contacts WHERE user_id = ? AND contact_id = ?').run(req.user.id, u.id);
  else db.prepare('INSERT INTO contacts (user_id, contact_id, created_at) VALUES (?, ?, ?)').run(req.user.id, u.id, now());
  res.json({ contact: !had });
});

r.get('/me/blocked', (req, res) => {
  const rows = db.prepare('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC').all(req.user.id);
  res.json({ users: rows.map(publicUser) });
});
r.post('/users/:id/block', (req, res) => {
  const u = getUser(Number(req.params.id));
  if (!u || u.id === req.user.id || u.is_bot) fail(400, 'Нельзя заблокировать');
  const had = isBlocked(req.user.id, u.id);
  if (had) db.prepare('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?').run(req.user.id, u.id);
  else {
    db.prepare('INSERT INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)').run(req.user.id, u.id, now());
    db.prepare('DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)').run(req.user.id, u.id, u.id, req.user.id);
  }
  res.json({ blocked: !had });
});

// ---------------- profile views (Premium) ----------------
r.get('/me/profile-views', (req, res) => {
  if (!isPremium(req.user)) fail(403, 'Доступно с Premium');
  const rows = db.prepare('SELECT u.*, v.viewed_at FROM profile_views v JOIN users u ON u.id = v.viewer_id WHERE v.user_id = ? ORDER BY v.viewed_at DESC LIMIT 100').all(req.user.id);
  res.json({ views: rows.map((x) => ({ user: publicUser(x), viewedAt: x.viewed_at })) });
});

// ---------------- privacy & profile fields ----------------
r.post('/me/privacy', (req, res) => {
  const b = req.body || {};
  const p = privacyOf(req.user);
  if (['everyone', 'contacts', 'nobody'].includes(b.lastSeen)) p.lastSeen = b.lastSeen;
  if (['everyone', 'contacts', 'premium', 'paid'].includes(b.messages)) p.messages = b.messages;
  if (b.messagePrice !== undefined) p.messagePrice = Math.max(1, Math.min(10000, Math.floor(Number(b.messagePrice) || 1)));
  if (b.profileViews !== undefined) p.profileViews = !!b.profileViews;
  db.prepare('UPDATE users SET privacy = ? WHERE id = ?').run(JSON.stringify({ ...DEFAULT_PRIVACY, ...p }), req.user.id);
  res.json({ user: meUser(getUser(req.user.id)) });
});

r.post('/me/profile-extra', (req, res) => {
  const b = req.body || {};
  const u = req.user;
  db.prepare('UPDATE users SET location = ?, show_balance = ? WHERE id = ?').run(
    b.location !== undefined ? String(b.location || '').trim().slice(0, 48) || null : u.location,
    b.showBalance !== undefined ? (b.showBalance ? 1 : 0) : u.show_balance,
    u.id,
  );
  res.json({ user: meUser(getUser(u.id)) });
});

// ---------------- Premium ----------------
const NAME_COLOR = /^#[0-9a-f]{6}$/i;
const PROFILE_BGS = ['aurora', 'gold', 'sunset', 'ocean', 'blood', 'toxic', 'violet', 'mono'];

r.get('/premium', (req, res) => {
  res.json({ price: Number(getSetting('premium_price') || 300), until: req.user.premium_until || null, active: isPremium(req.user), backgrounds: PROFILE_BGS });
});

r.post('/premium/buy', (req, res) => {
  const months = Math.max(1, Math.min(12, Math.floor(Number(req.body.months) || 1)));
  const to = req.body.toUserId ? getUser(Number(req.body.toUserId)) : req.user;
  if (!to || to.is_bot) fail(400, 'Некорректный получатель');
  const price = Number(getSetting('premium_price') || 300) * months;
  tx(() => {
    changeBalance(req.user.id, -price, 'premium', to.id === req.user.id ? `Premium на ${months} мес.` : `Premium в подарок ${to.display_name} на ${months} мес.`);
    const fresh = getUser(to.id);
    const from = Math.max(now(), Number(fresh.premium_until || 0));
    db.prepare('UPDATE users SET premium_until = ? WHERE id = ?').run(from + months * 30 * 86400_000, to.id);
  });
  pushBalance(req.user.id);
  if (to.id !== req.user.id) {
    const chat = getOrCreatePrivateChat(req.user.id, to.id);
    createMessage({ chatId: chat.id, senderId: req.user.id, type: 'text', text: `⭐ Дарю тебе Recidivist Premium на ${months} мес.!` });
    notify(to.id, `⭐ ${req.user.display_name} подарил(а) вам Premium на ${months} мес.`);
  }
  res.json({ user: meUser(getUser(req.user.id)) });
});

r.post('/me/premium-style', (req, res) => {
  if (!isPremium(req.user)) fail(403, 'Доступно с Premium');
  const b = req.body || {};
  let style = null;
  if (b.nameStyle) {
    const s = b.nameStyle;
    style = {
      color: NAME_COLOR.test(s.color || '') ? s.color : null,
      color2: NAME_COLOR.test(s.color2 || '') ? s.color2 : null,
      animated: !!s.animated,
      glow: !!s.glow,
      bold: !!s.bold,
    };
  }
  const bg = PROFILE_BGS.includes(b.profileBg) ? b.profileBg : null;
  db.prepare('UPDATE users SET name_style = ?, profile_bg = ? WHERE id = ?').run(
    b.nameStyle !== undefined ? (style ? JSON.stringify(style) : null) : req.user.name_style,
    b.profileBg !== undefined ? bg : req.user.profile_bg,
    req.user.id,
  );
  res.json({ user: meUser(getUser(req.user.id)) });
});

// ---------------- sessions («Устройства») ----------------
r.get('/sessions', (req, res) => {
  const rows = db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_active DESC').all(req.user.id);
  res.json({ sessions: rows.map((s) => ({ id: s.id, device: s.device, ip: s.ip, createdAt: s.created_at, lastActive: s.last_active, current: s.id === req.sid })), currentLegacy: !req.sid });
});
r.delete('/sessions/:id', (req, res) => {
  if (req.params.id === req.sid) fail(400, 'Это текущее устройство — используйте «Выйти»');
  db.prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(String(req.params.id), req.user.id);
  res.json({ ok: true });
});
/** Terminate every other session (old tokens without a session are revoked too). */
r.post('/sessions/terminate-others', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(req.user.id, req.sid || '');
  db.prepare('UPDATE users SET sessions_after = ? WHERE id = ?').run(now(), req.user.id);
  res.json({ ok: true });
});
r.post('/sessions/logout', (req, res) => {
  if (req.sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sid);
  res.json({ ok: true });
});

export { serializePost };
export default r;
