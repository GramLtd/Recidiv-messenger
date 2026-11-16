import { db, NUMBERS_BOT_ID } from './db.js';
import { createMessage, getOrCreatePrivateChat, getUser } from './services.js';

/**
 * Anonymous numbers: +888 — everyone, +999 — testers, +000 — developers (admins).
 * Stored as 11 digits: 3-digit code + 8 digits, shown as "+888 1234 5678".
 */
export const NUMBER_CODES = {
  888: { label: 'для всех', allowed: () => true },
  999: { label: 'тестировщики', allowed: (u) => !!u.is_tester || !!u.is_admin },
  '000': { label: 'разработчик', allowed: (u) => !!u.is_admin },
};

export const formatNumber = (n) => (n ? `+${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}` : null);

const BUTTONS = {
  random: '🎲 Случайный номер',
  mine: '📱 Мой номер',
  release: '🗑 Отвязать номер',
  help: 'ℹ️ Помощь',
};

function reply(user, text, buttons = [BUTTONS.random, BUTTONS.mine, BUTTONS.release, BUTTONS.help]) {
  const chat = getOrCreatePrivateChat(NUMBERS_BOT_ID, user.id);
  createMessage({ chatId: chat.id, senderId: NUMBERS_BOT_ID, type: 'text', text, media: buttons.length ? { buttons } : null });
}

function codesFor(user) {
  return Object.entries(NUMBER_CODES)
    .filter(([, c]) => c.allowed(user))
    .map(([code, c]) => `+${code} — ${c.label}`)
    .join('\n');
}

function assign(user, number) {
  const taken = db.prepare('SELECT id FROM users WHERE anon_number = ?').get(number);
  if (taken && taken.id !== user.id) return reply(user, `❌ Номер ${formatNumber(number)} уже занят. Попробуйте другой.`);
  db.prepare('UPDATE users SET anon_number = ? WHERE id = ?').run(number, user.id);
  reply(user, `✅ Номер ${formatNumber(number)} привязан к вашему профилю.\n\nОн виден в профиле и будет использоваться во всех сервисах Recidivist.`);
}

function randomNumber(code) {
  for (let i = 0; i < 50; i++) {
    const n = code + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
    if (!db.prepare('SELECT 1 FROM users WHERE anon_number = ?').get(n)) return n;
  }
  return null;
}

const HELP = (user) =>
  '📱 Анонимные номера Recidivist\n\n' +
  'Создайте номер и привяжите его к профилю. Номер не связан с вашей SIM-картой и будет использоваться во всех сервисах Recidivist.\n\n' +
  `Доступные коды:\n${codesFor(user)}\n\n` +
  'Отправьте желаемый номер, например:\n888 1234 5678\n— или нажмите «Случайный номер».';

export function handleNumbersBot(userId, rawText) {
  const user = getUser(userId);
  if (!user) return;
  const text = String(rawText || '').trim();
  const lower = text.toLowerCase();
  if (!text || lower === '/start' || lower === BUTTONS.help.toLowerCase() || lower === '/help' || lower === 'помощь') {
    const cur = user.anon_number ? `\n\nВаш номер: ${formatNumber(user.anon_number)}` : '';
    return reply(user, HELP(user) + cur);
  }
  if (text === BUTTONS.mine || lower === '/my') {
    return reply(user, user.anon_number ? `📱 Ваш номер: ${formatNumber(user.anon_number)}` : 'У вас пока нет номера. Отправьте желаемый номер или нажмите «Случайный номер».');
  }
  if (text === BUTTONS.release || lower === '/release') {
    if (!user.anon_number) return reply(user, 'У вас нет привязанного номера.');
    db.prepare('UPDATE users SET anon_number = NULL WHERE id = ?').run(user.id);
    return reply(user, `🗑 Номер ${formatNumber(user.anon_number)} отвязан и снова свободен.`);
  }
  if (text === BUTTONS.random || lower === '/random') {
    const n = randomNumber('888');
    return n ? assign(user, n) : reply(user, 'Не удалось подобрать номер, попробуйте ещё раз.');
  }
  const digits = text.replace(/\D/g, '');
  let number = null;
  if (digits.length === 8) number = `888${digits}`;
  else if (digits.length === 11) number = digits;
  if (!number) return reply(user, '🤔 Не понял. Отправьте номер в формате 888 1234 5678 (код и 8 цифр) или нажмите кнопку ниже.');
  const code = number.slice(0, 3);
  const rule = NUMBER_CODES[code];
  if (!rule) return reply(user, `❌ Код +${code} не существует.\n\nДоступные коды:\n${codesFor(user)}`);
  if (!rule.allowed(user)) return reply(user, `⛔ Код +${code} доступен только: ${rule.label}.`);
  return assign(user, number);
}

export const INTERACTIVE_BOTS = new Map([[NUMBERS_BOT_ID, handleNumbersBot]]);
