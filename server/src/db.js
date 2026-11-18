import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config, setConfigOverride } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL'); // safe with WAL, much faster writes
db.pragma('cache_size = -20000'); // ~20 MB page cache
db.pragma('temp_store = MEMORY');
// Statements are compiled once and reused (the code calls db.prepare() inline everywhere).
{
  const cache = new Map();
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    let st = cache.get(sql);
    if (!st) { st = prepare(sql); cache.set(sql, st); }
    return st;
  };
}

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
setConfigOverride((k) => getSetting(`cfg_${k}`));
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

// Attribute pack v2: many more backdrops and patterns. Pattern and backdrop are rolled
// independently on upgrade, so every pattern can land on every backdrop.
const ATTR_VERSION = 2;
if (Number(getSetting('attr_version') || 1) < ATTR_VERSION) {
  const moreBackdrops = [
    // name, center, edge, pattern, rarity
    ['Малахит', '#2ecc71', '#0b3d1f', '#a8f0c6', 22],
    ['Сапфир', '#2f6bff', '#0a1650', '#aac4ff', 20],
    ['Рубин', '#e0115f', '#4a0020', '#ffa3c4', 16],
    ['Аметист', '#9b59ff', '#2b0b55', '#d9c2ff', 20],
    ['Янтарь', '#ffb000', '#5c3300', '#ffe2a0', 18],
    ['Медь', '#d47a45', '#4a1f0a', '#f3c4a6', 24],
    ['Бронза', '#b08d57', '#3b2a12', '#e4d2b0', 24],
    ['Серебро', '#cfd6df', '#4a5260', '#f4f7fa', 16],
    ['Платина', '#e6e8ec', '#7d8590', '#ffffff', 8],
    ['Хаки', '#8f9b5a', '#2c3214', '#d5dcb4', 28],
    ['Милитари', '#5e7046', '#1a2210', '#b7c79e', 28],
    ['Тюремная роба', '#4d6b8a', '#121e2b', '#b3c6da', 30],
    ['Бетон', '#9a9a94', '#3a3a36', '#d9d9d3', 30],
    ['Ржавчина', '#b5541c', '#3a1404', '#eab08e', 22],
    ['Кирпич', '#b0413e', '#3d1110', '#e8a9a7', 24],
    ['Табак', '#8b5a2b', '#2e1a08', '#d9b48f', 24],
    ['Кофе', '#7b4b2a', '#24130a', '#d1ad94', 26],
    ['Шоколад', '#5c3317', '#1a0c04', '#c49a7a', 24],
    ['Вишня', '#c2185b', '#3d0019', '#f5a6c7', 20],
    ['Малина', '#e8336f', '#4d0420', '#ffb3cc', 20],
    ['Персик', '#ffab7a', '#7a3a1a', '#ffe0cc', 24],
    ['Лимон', '#f5e050', '#5c5000', '#fff7b8', 22],
    ['Лайм', '#b6f23b', '#3a5200', '#e6ffb3', 22],
    ['Мята', '#7dffcf', '#0a5a40', '#d4fff0', 22],
    ['Небо', '#6ec6ff', '#0d3c66', '#d0ecff', 24],
    ['Индиго', '#4b3bff', '#120a5a', '#c0b8ff', 18],
    ['Лаванда', '#c3a6ff', '#3d2a6b', '#ece2ff', 22],
    ['Сирень', '#d080ff', '#4a0f6b', '#f0d1ff', 20],
    ['Фуксия', '#ff3bd0', '#5a0046', '#ffb8ef', 18],
    ['Коралл', '#ff6f61', '#5a1410', '#ffc9c3', 22],
    ['Песок', '#e8cf9a', '#6b5428', '#fff1d6', 26],
    ['Пустыня', '#d9a066', '#5a3410', '#f5d6b8', 24],
    ['Тайга', '#2f6b4a', '#0a1f14', '#9fd0b4', 24],
    ['Колыма', '#a8c8e0', '#1e3a52', '#e6f2fa', 18],
    ['Полярное сияние', '#3bffb0', '#1a0b5a', '#c8ffe8', 8],
    ['Северное небо', '#6a8cff', '#0b1033', '#cdd8ff', 14],
    ['Вулкан', '#ff5a1f', '#2a0500', '#ffc2a8', 10],
    ['Магма', '#ffa21f', '#4a0a00', '#ffe0a8', 10],
    ['Туман', '#b8c2cc', '#3c444d', '#eef2f5', 26],
    ['Дым', '#6e6e6e', '#151515', '#bdbdbd', 28],
    ['Пепел', '#a39e98', '#2e2b28', '#dedad6', 26],
    ['Уголь', '#3d3d3d', '#0a0a0a', '#8f8f8f', 26],
    ['Сталь', '#7b8794', '#1f262e', '#c4ccd4', 26],
    ['Чернила', '#2b3a67', '#070b1a', '#95a3cc', 22],
    ['Кровь', '#a0001b', '#1f0005', '#ff8a9c', 12],
    ['Яд', '#7aff00', '#0f2a00', '#d9ffb3', 10],
    ['Кислота', '#ddff00', '#2e3a00', '#f7ffb3', 10],
    ['Киберпанк', '#00f0ff', '#3a005a', '#b3fbff', 8],
    ['Синтвейв', '#ff4fd8', '#1b0a4a', '#ffc4f2', 8],
    ['Радуга', '#ff8a3b', '#3b0a6b', '#fff1a8', 5],
    ['Хамелеон', '#3bd9ff', '#3b6b00', '#e0ffd0', 6],
    ['Космос', '#5b3bff', '#000010', '#c6b8ff', 6],
    ['Королевский пурпур', '#7a1fa2', '#1e0030', '#e0b3f5', 7],
    ['Императорское золото', '#ffcc33', '#3d2200', '#fff4c2', 4],
    ['Белый лотос', '#ffffff', '#9aa3ad', '#ffffff', 5],
  ];
  const insB = db.prepare('INSERT INTO backdrops (name, center, edge, pattern, rarity) VALUES (?, ?, ?, ?, ?)');
  for (const b of moreBackdrops) if (!db.prepare('SELECT 1 FROM backdrops WHERE name = ?').get(b[0])) insB.run(...b);

  const moreSymbols = [
    // name, emoji, rarity
    ['Нож', '🔪', 22], ['Кинжал', '🗡️', 18], ['Ствол', '🔫', 14], ['Бомба', '💣', 14], ['Джокер', '🃏', 12],
    ['Черви', '♥️', 24], ['Бубны', '♦️', 24], ['Трефы', '♣️', 24], ['Джекпот', '🎰', 8], ['Мешок денег', '💰', 12],
    ['Купюры', '💵', 20], ['Монета', '🪙', 22], ['Замок', '🔒', 22], ['Отмычка', '🔑', 22], ['Якорь', '⚓', 22],
    ['Паутина', '🕸️', 20], ['Скорпион', '🦂', 14], ['Змея', '🐍', 16], ['Волк', '🐺', 14], ['Орёл', '🦅', 14],
    ['Летучая мышь', '🦇', 18], ['Крыса', '🐀', 20], ['Следы', '🐾', 24], ['Кактус', '🌵', 24], ['Клён', '🍁', 24],
    ['Сакура', '🌸', 22], ['Подсолнух', '🌻', 22], ['Листва', '🌿', 26], ['Гриб', '🍄', 20], ['Искра', '✨', 22],
    ['Сияние', '🌟', 18], ['Комета', '💫', 18], ['Планета', '🪐', 12], ['Солнце', '☀️', 20], ['Облако', '☁️', 26],
    ['Волна', '🌊', 22], ['Капля', '💧', 26], ['Восьмёрка', '🎱', 16], ['Мишень', '🎯', 20], ['Кубок', '🏆', 10],
    ['Медаль', '🥇', 12], ['Нота', '🎵', 24], ['Ноты', '🎶', 22], ['Гитара', '🎸', 16], ['Труба', '🎺', 18],
    ['Стопка', '🥃', 20], ['Вино', '🍷', 20], ['Шампанское', '🍾', 14], ['Сигарета', '🚬', 20], ['Таблетка', '💊', 18],
    ['Оберег', '🧿', 14], ['Весёлый Роджер', '☠️', 10], ['Мечи', '⚔️', 14], ['Щит', '🛡️', 18], ['Шестерня', '⚙️', 24],
    ['Топор', '🪓', 18], ['Колокол', '🔔', 22], ['Свеча', '🕯️', 20], ['Чётки', '📿', 14], ['Магнит', '🧲', 22],
    ['Хамса', '🪬', 10], ['Капля крови', '🩸', 14], ['Поцелуй', '💋', 18], ['Призрак', '👻', 16], ['Могила', '🪦', 12],
    ['Урна', '⚱️', 12], ['Сирена', '🚨', 16], ['Чёрный флаг', '🏴', 14], ['Финиш', '🏁', 18], ['Крест', '✖️', 24],
    ['Мишень-кольцо', '⭕', 24], ['Треугольник', '🔺', 24], ['Ромб', '🔷', 24], ['Вишня', '🍒', 22], ['Лимон', '🍋', 22],
    ['Увядшая роза', '🥀', 16], ['Гибискус', '🌺', 22], ['Дракон', '🐉', 6], ['Бабочка', '🦋', 18], ['Ракушка', '🐚', 20],
    ['Перо', '🪶', 20], ['Клык', '🦷', 16], ['Мишка', '🧸', 16], ['Бантик', '🎀', 20], ['Шарик', '🎈', 22],
    ['Динамит', '🧨', 12], ['Коза', '🤘', 18], ['Победа', '✌️', 20], ['Кулак', '👊', 18], ['Деньги на ветер', '💸', 12],
    ['Фонарик', '🏮', 18], ['Тории', '⛩️', 10], ['Шар судьбы', '🔮', 10], ['Лёд', '🧊', 20], ['Вихрь', '🌀', 22],
    ['Радуга', '🌈', 8], ['Маски', '🎭', 14], ['Моаи', '🗿', 8], ['Сова', '🦉', 16], ['Чёрный кот', '🐈‍⬛', 12],
    ['Лис', '🦊', 16], ['Медведь', '🐻', 16], ['Лев', '🦁', 10], ['Тигр', '🐯', 10], ['Акула', '🦈', 12],
    ['Осьминог', '🐙', 14], ['Краб', '🦀', 18],
  ];
  const insS = db.prepare('INSERT INTO symbols (name, emoji, rarity) VALUES (?, ?, ?)');
  for (const x of moreSymbols) if (!db.prepare('SELECT 1 FROM symbols WHERE name = ?').get(x[0])) insS.run(...x);
  setSetting('attr_version', ATTR_VERSION);
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
addColumn('gifts', 'slug', 'TEXT');
addColumn('gift_models', 'image', 'TEXT');
addColumn('gift_models', 'animation', 'TEXT');
addColumn('users', 'worn_gift_id', 'INTEGER');
addColumn('users', 'profile_track_id', 'INTEGER');
addColumn('users', 'personal_channel_id', 'INTEGER');
addColumn('users', 'profile_views', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'anon_number', 'TEXT');
addColumn('users', 'is_tester', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'banner', 'TEXT');
addColumn('users', 'banner_type', 'TEXT');
addColumn('users', 'links', 'TEXT');
addColumn('users', 'wallpaper', 'TEXT');
addColumn('users', 'premium_until', 'INTEGER');
addColumn('users', 'name_style', 'TEXT');
addColumn('users', 'profile_bg', 'TEXT');
addColumn('users', 'location', 'TEXT');
addColumn('users', 'show_balance', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'privacy', 'TEXT');
addColumn('users', 'sessions_after', 'INTEGER');
addColumn('users', 'blur_bg', 'TEXT');
addColumn('user_gifts', 'chat_id', 'INTEGER');
addColumn('users', 'e2e_key', 'TEXT');
addColumn('users', 'deleted_at', 'INTEGER');
addColumn('chats', 'auto_delete', 'INTEGER NOT NULL DEFAULT 0');
addColumn('messages', 'expires_at', 'INTEGER');
addColumn('messages', 'silent', 'INTEGER NOT NULL DEFAULT 0');
addColumn('chat_members', 'archived', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'status_text', 'TEXT');
addColumn('users', 'status_until', 'INTEGER');
db.exec(`CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  send_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_messages(send_at);`);
db.exec('CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages(expires_at) WHERE expires_at IS NOT NULL');
db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL,
  last_active INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  media TEXT,
  repost_of INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  views INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, id);
