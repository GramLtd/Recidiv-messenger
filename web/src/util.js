export const AVATAR_COLORS = ['#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5', '#00897b', '#43a047', '#f4511e', '#6d4c41'];

export const colorFor = (id) => AVATAR_COLORS[Math.abs(Number(id) || 0) % AVATAR_COLORS.length];

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || '').join('').toUpperCase() || '?';

const pad = (n) => String(n).padStart(2, '0');
export const timeHM = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function chatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return timeHM(ts);
  const diff = (now - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function lastSeen(user) {
  if (!user) return '';
  if (user.isBot) return 'официальный аккаунт';
  if (user.online) return 'в сети';
  if (!user.lastSeen) return 'был(а) давно';
  const diff = Date.now() - user.lastSeen;
  if (diff < 60_000) return 'был(а) только что';
  if (diff < 3600_000) return `был(а) ${Math.floor(diff / 60_000)} мин. назад`;
  const d = new Date(user.lastSeen);
  if (d.toDateString() === new Date().toDateString()) return `был(а) в ${timeHM(user.lastSeen)}`;
  return `был(а) ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`;
}

export const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

export const membersLabel = (chat) =>
  chat.type === 'channel'
    ? `${chat.memberCount} ${plural(chat.memberCount, ['подписчик', 'подписчика', 'подписчиков'])}`
    : `${chat.memberCount} ${plural(chat.memberCount, ['участник', 'участника', 'участников'])}`;

export const fmtNum = (n) => Number(n || 0).toLocaleString('ru-RU');

export const fileSize = (b) => (b < 1024 ? `${b} Б` : b < 1048576 ? `${(b / 1024).toFixed(1)} КБ` : `${(b / 1048576).toFixed(1)} МБ`);

export const rarityLabel = (permille, total) => `${(Math.round((permille / total) * 1000) / 10).toString()}%`;
