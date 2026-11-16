import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  auth_hash TEXT UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT DEFAULT '',
  avatar TEXT,
  username TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_banned INTEGER NOT NULL DEFAULT 0,
  is_bot INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  emoji_status TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- Usernames are first-class collectibles: a user can own many, display one, and trade them on the market.
CREATE TABLE IF NOT EXISTS usernames (
  name TEXT PRIMARY KEY,           -- lowercase
  display TEXT NOT NULL,           -- original casing
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('private','group','channel','saved')),
  title TEXT,
  description TEXT DEFAULT '',
  avatar TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  private_key TEXT UNIQUE,         -- "minId:maxId" for private chats
  is_public INTEGER NOT NULL DEFAULT 0,
  invite_code TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_members (
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
  joined_at INTEGER NOT NULL,
  last_read_id INTEGER NOT NULL DEFAULT 0,
  muted INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (chat_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON chat_members(user_id);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT DEFAULT '',
  media TEXT,                      -- JSON
  reply_to INTEGER,
  forward_from INTEGER,
  user_gift_id INTEGER,
  edited_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);

CREATE TABLE IF NOT EXISTS reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media TEXT NOT NULL,
  media_type TEXT NOT NULL,
  caption TEXT DEFAULT '',
  bg TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS story_views (
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  image TEXT,
  price INTEGER NOT NULL,
  supply INTEGER,                  -- NULL = unlimited
  sold INTEGER NOT NULL DEFAULT 0,
  upgrade_price INTEGER,           -- NULL = not upgradable
  convert_value INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gift_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id INTEGER NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  filter TEXT DEFAULT '',
  rarity INTEGER NOT NULL           -- permille weight (10 = 1%)
);

CREATE TABLE IF NOT EXISTS backdrops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  center TEXT NOT NULL,
  edge TEXT NOT NULL,
  pattern TEXT NOT NULL,
  rarity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  rarity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_gifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gift_id INTEGER NOT NULL REFERENCES gifts(id),
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message TEXT DEFAULT '',
  anonymous INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 0,
  converted INTEGER NOT NULL DEFAULT 0,
  price_paid INTEGER NOT NULL DEFAULT 0,
  number INTEGER,
  model_id INTEGER REFERENCES gift_models(id),
  backdrop_id INTEGER REFERENCES backdrops(id),
  symbol_id INTEGER REFERENCES symbols(id),
  upgraded_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_gifts_owner ON user_gifts(owner_id);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('gift','username')),
  user_gift_id INTEGER REFERENCES user_gifts(id),
  username TEXT,
  price INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled')),
  buyer_id INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, kind);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT DEFAULT '',
  ref TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id, id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  package_id TEXT,
  amount TEXT NOT NULL,
  currency TEXT NOT NULL,
  sparks INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_id TEXT,
  comment TEXT UNIQUE,
  pay_url TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const now = () => Date.now();

// ---------- default settings ----------
const defaultSettings = {
  currency_name: 'Искры',
  currency_name_en: 'Sparks',
  currency_symbol: '✦',
  market_fee_percent: '5',
  min_listing_price: '10',
  username_price: '0', // price to claim a new free username (0 = free)
  signup_bonus: '50',
  // top-up packages: sparks -> price in TON / USDT
  packages: JSON.stringify([
    { id: 'p100', sparks: 100, ton: 0.5, usdt: 1.5 },
    { id: 'p500', sparks: 500, ton: 2.2, usdt: 7 },
    { id: 'p1000', sparks: 1000, ton: 4, usdt: 13 },
    { id: 'p2500', sparks: 2500, ton: 9.5, usdt: 30 },
    { id: 'p10000', sparks: 10000, ton: 35, usdt: 110 },
  ]),
};
const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) insSetting.run(k, v);

export function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    String(value),
  );
}

// ---------- system bot account ----------
let sys = db.prepare('SELECT * FROM users WHERE is_bot = 1 AND email IS NULL ORDER BY id LIMIT 1').get();
if (!sys) {
  const r = db
    .prepare(
      `INSERT INTO users (display_name, bio, is_bot, verified, created_at) VALUES ('Recidivist', 'Официальные уведомления Recidivist', 1, 1, ?)`,
    )
    .run(now());
  db.prepare('INSERT INTO usernames (name, display, user_id, created_at) VALUES (?, ?, ?, ?)').run(
    'recidivist',
    'recidivist',
    r.lastInsertRowid,
    now(),
  );
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run('recidivist', r.lastInsertRowid);
  sys = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
}
export const SYSTEM_USER_ID = sys.id;

