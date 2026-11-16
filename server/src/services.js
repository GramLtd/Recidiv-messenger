import { db, SYSTEM_USER_ID, NUMBERS_BOT_ID, getSetting } from './db.js';
import { emitToUser, emitToChat, isOnline, chatMemberIds } from './realtime.js';
import { fail, currentViewer } from './auth.js';
import { privacyOf, isPremium, canSeeLastSeen, parseJson as pj } from './privacy.js';

export const now = () => Date.now();
const parse = (s, d = null) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};

// ---------------- users ----------------
export function getUser(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/** Collectible gift a user is "wearing" next to their name. */
export function wornGift(u) {
  if (!u?.worn_gift_id) return null;
  const r = db
    .prepare(
      `SELECT ug.id, ug.number, g.name, g.emoji, COALESCE(gm.image, g.image) image, gm.filter, b.center, b.edge FROM user_gifts ug
       JOIN gifts g ON g.id = ug.gift_id LEFT JOIN gift_models gm ON gm.id = ug.model_id LEFT JOIN backdrops b ON b.id = ug.backdrop_id
       WHERE ug.id = ? AND ug.owner_id = ? AND ug.upgraded_at IS NOT NULL`,
    )
    .get(u.worn_gift_id, u.id);
  return r ? { id: r.id, number: r.number, name: r.name, emoji: r.emoji, image: r.image, filter: r.filter, center: r.center, edge: r.edge } : null;
}

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    displayName: u.display_name,
    username: u.username,
    avatar: u.avatar,
    bio: u.bio,
    verified: !!u.verified,
    isBot: !!u.is_bot,
    interactive: u.id === NUMBERS_BOT_ID,
    isAdmin: !!u.is_admin,
    anonNumber: u.anon_number ? `+${u.anon_number.slice(0, 3)} ${u.anon_number.slice(3, 7)} ${u.anon_number.slice(7)}` : null,
    emojiStatus: u.emoji_status,
    wornGift: wornGift(u),
    ...presenceFor(u),
    premium: isPremium(u),
    nameStyle: isPremium(u) ? pj(u.name_style, null) : null,
    profileBg: isPremium(u) ? u.profile_bg || null : null,
    location: u.location || null,
    blurBg: pj(u.blur_bg, { mode: 'avatar' }),
    publicBalance: u.show_balance ? u.balance : null,
    banner: u.banner ? { url: u.banner, type: u.banner_type === 'video' ? 'video' : 'image' } : null,
    links: parseJson(u.links, {}),
  };
}

const presenceSelf = (u) => ({ online: isOnline(u.id), lastSeen: u.last_seen });
/** Online / last seen as the current viewer is allowed to see it. */
export function presenceFor(u) {
  const viewer = currentViewer();
  if (viewer && !canSeeLastSeen(u, viewer)) return { online: false, lastSeen: null, lastSeenHidden: true };
  return { online: isOnline(u.id), lastSeen: u.last_seen };
}

function parseJson(v, d) {
  try { return v ? JSON.parse(v) : d; } catch { return d; }
}

