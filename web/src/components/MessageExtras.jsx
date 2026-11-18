import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { Check, Plus, X, Languages } from 'lucide-react';
import { api, mediaUrl } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Modal, useAction } from './common.jsx';

/* ===================== polls ===================== */

const plural = (n, [a, b, c]) => { const m10 = n % 10; const m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

/** Poll / quiz inside a bubble (Telegram-like): tap to vote, bars animate in, quiz shows right / wrong. */
export function Poll({ m, out }) {
  const p = m.media;
  const me = useStore((s) => s.me);
  const [pick, setPick] = useState([]);
  const [busy, setBusy] = useState(false);
  const voted = p.mine?.length > 0;
  const showResults = voted || p.closed;
  const vote = async (options) => {
    if (busy) return;
    setBusy(true);
    try { useStore.getState().patchMessage((await api(`/messages/${m.id}/vote`, { body: { options } })).message); setPick([]); } catch (e) { useStore.getState().toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const tap = (i) => {
    if (showResults && !(p.multiple && !p.closed)) return;
    if (p.multiple) setPick((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]));
    else vote([i]);
  };
  const kind = p.quiz ? 'Викторина' : p.anonymous ? 'Анонимный опрос' : 'Опрос';
  const max = Math.max(1, ...p.counts);
  return (
    <div className={`poll ${out ? 'out' : ''} ${showResults ? 'results' : ''}`}>
      <div className="poll-q">{p.question}</div>
      <div className="poll-kind">{kind}{p.multiple ? ' · несколько ответов' : ''}{p.closed ? ' · завершён' : ''}</div>
      <div className="poll-opts">
        {p.options.map((o, i) => {
          const pct = p.total ? Math.round((p.counts[i] / p.total) * 100) : 0;
          const mine = p.mine?.includes(i);
          const right = p.quiz && showResults && p.correct === i;
          const wrong = p.quiz && mine && p.correct !== i;
          return (
            <button key={i} className={`poll-opt ${mine ? 'mine' : ''} ${right ? 'right' : ''} ${wrong ? 'wrong' : ''} ${pick.includes(i) ? 'picked' : ''}`} onClick={() => tap(i)} disabled={busy}>
              {showResults ? <span className="poll-pct">{pct}%</span> : <span className={`poll-radio ${p.multiple ? 'sq' : ''}`}>{pick.includes(i) && <Check size={12} strokeWidth={3} />}</span>}
              <span className="poll-label">
                <span className="poll-text">{o}{(mine || right) && <Check size={14} strokeWidth={3} className="poll-check" />}</span>
                {showResults && <span className="poll-bar"><i style={{ width: `${(p.counts[i] / max) * 100}%` }} /></span>}
              </span>
              {showResults && !p.anonymous && p.voters?.[i]?.length > 0 && (
                <span className="poll-voters">{p.voters[i].map((u) => <Avatar key={u.id} src={u.avatar} name={u.displayName} id={u.id} size={18} />)}</span>
              )}
            </button>
          );
        })}
      </div>
      {p.quiz && showResults && p.explanation && <div className="poll-expl">💡 {p.explanation}</div>}
      <div className="poll-foot">
        {p.multiple && !p.closed && pick.length > 0 ? <button className="btn sm" onClick={() => vote(pick)} disabled={busy}>Голосовать</button>
          : <span>{p.total ? `${p.total} ${plural(p.total, ['голос', 'голоса', 'голосов'])}` : 'Пока никто не голосовал'}</span>}
        {voted && !p.quiz && !p.closed && <button className="poll-link" onClick={() => vote([])}>Отменить голос</button>}
        {m.sender?.id === me?.id && !p.closed && <button className="poll-link" onClick={async () => { if (confirm('Завершить опрос? Голосовать больше будет нельзя.')) useStore.getState().patchMessage((await api(`/messages/${m.id}/close-poll`, { body: {} })).message); }}>Завершить</button>}
      </div>
    </div>
  );
}

/** Create a poll or quiz. */
export function PollModal({ chatId, onClose }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [anonymous, setAnonymous] = useState(true);
  const [multiple, setMultiple] = useState(false);
  const [quiz, setQuiz] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [expl, setExpl] = useState('');
  const [run, busy] = useAction();
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  const ok = q.trim() && clean.length >= 2;
  const send = () => run(async () => {
    await useStore.getState().sendMessage(chatId, { text: q.trim(), media: { kind: 'poll', question: q.trim(), options: clean, anonymous, multiple: !quiz && multiple, quiz, correct: Math.min(correct, clean.length - 1), explanation: quiz ? expl : undefined } });
    onClose();
  });
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-head"><h3>{quiz ? 'Новая викторина' : 'Новый опрос'}</h3><button className="icon-btn" onClick={onClose}><X size={20} /></button></div>
        <div className="modal-body col" style={{ gap: 12 }}>
          <div className="field"><label>Вопрос</label><input className="input" autoFocus maxLength={255} value={q} onChange={(e) => setQ(e.target.value)} placeholder="О чём спросить?" /></div>
          <div className="field">
            <label>Варианты ответа {quiz && '— отметьте правильный'}</label>
            <div className="col" style={{ gap: 6 }}>
              {opts.map((o, i) => (
                <div key={i} className="row" style={{ gap: 6 }}>
                  {quiz && <button className={`poll-radio big ${correct === i ? 'on' : ''}`} onClick={() => setCorrect(i)} title="Правильный ответ">{correct === i && <Check size={13} strokeWidth={3} />}</button>}
                  <input className="input grow" maxLength={100} value={o} placeholder={`Вариант ${i + 1}`} onChange={(e) => setOpts(opts.map((x, k) => (k === i ? e.target.value : x)))}
                    onKeyDown={(e) => { if (e.key === 'Enter' && i === opts.length - 1 && opts.length < 10 && o.trim()) setOpts([...opts, '']); }} />
                  {opts.length > 2 && <button className="icon-btn" onClick={() => { setOpts(opts.filter((_, k) => k !== i)); if (correct >= i && correct > 0) setCorrect(correct - 1); }}><X size={16} /></button>}
                </div>
              ))}
              {opts.length < 10 && <button className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setOpts([...opts, ''])}><Plus size={15} /> Добавить вариант</button>}
            </div>
          </div>
          <label className="row poll-toggle"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> Анонимное голосование</label>
          {!quiz && <label className="row poll-toggle"><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /> Несколько ответов</label>}
          <label className="row poll-toggle"><input type="checkbox" checked={quiz} onChange={(e) => setQuiz(e.target.checked)} /> Викторина (один правильный ответ)</label>
          {quiz && <div className="field"><label>Пояснение (покажется после ответа)</label><input className="input" maxLength={200} value={expl} onChange={(e) => setExpl(e.target.value)} /></div>}
          <button className="btn block" disabled={!ok || busy} onClick={send}>Отправить</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== link previews ===================== */

const previewCache = new Map();
const firstUrl = (t) => String(t || '').match(/https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"»]/)?.[0];

export function LinkPreview({ text }) {
  const url = firstUrl(text);
  const [p, setP] = useState(() => (url ? previewCache.get(url) : null));
  useEffect(() => {
    if (!url || previewCache.has(url)) { setP(url ? previewCache.get(url) : null); return; }
    let alive = true;
    const req = api(`/link-preview?url=${encodeURIComponent(url)}`).then((r) => r.preview).catch(() => null);
    previewCache.set(url, req);
    req.then((v) => { previewCache.set(url, v); if (alive) setP(v); });
    return () => { alive = false; };
  }, [url]);
  if (!p || typeof p.then === 'function') return null;
  return (
    <a className="link-preview" href={p.url} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>
      <span className="lp-site">{p.site}</span>
      {p.title && <span className="lp-title">{p.title}</span>}
      {p.description && <span className="lp-desc">{p.description}</span>}
      {p.image && <img className="lp-img" src={mediaUrl(p.image)} alt="" loading="lazy" />}
    </a>
  );
}

/* ===================== translation ===================== */

export const useTranslations = create(() => ({}));
export async function translateMessage(m) {
  const cur = useTranslations.getState()[m.id];
  if (cur && cur !== 'loading') { useTranslations.setState({ [m.id]: undefined }); return; }
  useTranslations.setState({ [m.id]: 'loading' });
  try {
    const r = await api('/translate', { body: { text: m.text, to: /[а-яё]/i.test(m.text) && !/[a-z]{4}/i.test(m.text.replace(/https?:\/\/\S+/g, '')) ? 'en' : 'ru' } });
    useTranslations.setState({ [m.id]: r });
  } catch (e) {
    useTranslations.setState({ [m.id]: undefined });
    useStore.getState().toast(e.message, 'error');
  }
}
export function Translation({ id }) {
  const t = useTranslations((s) => s[id]);
  if (!t) return null;
  return (
    <div className="translation">
      <Languages size={13} /> {t === 'loading' ? 'Переводим…' : <span>{t.text}</span>}
    </div>
  );
}