CREATE TABLE IF NOT EXISTS post_likes (post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (post_id, user_id));
CREATE TABLE IF NOT EXISTS post_views (post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, PRIMARY KEY (post_id, user_id));
CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, id);
CREATE TABLE IF NOT EXISTS post_tags (post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, tag TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (post_id, tag));
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag, post_id);
CREATE TABLE IF NOT EXISTS follows (follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (follower_id, followee_id));
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
CREATE TABLE IF NOT EXISTS contacts (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, contact_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, contact_id));
CREATE TABLE IF NOT EXISTS blocks (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, blocked_id));
CREATE TABLE IF NOT EXISTS profile_views (viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, viewed_at INTEGER NOT NULL, PRIMARY KEY (viewer_id, user_id));
`);
addColumn('posts', 'edited_at', 'INTEGER');
db.exec('UPDATE sessions SET ip = NULL WHERE ip IS NOT NULL'); // IPs are not stored any more
for (const [k, v] of Object.entries({ premium_price: '300', posts_per_day: '5', posts_per_day_premium: '20', post_cooldown: '30', post_cooldown_premium: '15' })) {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(k, v);
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_anon_number ON users(anon_number)');

// ---------- in-app bot: anonymous numbers ----------
function ensureBot(username, name, bio) {
  const row = db.prepare('SELECT n.user_id FROM usernames n JOIN users u ON u.id = n.user_id WHERE n.name = ? AND u.is_bot = 1').get(username);
  if (row?.user_id) return row.user_id;
  // someone already took the handle — fall back to <name>_bot
  if (db.prepare('SELECT 1 FROM usernames WHERE name = ?').get(username)) return ensureBot(`${username}_bot`, name, bio);
  const r = db.prepare('INSERT INTO users (display_name, bio, is_bot, verified, created_at) VALUES (?, ?, 1, 1, ?)').run(name, bio, now());
  db.prepare('INSERT INTO usernames (name, display, user_id, created_at) VALUES (?, ?, ?, ?)').run(username, username, r.lastInsertRowid, now());
  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, r.lastInsertRowid);
  return Number(r.lastInsertRowid);
}
export const NUMBERS_BOT_ID = ensureBot('numbers', 'Анонимные номера', 'Бот Recidivist: создайте анонимный номер и привяжите его к профилю.');
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

// Catalog v3: the limited line-up is replaced by the Recidivist collections (own art,
// one model per picture, rarity from the design sheet). Gifts that are not in the catalog
// get hidden from the shop (owners keep them).
const GIFT_CATALOG_VERSION = 4;
const COLLECTION_MODELS = JSON.parse(fs.readFileSync(new URL('./gift-collections.json', import.meta.url), 'utf8'));
const GIFT_CATALOG = [
  // slug, name, emoji (fallback), price, supply, upgrade_price, convert_value, art
  // art: a number = base model of a collection; a string = animated sticker in /gifts/regular
  // (Noto Animated Emoji, Google, CC BY 4.0).
  ['heart', 'Горящее сердце', '❤️‍🔥', 25, null, null, 21, '2764_fe0f_200d_1f525'],
  ['rose', 'Роза', '🌹', 30, null, null, 25, '1f339'],
  ['frog', 'Плюшевая жаба', '🐸', 35, null, null, 30, '1f438'],
  ['champagne', 'Шампанское', '🍾', 50, null, null, 43, '1f37e'],
  ['pumpkin', 'Тыква', '🎃', 75, null, null, 64, '1f383'],
  ['dice', 'Кости', '🎲', 90, null, null, 77, '1f3b2'],
  ['skull', 'Череп', '💀', 110, null, null, 94, '1f480'],
  ['diamond', 'Бриллиант', '💎', 150, null, null, 128, '1f48e'],
  ['kot-stukach', 'Кот-Стукач', '🐈', 350, 9000, 150, 280, 50],
  ['pahan-pepe', 'Пахан Пепе', '🐸', 700, 5000, 300, 560, 50],
  ['sigara-smotryashchego', 'Сигара Смотрящего', '🚬', 1200, 2500, 450, 960, 55],
  ['blatnoy-patefon', 'Блатной Патефон', '📻', 2000, 1500, 666, 1600, 100],
];
/** Find the DB row of a catalog entry: by slug, or (legacy regular gifts) by emoji. */
function catalogRow(slug, emoji, legacy) {
  return db.prepare('SELECT * FROM gifts WHERE slug = ?').get(slug)
    || (legacy ? db.prepare("SELECT * FROM gifts WHERE slug IS NULL AND emoji = ? AND (image IS NULL OR image NOT LIKE '/gifts/%')").get(emoji) : null);
}
{
  const ins = db.prepare(
    'INSERT INTO gifts (slug, name, emoji, image, animation, price, supply, upgrade_price, convert_value, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insModel = db.prepare('INSERT INTO gift_models (gift_id, name, emoji, filter, image, animation, rarity) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const keep = new Set();
  tx0(() => {
    const upgradeCatalog = Number(getSetting('gift_catalog_version') || 1) < GIFT_CATALOG_VERSION;
    GIFT_CATALOG.forEach(([slug, name, emoji, price, supply, upg, conv, art], i) => {
      const models = COLLECTION_MODELS[slug];
      const sticker = typeof art === 'string' ? { image: `/gifts/regular/${art}.webp`, animation: `/gifts/regular/${art}.tgs` } : null;
      let row = catalogRow(slug, emoji, !models);
      if (row && sticker && upgradeCatalog) {
        // restyle an existing regular gift: new art, catalog price; owners keep what they have
        db.prepare('UPDATE gifts SET name = ?, image = ?, animation = ?, price = ?, convert_value = ?, enabled = 1 WHERE id = ?').run(name, sticker.image, sticker.animation, price, conv, row.id);
      }
      if (!row) {
        const base = models?.find((m) => m.n === art);
        const a = sticker || (base ? { image: base.image, animation: base.animation } : giftAssets(emoji));
        const r = ins.run(slug, name, emoji, a.image, a.animation, price, supply, upg, conv, i, now());
        row = { id: Number(r.lastInsertRowid) };
        if (models) for (const m of models) insModel.run(row.id, m.name, emoji, '', m.image, m.animation, m.rarity);
        else if (upg != null) seedModelsForGift(row.id, emoji);
      } else if (!row.slug) db.prepare('UPDATE gifts SET slug = ? WHERE id = ?').run(slug, row.id);
      db.prepare('UPDATE gifts SET sort = ? WHERE id = ?').run(i, row.id);
      keep.add(row.id);
    });
    if (upgradeCatalog) {
      for (const g of db.prepare('SELECT id FROM gifts').all()) if (!keep.has(g.id)) db.prepare('UPDATE gifts SET enabled = 0 WHERE id = ?').run(g.id);
      setSetting('gift_catalog_version', GIFT_CATALOG_VERSION);
    }
  });
  // v5: the shop sells collectible (upgradable) gifts only — regular gifts are hidden, owners keep them.
  if (!getSetting('gift_catalog_v5')) {
    for (const [slug, , , , , upg] of GIFT_CATALOG) if (upg == null) db.prepare('UPDATE gifts SET enabled = 0 WHERE slug = ?').run(slug);
    setSetting('gift_catalog_v5', '1');
  }
  // Older databases: attach 3D assets to emoji gifts created before they existed.
  for (const g of db.prepare('SELECT id, emoji, image, animation FROM gifts').all()) {
    const a = giftAssets(g.emoji);
    if ((!g.image && a.image) || (!g.animation && a.animation)) {
      db.prepare('UPDATE gifts SET image = COALESCE(image, ?), animation = COALESCE(animation, ?) WHERE id = ?').run(a.image, a.animation, g.id);
    }
  }
}
function tx0(fn) {
  return db.transaction(fn)();
}

// ---------- indexes for hot queries ----------
db.exec(`
CREATE INDEX IF NOT EXISTS idx_user_gifts_gift ON user_gifts(gift_id, upgraded_at);
CREATE INDEX IF NOT EXISTS idx_user_gifts_chat ON user_gifts(chat_id);
CREATE INDEX IF NOT EXISTS idx_listings_gift ON listings(user_gift_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_username ON listings(kind, status, username);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_repost ON posts(repost_of);
CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, id);
CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_usernames_user ON usernames(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);
`);
db.pragma('optimize');

export function tx(fn) {
  return db.transaction(fn)();
}
