import { useState } from 'react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Modal, useAction } from './common.jsx';

const PRESETS = [
  ['🎧', 'Слушаю музыку'], ['💼', 'На работе'], ['📚', 'Учусь'], ['🎮', 'Играю'], ['🌙', 'Сплю'], ['✈️', 'В отъезде'],
  ['🏋️', 'В зале'], ['🍿', 'Смотрю кино'], ['🔕', 'Не беспокоить'], ['🤒', 'Болею'], ['🎉', 'Праздную'], ['💎', 'Торгую на маркете'],
];
const EMOJIS = ['😎', '🔥', '❤️', '✦', '⭐', '💤', '☕', '🎵', '🚀', '👑', '🍀', '💸', '🧠', '🎯', '😈', '🫡'];
const DURATIONS = [['1 час', 3600_000], ['4 часа', 4 * 3600_000], ['До конца дня', 'today'], ['Неделя', 7 * 86400_000], ['Без срока', 0]];

/** Emoji status with text and expiry — shown next to your name everywhere («🎧 слушаю музыку · до 18:00»). */
export function StatusModal() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const close = useStore((s) => s.closeModal);
  const [emoji, setEmoji] = useState(me.emojiStatus || '🎧');
  const [text, setText] = useState(me.statusText || '');
  const [dur, setDur] = useState(4 * 3600_000);
  const [run, busy] = useAction();
  const untilOf = (d) => {
    if (d === 'today') { const t = new Date(); t.setHours(23, 59, 0, 0); return t.getTime(); }
    return d ? Date.now() + d : null;
  };
  const save = (e = emoji, t = text, d = dur) => run(async () => {
    const r = await api('/me/status', { body: { emoji: e, text: t, until: untilOf(d) } });
    setMe(r.user);
    close();
  }, 'Статус обновлён');
  const clear = () => run(async () => { setMe((await api('/me/status', { body: { emoji: null } })).user); close(); }, 'Статус убран');
  return (
    <Modal title="Статус" footer={<div className="row" style={{ gap: 8 }}>{me.emojiStatus && <button className="btn secondary" onClick={clear} disabled={busy}>Убрать</button>}<button className="btn grow" disabled={busy || !emoji} onClick={() => save()}>Сохранить</button></div>}>
      <div className="status-preview"><span className="status-emoji-big">{emoji}</span><input className="input" maxLength={70} placeholder="Что у вас сейчас? (необязательно)" value={text} onChange={(e) => setText(e.target.value)} /></div>
      <div className="status-emojis">{EMOJIS.map((e) => <button key={e} className={e === emoji ? 'on' : ''} onClick={() => setEmoji(e)}>{e}</button>)}</div>
      <div className="section-title">Быстрый выбор</div>
      <div className="status-presets">
        {PRESETS.map(([e, t]) => <button key={t} className="chip" onClick={() => { setEmoji(e); setText(t); }}>{e} {t}</button>)}
      </div>
      <div className="section-title">Сколько показывать</div>
      <div className="status-presets">{DURATIONS.map(([l, d]) => <button key={l} className={`chip ${dur === d ? 'on' : ''}`} onClick={() => setDur(d)}>{l}</button>)}</div>
    </Modal>
  );
}

export function StatusBadge({ user, size = 18, onClick }) {
  if (!user?.emojiStatus) return null;
  const until = user.statusUntil ? ` · до ${new Date(user.statusUntil).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : '';
  return <span className="emoji-status" style={{ fontSize: size }} title={`${user.statusText || ''}${until}`} onClick={onClick}>{user.emojiStatus}</span>;
}