// ---------- collectible attribute seeds ----------
if (!db.prepare('SELECT COUNT(*) c FROM backdrops').get().c) {
  const backdrops = [
    ['Кровавая луна', '#ff3b3b', '#5a0000', '#ff9a9a', 15],
    ['Оникс', '#3a3a3a', '#000000', '#7a7a7a', 30],
    ['Неон', '#ff2bd6', '#3b005a', '#ffa3f0', 20],
    ['Токсик', '#9dff3b', '#1c4d00', '#e0ffb8', 20],
    ['Лёд', '#7fe3ff', '#0a3a66', '#d8f6ff', 25],
    ['Золото', '#ffd34d', '#7a4a00', '#fff1c2', 12],
    ['Фиалка', '#a77bff', '#2a0f6b', '#dccbff', 25],
    ['Изумруд', '#3bffa7', '#004d33', '#c2ffe6', 20],
    ['Закат', '#ff8a3b', '#6b1a00', '#ffd3b0', 25],
    ['Океан', '#3b8aff', '#001a5a', '#b8d3ff', 25],
    ['Графит', '#8a8f99', '#22252b', '#c9ccd2', 30],
    ['Розовый кварц', '#ffb3c7', '#7a2e45', '#ffe3ea', 22],
    ['Бирюза', '#3bf0e0', '#00504a', '#c0fff9', 22],
    ['Карамель', '#e0a060', '#5a3010', '#f5d9bb', 25],
    ['Полночь', '#3b3b8a', '#05051a', '#9a9ad9', 18],
    ['Плазма', '#ff3b8a', '#2a0a6b', '#ffc0d9', 10],
    ['Чёрная дыра', '#1a1a1a', '#000000', '#ff2a2a', 4],
  ];
  const ins = db.prepare('INSERT INTO backdrops (name, center, edge, pattern, rarity) VALUES (?, ?, ?, ?, ?)');
  for (const b of backdrops) ins.run(...b);

  const symbols = [
    ['Череп', '💀', 15], ['Звезда', '⭐', 30], ['Молния', '⚡', 25], ['Сердце', '❤️', 30], ['Корона', '👑', 10],
    ['Огонь', '🔥', 25], ['Ключ', '🗝️', 20], ['Кость', '🦴', 20], ['Луна', '🌙', 25], ['Алмаз', '💎', 10],
    ['Кубик', '🎲', 25], ['Глаз', '👁️', 15], ['Цепь', '⛓️', 18], ['Роза', '🌹', 22], ['Пламя', '☄️', 12],
    ['Паук', '🕷️', 18], ['Клевер', '🍀', 20], ['Пика', '♠️', 22], ['Снежинка', '❄️', 22], ['Нимб', '😇', 5],
  ];
  const insS = db.prepare('INSERT INTO symbols (name, emoji, rarity) VALUES (?, ?, ?)');
  for (const s of symbols) insS.run(...s);
}

// Model template: same emoji re-coloured by CSS filters, each with its own rarity.
export const MODEL_TEMPLATES = [
  ['Оригинал', '', 200],
  ['Неон', 'hue-rotate(280deg) saturate(1.8)', 120],
  ['Токсик', 'hue-rotate(90deg) saturate(1.6)', 120],
  ['Лёд', 'hue-rotate(180deg) brightness(1.15)', 120],
  ['Золото', 'sepia(1) saturate(4) hue-rotate(-10deg) brightness(1.1)', 60],
  ['Нуар', 'grayscale(1) contrast(1.3)', 80],
  ['Инверсия', 'invert(1) hue-rotate(180deg)', 50],
  ['Ультрафиолет', 'hue-rotate(230deg) saturate(2.5) brightness(1.1)', 70],
  ['Бронза', 'sepia(0.8) saturate(2) hue-rotate(-25deg) brightness(0.85)', 90],
  ['Призрак', 'grayscale(0.6) brightness(1.6) opacity(0.85)', 40],
  ['Кровь', 'hue-rotate(-40deg) saturate(3) brightness(0.9)', 40],
  ['Голограмма', 'hue-rotate(140deg) saturate(3) contrast(1.2)', 10],
];

export function seedModelsForGift(giftId, emoji) {
  const ins = db.prepare('INSERT INTO gift_models (gift_id, name, emoji, filter, rarity) VALUES (?, ?, ?, ?, ?)');
  for (const [name, filter, rarity] of MODEL_TEMPLATES) ins.run(giftId, name, emoji, filter, rarity);
}