// ---------- profile links ----------
const LINK_RULES = {
  tiktok: { hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'], make: (n) => `https://www.tiktok.com/@${n}` },
  spotify: { hosts: ['open.spotify.com', 'spotify.link'], make: (n) => `https://open.spotify.com/user/${n}` },
  soundcloud: { hosts: ['soundcloud.com', 'www.soundcloud.com', 'on.soundcloud.com'], make: (n) => `https://soundcloud.com/${n}` },
  telegram: { hosts: ['t.me', 'telegram.me'], make: (n) => `https://t.me/${n}` },
  discord: { hosts: ['discord.gg', 'discord.com', 'www.discord.com'], make: null },
};
export const LINK_KINDS = Object.keys(LINK_RULES);
/** Normalise a profile link: a full URL on the service's domain, or a bare @username. */
export function normalizeLink(kind, raw) {
  const rule = LINK_RULES[kind];
  const v = String(raw || '').trim();
  if (!rule || !v) return null;
  if (/^https?:\/\//i.test(v)) {
    let u;
    try { u = new URL(v); } catch { fail(400, `Некорректная ссылка (${kind})`); }
    if (u.protocol !== 'https:' || !rule.hosts.includes(u.hostname.toLowerCase())) fail(400, `Ссылка должна вести на ${rule.hosts[0]}`);
    return u.href.slice(0, 200);
  }
  const name = v.replace(/^@/, '');
  if (!/^[a-zA-Z0-9._-]{2,40}$/.test(name)) fail(400, `Некорректное имя пользователя (${kind})`);
  return rule.make ? rule.make(name) : name; // discord usernames are not linkable
}

export function lightUser(u) {
  if (!u) return null;
  return { id: u.id, displayName: u.display_name, username: u.username, avatar: u.avatar, verified: !!u.verified, isBot: !!u.is_bot, wornGift: wornGift(u), premium: isPremium(u), nameStyle: isPremium(u) ? pj(u.name_style, null) : null };
}

export function meUser(u) {
  return { ...publicUser(u), email: u.email, balance: u.balance, isBanned: !!u.is_banned, createdAt: u.created_at, profileTrackId: u.profile_track_id, personalChannelId: u.personal_channel_id, isTester: !!u.is_tester, wallpaper: parseJson(u.wallpaper, null), premiumUntil: u.premium_until || null, privacy: privacyOf(u), showBalance: !!u.show_balance, ...presenceSelf(u) };
}

// ---------------- ledger ----------------
/** Must be called inside a db transaction. Throws on insufficient funds. */
export function changeBalance(userId, amount, type, description = '', ref = null) {
  const u = db.prepare('SELECT balance FROM users WHERE id = ?').get(userId);
  if (!u) fail(404, 'Пользователь не найден');
  const next = u.balance + amount;
  if (next < 0) fail(400, `Недостаточно ${getSetting('currency_name')}`);
  db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(next, userId);
  db.prepare(
    'INSERT INTO transactions (user_id, amount, balance_after, type, description, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(userId, amount, next, type, description, ref, now());
  return next;
}

export function pushBalance(...userIds) {
  for (const id of userIds) {
    const u = db.prepare('SELECT balance FROM users WHERE id = ?').get(id);
    if (u) emitToUser(id, 'balance', { balance: u.balance });
  }
}

// ---------------- messages ----------------
export function serializeMessage(m) {
  if (!m) return null;
  const sender = m.sender_id ? db.prepare('SELECT * FROM users WHERE id = ?').get(m.sender_id) : null;
  let reply = null;
  if (m.reply_to) {
    const r = db.prepare('SELECT m.id, m.text, m.type, m.deleted, u.display_name FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = ?').get(m.reply_to);
    if (r) reply = { id: r.id, text: r.deleted ? 'Сообщение удалено' : r.text, type: r.type, senderName: r.display_name };
  }
  const reactions = db
    .prepare('SELECT emoji, COUNT(*) count, GROUP_CONCAT(user_id) users FROM reactions WHERE message_id = ? GROUP BY emoji ORDER BY count DESC')
    .all(m.id)
    .map((r) => ({ emoji: r.emoji, count: r.count, users: String(r.users).split(',').map(Number) }));
  return {
    id: m.id,
    chatId: m.chat_id,
    sender: lightUser(sender),
    type: m.type,
    text: m.deleted ? '' : m.text,
    media: m.deleted ? null : parse(m.media),
    replyTo: reply,
    forwardFrom: m.forward_from ? lightUser(getUser(m.forward_from)) : null,
    gift: m.user_gift_id ? serializeUserGift(m.user_gift_id) : null,
    edited: !!m.edited_at,
    deleted: !!m.deleted,
    views: m.views,
    reactions,
    createdAt: m.created_at,
  };
}

export function createMessage({ chatId, senderId, type = 'text', text = '', media = null, replyTo = null, forwardFrom = null, userGiftId = null }) {
  const r = db
    .prepare(
      `INSERT INTO messages (chat_id, sender_id, type, text, media, reply_to, forward_from, user_gift_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(chatId, senderId, type, text, media ? JSON.stringify(media) : null, replyTo, forwardFrom, userGiftId, now());
  const id = Number(r.lastInsertRowid);
  if (senderId) db.prepare('UPDATE chat_members SET last_read_id = ? WHERE chat_id = ? AND user_id = ?').run(id, chatId, senderId);
  const msg = serializeMessage(db.prepare('SELECT * FROM messages WHERE id = ?').get(id));
  for (const uid of chatMemberIds(chatId)) {
    emitToUser(uid, 'message:new', { message: msg, chat: serializeChat(chatId, uid) });
  }
  return msg;
}

export function messagePreview(m) {
  if (!m) return null;
  if (m.deleted) return 'Сообщение удалено';
  const labels = { post: '📰 Пост', audio: '🎵 Музыка', transfer: '💸 Перевод', image: '🖼 Фото', video: '🎬 Видео', file: '📎 Файл', voice: '🎤 Голосовое', gift: '🎁 Подарок', sticker: 'Стикер' };
  if (m.type === 'text' || m.type === 'system') return m.text;
  if (m.type === 'gift') return m.text ? (/^\p{Extended_Pictographic}/u.test(m.text) ? m.text : `🎁 ${m.text}`) : labels.gift;
  return m.text ? `${labels[m.type] || ''} ${m.text}` : labels[m.type] || m.type;
}

// ---------------- chats ----------------
export function privateKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function getOrCreatePrivateChat(a, b) {
  const key = a === b ? `saved:${a}` : privateKey(a, b);
  let chat = db.prepare('SELECT * FROM chats WHERE private_key = ?').get(key);
  if (chat) return chat;
  const r = db
    .prepare('INSERT INTO chats (type, owner_id, private_key, created_at) VALUES (?, ?, ?, ?)')
    .run(a === b ? 'saved' : 'private', a, key, now());
  const ins = db.prepare('INSERT INTO chat_members (chat_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
  ins.run(r.lastInsertRowid, a, 'member', now());
  if (a !== b) ins.run(r.lastInsertRowid, b, 'member', now());
  return db.prepare('SELECT * FROM chats WHERE id = ?').get(r.lastInsertRowid);
}

export function getMember(chatId, userId) {
  return db.prepare('SELECT * FROM chat_members WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
}

export function chatUsername(chatId) {
  return db.prepare('SELECT display FROM usernames WHERE chat_id = ?').get(chatId)?.display || null;
}

export function serializeChat(chatOrId, viewerId) {
  const c = typeof chatOrId === 'object' ? chatOrId : db.prepare('SELECT * FROM chats WHERE id = ?').get(chatOrId);
  if (!c) return null;
  const member = getMember(c.id, viewerId);
  const last = db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1').get(c.id);
  const memberCount = db.prepare('SELECT COUNT(*) c FROM chat_members WHERE chat_id = ?').get(c.id).c;
  const unread = member
    ? db.prepare('SELECT COUNT(*) c FROM messages WHERE chat_id = ? AND id > ? AND (sender_id IS NULL OR sender_id != ?) AND deleted = 0').get(c.id, member.last_read_id, viewerId).c
    : 0;
  let title = c.title;
  let avatar = c.avatar;
  let peer = null;
  let username = chatUsername(c.id);
  if (c.type === 'private') {
    const otherId = db.prepare('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?').get(c.id, viewerId)?.user_id;
    const other = otherId && getUser(otherId);
    peer = publicUser(other);
    title = other?.display_name || 'Удалённый аккаунт';
    avatar = other?.avatar;
    username = other?.username;
  } else if (c.type === 'saved') {
    title = 'Избранное';
  }
  // Peer read state for private chats → double ticks.
  let peerReadId = 0;
  if (c.type === 'private' || c.type === 'group') {
    peerReadId =
      db.prepare('SELECT MAX(last_read_id) m FROM chat_members WHERE chat_id = ? AND user_id != ?').get(c.id, viewerId)?.m || 0;
  }
  const lastSender = last?.sender_id ? getUser(last.sender_id) : null;
  return {
    id: c.id,
    type: c.type,
    title,
    avatar,
    description: c.description,
    username,
    isPublic: !!c.is_public,
    inviteCode: member && member.role !== 'member' ? c.invite_code : undefined,
    ownerId: c.owner_id,
    peer,
    memberCount,
    role: member?.role || null,
    isMember: !!member,
    pinned: !!member?.pinned,
    muted: !!member?.muted,
    unread,
    lastReadId: member?.last_read_id || 0,
    peerReadId,
    lastMessage: last
      ? { id: last.id, text: messagePreview(last), senderId: last.sender_id, senderName: lastSender?.display_name, createdAt: last.created_at, type: last.type }
      : null,
    createdAt: c.created_at,
  };
}

export function canPost(chat, member) {
  if (!member) return false;
  if (chat.type === 'channel') return member.role === 'owner' || member.role === 'admin';
  return true;
}

// ---------------- system notifications ----------------
export function notify(userId, text, extra = {}) {
  if (userId === SYSTEM_USER_ID) return;
  const chat = getOrCreatePrivateChat(SYSTEM_USER_ID, userId);
  return createMessage({ chatId: chat.id, senderId: SYSTEM_USER_ID, type: extra.type || 'text', text, userGiftId: extra.userGiftId || null });
}

// ---------------- gifts ----------------
export function serializeGift(g) {
  return {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    image: g.image,
    animation: g.animation,
    price: g.price,
    supply: g.supply,
    sold: g.sold,
    remaining: g.supply == null ? null : Math.max(0, g.supply - g.sold),
    limited: g.supply != null,
    upgradePrice: g.upgrade_price,
    upgradable: g.upgrade_price != null,
    convertValue: g.convert_value,
    enabled: !!g.enabled,
  };
}

export function giftSlug(giftName, number) {
  return `${giftName.replace(/[^\p{L}\p{N}]+/gu, '')}-${number}`;
}

export function serializeUserGift(idOrRow, viewerId = null) {
  const ug = typeof idOrRow === 'object' ? idOrRow : db.prepare('SELECT * FROM user_gifts WHERE id = ?').get(idOrRow);
  if (!ug) return null;
  const g = db.prepare('SELECT * FROM gifts WHERE id = ?').get(ug.gift_id);
  let collectible = null;
  if (ug.upgraded_at) {
    const model = db.prepare('SELECT * FROM gift_models WHERE id = ?').get(ug.model_id);
    const backdrop = db.prepare('SELECT * FROM backdrops WHERE id = ?').get(ug.backdrop_id);
    const symbol = db.prepare('SELECT * FROM symbols WHERE id = ?').get(ug.symbol_id);
    const totals = {
      model: db.prepare('SELECT SUM(rarity) s FROM gift_models WHERE gift_id = ?').get(g.id).s || 1,
      backdrop: db.prepare('SELECT SUM(rarity) s FROM backdrops').get().s || 1,
      symbol: db.prepare('SELECT SUM(rarity) s FROM symbols').get().s || 1,
    };
    const pct = (r, t) => Math.round((r / t) * 1000) / 10;
    const floor = db
      .prepare("SELECT MIN(l.price) p FROM listings l JOIN user_gifts u2 ON u2.id = l.user_gift_id WHERE l.status = 'active' AND u2.gift_id = ?")
      .get(g.id).p;
    const lastSale = db
      .prepare("SELECT l.price p FROM listings l JOIN user_gifts u2 ON u2.id = l.user_gift_id WHERE l.status = 'sold' AND u2.gift_id = ? ORDER BY l.closed_at DESC LIMIT 1")
      .get(g.id)?.p;
    collectible = {
      number: ug.number,
      slug: giftSlug(g.name, ug.number),
      issued: db.prepare('SELECT COUNT(*) c FROM user_gifts WHERE gift_id = ? AND upgraded_at IS NOT NULL').get(g.id).c,
      estimate: floor || lastSale || g.price + (g.upgrade_price || 0),
      model: model && { name: model.name, emoji: model.emoji, image: model.image || g.image, animation: model.image ? model.animation : g.animation, filter: model.filter, rarity: model.rarity, chance: pct(model.rarity, totals.model) },
      backdrop: backdrop && { name: backdrop.name, center: backdrop.center, edge: backdrop.edge, pattern: backdrop.pattern, rarity: backdrop.rarity, chance: pct(backdrop.rarity, totals.backdrop) },
      symbol: symbol && { name: symbol.name, emoji: symbol.emoji, rarity: symbol.rarity, chance: pct(symbol.rarity, totals.symbol) },
      upgradedAt: ug.upgraded_at,
    };
  }
  const showSender = !ug.anonymous || (viewerId && viewerId === ug.owner_id);
  const listing = db.prepare("SELECT id, price FROM listings WHERE kind = 'gift' AND user_gift_id = ? AND status = 'active'").get(ug.id);
  return {
    id: ug.id,
    gift: serializeGift(g),
    owner: lightUser(ug.owner_id && getUser(ug.owner_id)),
    sender: showSender ? lightUser(ug.sender_id && getUser(ug.sender_id)) : null,
    anonymous: !!ug.anonymous,
    message: ug.message,
    hidden: !!ug.hidden,
    pinned: !!ug.pinned,
    converted: !!ug.converted,
    worn: !!ug.owner_id && db.prepare('SELECT worn_gift_id w FROM users WHERE id = ?').get(ug.owner_id)?.w === ug.id,
    collectible,
    listing: listing || null,
    createdAt: ug.created_at,
  };
}

export function weightedPick(rows) {
  const total = rows.reduce((s, r) => s + r.rarity, 0);
  let x = Math.random() * total;
  for (const r of rows) {
    x -= r.rarity;
    if (x <= 0) return r;
  }
  return rows[rows.length - 1];
}

// ---------------- usernames ----------------
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

export function assertUsernameFree(name) {
  if (!USERNAME_RE.test(name)) fail(400, 'Юзернейм: 4–32 символа, латиница, цифры и _, начинается с буквы');
  if (db.prepare('SELECT 1 FROM usernames WHERE name = ?').get(name.toLowerCase())) fail(409, 'Этот юзернейм уже занят');
}

// ---------------- input sanitizing ----------------
const UPLOAD_RE = /^\/uploads\/[a-f0-9]{24}(\.[a-z0-9]{1,9})?$/;
/** Only files uploaded to this server may be referenced (prevents javascript:/external URLs). */
export function safeUploadUrl(url) {
  if (url == null || url === '') return null;
  if (typeof url !== 'string' || !UPLOAD_RE.test(url)) fail(400, 'Некорректная ссылка на файл');
  return url;
}
export function sanitizeMedia(media) {
  if (!media) return null;
  return {
    url: safeUploadUrl(media.url),
    kind: String(media.kind || 'file').slice(0, 16),
    title: media.title ? String(media.title).slice(0, 200) : undefined,
    artist: media.artist ? String(media.artist).slice(0, 200) : undefined,
    duration: Number(media.duration) || undefined,
    mime: String(media.mime || '').slice(0, 100),
    name: String(media.name || 'file').slice(0, 255),
    size: Number(media.size) || 0,
  };
}

export { emitToUser, emitToChat, chatMemberIds };