// ---------- migrations for existing databases ----------
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('gifts', 'animation', 'TEXT');
addColumn('users', 'worn_gift_id', 'INTEGER');
addColumn('users', 'profile_track_id', 'INTEGER');
addColumn('users', 'personal_channel_id', 'INTEGER');
addColumn('users', 'profile_views', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  cover TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracks_user ON tracks(user_id, id);
`);

// ---------- 3D gift assets (Fluent Emoji, shipped in web/public) ----------
const WEB_PUBLIC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'web', 'public');
export const emojiCode = (e) => [...String(e)].map((c) => c.codePointAt(0).toString(16)).join('-');
/** Static 3D image + animated version (if we ship one) for an emoji. */
export function giftAssets(emoji) {
  const variants = [emojiCode(emoji), emojiCode(String(emoji).replace(/️/g, '')), `${emojiCode(String(emoji).replace(/️/g, ''))}-fe0f`];
  const find = (dir) => {
    for (const c of variants) if (fs.existsSync(path.join(WEB_PUBLIC, dir, `${c}.webp`))) return `/${dir}/${c}.webp`;
    return null;
  };
  return { image: find('emoji3d'), animation: find('emoji-anim') };
}

// Catalog v2. Gifts that are not in the catalog get hidden from the shop (owners keep them).
const GIFT_CATALOG_VERSION = 2;
const GIFT_CATALOG = [
  // name, emoji, price, supply, upgrade_price, convert_value
  ['Горящее сердце', '❤️‍🔥', 25, null, null, 21],
  ['Плюшевая жаба', '🐸', 35, null, null, 30],
  ['Мартини', '🍸', 50, null, null, 43],
  ['Чёрный кот', '🐈‍⬛', 75, null, null, 64],
  ['Тыква', '🎃', 90, null, null, 77],
  ['Пластинка', '💿', 150, 15000, 100, 120],
  ['Сигара', '🚬', 200, 12000, 120, 160],
  ['Фотоаппарат', '📸', 250, 10000, 150, 200],
  ['Бабочка', '🦋', 300, 9000, 150, 240],
  ['Часы', '⌚', 400, 7000, 200, 320],
  ['Чертёнок', '😈', 450, 6666, 222, 360],
  ['Клоун', '🤡', 500, 5000, 250, 400],
  ['Пиксель', '👾', 550, 5000, 250, 440],
  ['Робот', '🤖', 700, 4000, 300, 560],
  ['Перстень', '💍', 900, 3000, 350, 720],
  ['Акула', '🦈', 1000, 2500, 400, 800],
  ['Волк', '🐺', 1200, 2000, 450, 960],
  ['Мозг', '🧠', 1400, 1500, 500, 1120],
  ['НЛО', '🛸', 1700, 1200, 550, 1360],
  ['Дракон', '🐉', 2200, 888, 666, 1760],
  ['Всевидящее око', '👁️', 3000, 666, 777, 2400],
];
if (Number(getSetting('gift_catalog_version') || 1) < GIFT_CATALOG_VERSION) {
  const keep = new Set(GIFT_CATALOG.map((g) => g[1]));
  for (const g of db.prepare('SELECT id, emoji FROM gifts').all()) if (!keep.has(g.emoji)) db.prepare('UPDATE gifts SET enabled = 0 WHERE id = ?').run(g.id);
  setSetting('gift_catalog_version', GIFT_CATALOG_VERSION);
}
{
  const ins = db.prepare(
    'INSERT INTO gifts (name, emoji, image, animation, price, supply, upgrade_price, convert_value, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  GIFT_CATALOG.forEach(([name, emoji, price, supply, upg, conv], i) => {
    if (db.prepare('SELECT 1 FROM gifts WHERE emoji = ?').get(emoji)) return;
    const a = giftAssets(emoji);
    const r = ins.run(name, emoji, a.image, a.animation, price, supply, upg, conv, i, now());
    if (upg != null) seedModelsForGift(r.lastInsertRowid, emoji);
  });
  // Older databases: attach 3D assets to gifts created before they existed.
  for (const g of db.prepare('SELECT id, emoji, image, animation FROM gifts').all()) {
    const a = giftAssets(g.emoji);
    if ((!g.image && a.image) || (!g.animation && a.animation)) {
      db.prepare('UPDATE gifts SET image = COALESCE(image, ?), animation = COALESCE(animation, ?) WHERE id = ?').run(a.image, a.animation, g.id);
    }
  }
  const order = new Map(GIFT_CATALOG.map((g, i) => [g[1], i]));
  for (const g of db.prepare('SELECT id, emoji FROM gifts').all()) if (order.has(g.emoji)) db.prepare('UPDATE gifts SET sort = ? WHERE id = ?').run(order.get(g.emoji), g.id);
}

export function tx(fn) {
  return db.transaction(fn)();
}
