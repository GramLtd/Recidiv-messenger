import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RichText, stripFormatting, wrapSelection } from '../richtext.jsx';
import { StatusBadge } from './StatusModal.jsx';
import {
  ArrowLeft, Timer, Search, MoreVertical, Paperclip, Smile, Send, Mic, X, Reply, Copy, Pencil, Trash2, Forward, Check, CheckCheck,
  FileText, ChevronDown, Eye, Megaphone, Bell, BellOff, Gift, Square, ChevronLeft, Clock,
} from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload, mediaUrl } from '../api.js';
import { Avatar, Verified, Spark, WornGift, PremiumStar } from './common.jsx';
import { AudioMessage } from './Music.jsx';
import { audioDuration, titleFromFile } from '../player.js';
import { GiftArt } from './GiftArt.jsx';
import { colorFor, dayLabel, lastSeen, membersLabel, timeHM, fileSize } from '../util.js';
import { ChatWallpaper } from './ProfileExtras.jsx';
import { PostPreview } from './Feed.jsx';
import { MediaPanel, StickerView, GifView } from './MediaPanel.jsx';
import { useEdgeSwipe } from './Push.jsx';
import { playSend, playIncoming } from '../sound.js';

const QUICK_REACTIONS = ['❤️', '🔥', '👍', '😂', '😮', '😢', '💀', '🤡'];
const EMOJIS = '😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍🤩😘😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬😮‍💨🤥😌😔😪🤤😴😷🤒🤕🤢🤮🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾🙈🙉🙊💋💌💘💝💖💗💓💞💕💟❣️💔❤️‍🔥❤️🧡💛💚💙💜🤎🖤🤍💯💢💥💫💦💨🕳️💬💭💤👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏💪🦾🔥⭐🌟✨⚡🎉🎊🎁🏆👑💎🔪🗝️⛓️🚬🍾🥂🍻🎲🎯🎮'.match(/\p{Extended_Pictographic}(?:️)?(?:‍\p{Extended_Pictographic}(?:️)?)*/gu);

/** Telegram-style round video message: muted loop, tap for sound. */
function RoundVideo({ url }) {
  const [sound, setSound] = useState(false);
  return (
    <video className="round-video" src={mediaUrl(url)} autoPlay loop playsInline muted={!sound}
      onClick={(e) => { const v = e.currentTarget; if (!sound) v.currentTime = 0; setSound(!sound); }} />
  );
}

/** Width / height of a picked photo or video (for the album layout). */
function mediaSize(f) {
  return new Promise((res) => {
    const url = URL.createObjectURL(f);
    const done = (w, h) => { URL.revokeObjectURL(url); res(w && h ? { width: w, height: h } : {}); };
    if (f.type.startsWith('video/')) { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight); v.onerror = () => done(); v.src = url; }
    else { const i = new Image(); i.onload = () => done(i.naturalWidth, i.naturalHeight); i.onerror = () => done(); i.src = url; }
    setTimeout(() => done(), 4000);
  });
}

/** Rows for an album of n items, like Telegram: 2 · 1+2 · 2+2 · 2+3 · 3+3 · 3+4 · 2+3+3 · 3+3+3 · 3+3+4. */
export const albumRows = (n) => ({ 1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [3, 4], 8: [2, 3, 3], 9: [3, 3, 3], 10: [3, 3, 4] })[n] || [n];
function Album({ items, onOpen }) {
  const rows = albumRows(items.length);
  let k = 0;
  return (
    <div className="album">
      {rows.map((cnt, r) => (
        <div key={r} className="album-row" style={{ height: cnt === 1 ? 220 : cnt === 2 ? 150 : cnt === 3 ? 110 : 90 }}>
          {items.slice(k, (k += cnt)).map((it, i) => (
            <button key={i} className="album-cell" onClick={() => onOpen(it)}>
              {it.kind === 'video'
                ? <><video src={`${mediaUrl(it.url)}#t=0.1`} muted playsInline preload="metadata" /><span className="album-play">▶</span></>
                : <img src={mediaUrl(it.url)} alt="" loading="lazy" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function MessageContent({ m, chat, onOpenMedia }) {
  const openModal = useStore((s) => s.openModal);
  if (m.deleted) return <span className="deleted-text">Сообщение удалено</span>;
  const media = m.media;
  return (
    <>
      {m.type === 'image' && media && <img className="media-img" src={mediaUrl(media.url)} alt="" onClick={() => onOpenMedia(media)} loading="lazy" />}
      {m.type === 'album' && media?.items && <Album items={media.items} onOpen={onOpenMedia} />}
      {m.type === 'video' && media && (media.round
        ? <RoundVideo url={media.url} />
        : <video src={mediaUrl(media.url)} controls preload="metadata" playsInline />)}
      {m.type === 'voice' && media && <audio src={mediaUrl(media.url)} controls preload="metadata" />}
      {m.type === 'audio' && media && <AudioMessage media={media} />}
      {m.type === 'post' && media && <PostPreview media={media} />}
      {m.type === 'sticker' && media && <StickerView media={media} />}
      {m.type === 'gif' && media && <GifView media={media} />}
      {m.type === 'file' && media && (
        <a className="file-box" href={mediaUrl(media.url)} target="_blank" rel="noreferrer" download={media.name} style={{ color: 'inherit' }}>
          <span className="file-icon"><FileText size={22} /></span>
          <span className="grow">
            <div className="ellipsis bold">{media.name}</div>
            <div className="small muted">{fileSize(media.size || 0)}</div>
          </span>
        </a>
      )}
      {m.type === 'gift' && m.gift && (
        <div style={{ cursor: 'pointer', textAlign: 'center', minWidth: 200 }} onClick={() => openModal('giftDetails', { userGiftId: m.gift.id })}>
          <GiftArt userGift={m.gift} size={160} rounded={14} animated style={{ margin: '4px auto' }} />
          <div className="bold">{m.gift.collectible ? `${m.gift.gift.name} #${m.gift.collectible.number}` : m.gift.gift.name}</div>
          <div className="small muted">{m.gift.collectible ? 'Коллекционный подарок' : <>Подарок за <Spark amount={m.gift.gift.price} /></>}</div>
          <button className="btn sm outline" style={{ marginTop: 8 }}><Gift size={15} /> Посмотреть</button>
        </div>
      )}
      {m.type === 'transfer' && (
        <div style={{ textAlign: 'center', padding: '6px 10px' }}>
          <div style={{ fontSize: '2em' }}>💸</div>
          <div className="bold" style={{ fontSize: '1.2em' }}><Spark amount={media?.amount} /></div>
          <div className="small muted">Перевод</div>
        </div>
      )}
      {m.text && m.type !== 'gift' && <span><RichText text={m.text} plain={linkify} /></span>}
      {m.media?.buttons?.length > 0 && (
        <div className="bot-buttons">
          {m.media.buttons.map((b) => (
            <button key={b} onClick={() => useStore.getState().sendMessage(chat.id, { text: b }).catch((e) => useStore.getState().toast(e.message, 'error'))}>{b}</button>
          ))}
        </div>
      )}
      {m.type === 'gift' && m.text && <div style={{ marginTop: 6, fontStyle: 'italic' }}>«{m.text}»</div>}
    </>
  );
}

function linkify(text) {
  const parts = text.split(/(https?:\/\/[^\s]+|@[a-zA-Z][a-zA-Z0-9_]{2,31})/g);
  return parts.map((p, i) => {
    if (/^https?:\/\//.test(p)) return <a key={i} href={p} target="_blank" rel="noreferrer">{p}</a>;
    if (/^@/.test(p)) return <a key={i} href="#" onClick={(e) => { e.preventDefault(); resolveUsername(p.slice(1)); }}>{p}</a>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

async function resolveUsername(name) {
  const st = useStore.getState();
  try {
    const r = await api(`/resolve/${name}`);
    if (r.user) st.openModal('userProfile', { userId: r.user.id });
    else if (r.chat) { st.upsertChat(r.chat); st.openChat(r.chat.id); }
  } catch (e) {
    st.toast(e.message, 'error');
  }
}

function Message({ m, chat, me, grouped, groupedNext, onContext, onOpenMedia, highlight, onJump }) {
  const openModal = useStore((s) => s.openModal);
  const out = m.sender?.id === me.id && chat.type !== 'channel';
  // a message I just sent flies out of the composer (decided once, on mount)
  const [fresh] = useState(() => out && Date.now() - (window.__sentAt || 0) < 4000);
  if (m.type === 'system') return <div className="sys-msg">{m.text}</div>;
  const isChannel = chat.type === 'channel';
  const showSender = !out && !grouped && (chat.type === 'group');
  const showAvatar = chat.type === 'group' && !out && !groupedNext;
  const sticker = m.type === 'sticker' && !m.deleted;
  const mediaOnly = (m.type === 'image' || m.type === 'video' || m.type === 'gif' || m.type === 'album') && !m.text && !m.replyTo && !m.deleted;
  const roundVid = m.type === 'video' && m.media?.round && !m.deleted;
  const read = out && chat.peerReadId >= m.id;
  const react = (emoji) => api(`/messages/${m.id}/react`, { body: { emoji } }).then((r) => useStore.getState().patchMessage(r.message));
  return (
    <div
      className={`msg-row ${out ? 'out' : 'in'} ${grouped ? 'grouped' : ''} ${groupedNext ? 'grouped-next' : ''} ${isChannel ? 'channel-post' : ''} ${highlight ? 'highlight' : ''} ${fresh ? 'fresh' : ''}`}
      data-mid={m.id}
      onContextMenu={(e) => { e.preventDefault(); onContext(e, m); }}
      onDoubleClick={() => !m.deleted && react('❤️')}
    >
      {chat.type === 'group' && !out && (
        <div className="avatar-slot">
          {showAvatar && <Avatar src={m.sender?.avatar} name={m.sender?.displayName} id={m.sender?.id} size={34} onClick={() => openModal('userProfile', { userId: m.sender.id })} />}
        </div>
      )}
      <div className={`bubble ${mediaOnly && !roundVid ? 'media-only' : ''} ${sticker || roundVid ? 'sticker-bubble' : ''}`}>
        {isChannel && !grouped && <div className="sender" style={{ color: 'var(--accent)' }}>{chat.title}</div>}
        {showSender && m.sender && (
          <div className="sender" style={{ color: colorFor(m.sender.id) }} onClick={() => openModal('userProfile', { userId: m.sender.id })}>
            {m.sender.displayName} {m.sender.verified && <Verified size={13} />}
          </div>
        )}
        {m.forwardFrom && <div className="forwarded">Переслано от {m.forwardFrom.displayName}</div>}
        {m.replyTo && (
          <div className="reply-quote" onClick={() => onJump(m.replyTo.id)}>
            <b>{m.replyTo.senderName || 'Сообщение'}</b>
            <span>{stripFormatting(m.replyTo.text) || (m.replyTo.type !== 'text' ? 'Медиа' : '')}</span>
          </div>
        )}
        <MessageContent m={m} chat={chat} onOpenMedia={onOpenMedia} />
        <span className="meta">
          {m.edited && !m.deleted && 'изменено · '}
          {isChannel && <span className="views"><Eye size={13} /> {m.views}</span>}
          {timeHM(m.createdAt)}
          {out && chat.type !== 'saved' && (read ? <CheckCheck size={15} /> : <Check size={15} />)}
        </span>
        {m.reactions?.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button key={r.emoji} className={`reaction ${r.users.includes(me.id) ? 'mine' : ''}`} onClick={() => react(r.emoji)}>
                {r.emoji} {r.count}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageMenu({ m, x, y, chat, me, onClose, onReply, onEdit }) {
  const openModal = useStore((s) => s.openModal);
  const toast = useStore((s) => s.toast);
  const own = m.sender?.id === me.id;
  const canDelete = own || chat.role === 'owner' || chat.role === 'admin';
  const canReply = chat.type !== 'channel' || chat.role !== 'member';
  const react = (emoji) => {
    onClose();
    api(`/messages/${m.id}/react`, { body: { emoji } }).then((r) => useStore.getState().patchMessage(r.message));
  };
  const act = (fn) => () => { onClose(); fn(); };
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 59 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="ctx-menu" style={{ left: Math.max(8, Math.min(x, innerWidth - 320)), top: Math.max(8, Math.min(y, innerHeight - 330)) }}>
        {!m.deleted && chat.isMember && (
          <div className="react-strip">{QUICK_REACTIONS.map((e) => <button key={e} onClick={() => react(e)}>{e}</button>)}</div>
        )}
        {canReply && !m.deleted && <button className="menu-item" onClick={act(() => onReply(m))}><Reply size={18} /> Ответить</button>}
        {m.text && !m.deleted && <button className="menu-item" onClick={act(() => { navigator.clipboard?.writeText(m.text); toast('Скопировано'); })}><Copy size={18} /> Копировать</button>}
        {!m.deleted && m.type !== 'gift' && m.type !== 'transfer' && <button className="menu-item" onClick={act(() => openModal('forward', { messageId: m.id }))}><Forward size={18} /> Переслать</button>}
        {own && !m.deleted && ['text', 'image', 'video', 'file'].includes(m.type) && <button className="menu-item" onClick={act(() => onEdit(m))}><Pencil size={18} /> Изменить</button>}
        {canDelete && !m.deleted && (
          <button className="menu-item danger" onClick={act(() => confirm('Удалить сообщение для всех?') && api.del(`/messages/${m.id}`))}><Trash2 size={18} className="danger" /> Удалить</button>
        )}
      </div>
    </>
  );
}

/** Pick a time for a scheduled message: quick presets + date/time field. */
function ScheduleModal({ onClose, onPick }) {
  const pad = (n) => String(n).padStart(2, '0');
  const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const [val, setVal] = useState(() => local(new Date(Date.now() + 60 * 60 * 1000)));
  const [silent, setSilent] = useState(false);
  const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.getTime(); };
  const tonight = () => { const d = new Date(); d.setHours(20, 0, 0, 0); if (d.getTime() < Date.now() + 60_000) d.setDate(d.getDate() + 1); return d.getTime(); };
  const presets = [['Через час', Date.now() + 3600_000], ['Сегодня в 20:00', tonight()], ['Завтра в 9:00', tomorrow9()]];
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-head"><h3>Отложить сообщение</h3><button className="icon-btn" onClick={onClose}><X size={20} /></button></div>
        <div className="modal-body col" style={{ gap: 10 }}>
          {presets.map(([l, at]) => <button key={l} className="btn secondary block" onClick={() => onPick(at, silent)}>{l}</button>)}
          <div className="field"><label>Своё время</label><input className="input" type="datetime-local" value={val} min={local(new Date(Date.now() + 60_000))} onChange={(e) => setVal(e.target.value)} /></div>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} /> Без звука</label>
          <button className="btn block" onClick={() => { const at = new Date(val).getTime(); if (at > Date.now() + 30_000) onPick(at, silent); }}>Запланировать</button>
        </div>
      </div>
    </div>
  );
}

function Composer({ chat }) {
  const sendMessage = useStore((s) => s.sendMessage);
  const emitTyping = useStore((s) => s.emitTyping);
  const toast = useStore((s) => s.toast);
  const patchMessage = useStore((s) => s.patchMessage);
  const reply = useStore((s) => s.composerReply);
  const edit = useStore((s) => s.composerEdit);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [progress, setProgress] = useState(null);
  const [rec, setRec] = useState(null);
  const [fire, setFire] = useState(0);
  const taRef = useRef();
  const fileRef = useRef();
  const lastTyping = useRef(0);
  const drafts = useRef({});

  const setReply = (v) => useStore.setState({ composerReply: v, composerEdit: null });
  const setEdit = (v) => useStore.setState({ composerEdit: v, composerReply: null });

  useEffect(() => {
    setText(drafts.current[chat.id] || '');
    setEmoji(false);
    // desktop only: on phones focusing here pops the keyboard mid-slide and iOS pans the whole page sideways
    if (matchMedia('(pointer: fine)').matches) taRef.current?.focus({ preventScroll: true });
  }, [chat.id]);
  useEffect(() => {
    if (edit) { setText(edit.text || ''); taRef.current?.focus({ preventScroll: true }); }
  }, [edit]);
  useEffect(() => {
    if (reply) taRef.current?.focus({ preventScroll: true });
  }, [reply]);
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [text]);

  const onChange = (v) => {
    setText(v);
    drafts.current[chat.id] = v;
    if (Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now();
      emitTyping(chat.id);
    }
  };

  // send options (Telegram): silent / scheduled
  const [sendMenu, setSendMenu] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [scheduled, setScheduled] = useState([]);
  const [schedList, setSchedList] = useState(false);
  const loadScheduled = () => api(`/chats/${chat.id}/scheduled`).then((r) => setScheduled(r.scheduled || [])).catch(() => setScheduled([]));
  useEffect(() => { setScheduled([]); setSchedList(false); loadScheduled(); }, [chat.id]);
  const pressTimer = useRef(null);
  const sendPressStart = () => { clearTimeout(pressTimer.current); pressTimer.current = setTimeout(() => { pressTimer.current = 'fired'; setSendMenu(true); }, 450); };
  const sendPressEnd = () => { if (pressTimer.current === 'fired') { pressTimer.current = null; return true; } clearTimeout(pressTimer.current); pressTimer.current = null; return false; };
  const sendWith = async (opts) => {
    const t = text.trim();
    if (!t) return;
    try {
      if (opts.scheduleAt) {
        await api(`/chats/${chat.id}/messages`, { body: { text: t, replyTo: reply?.id, scheduleAt: opts.scheduleAt, silent: opts.silent } });
        toast(`Сообщение будет отправлено ${new Date(opts.scheduleAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
        loadScheduled();
      } else {
        window.__sentAt = Date.now();
        setFire((x) => x + 1);
        playSend();
        await sendMessage(chat.id, { text: t, replyTo: reply?.id, silent: opts.silent });
      }
      setReply(null);
      setText('');
      drafts.current[chat.id] = '';
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    try {
      if (edit) {
        const r = await api.patch(`/messages/${edit.id}`, { text: t });
        patchMessage(r.message);
        setEdit(null);
      } else {
        window.__sentAt = Date.now();
        setFire((x) => x + 1);
        playSend();
        await sendMessage(chat.id, { text: t, replyTo: reply?.id });
        setReply(null);
      }
      setText('');
      drafts.current[chat.id] = '';
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const sendMedia = async (media) => {
    setEmoji(false);
    try {
      window.__sentAt = Date.now();
      playSend();
      await sendMessage(chat.id, { media, replyTo: reply?.id });
      setReply(null);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const sendFiles = async (all) => {
    // photos & videos go out as Telegram-style albums (up to 10 per message), everything else one by one
    const visual = all.filter((f) => /^(image\/(?!svg)|video\/)/.test(f.type));
    let files = all.filter((f) => !visual.includes(f));
    if (visual.length === 1) files = [visual[0], ...files];
    else if (visual.length > 1) {
      for (let i = 0; i < visual.length; i += 10) {
        const chunk = visual.slice(i, i + 10);
        try {
          setProgress(0);
          const items = [];
          for (let k = 0; k < chunk.length; k++) {
            const m = await upload(chunk[k], (p) => setProgress((k + p) / chunk.length));
            items.push({ url: m.url, kind: m.kind, ...(await mediaSize(chunk[k])) });
          }
          window.__sentAt = Date.now();
          playSend();
          await sendMessage(chat.id, { media: { kind: 'album', items }, text: i === 0 ? text.trim() : '', replyTo: reply?.id });
          if (i === 0) { setText(''); drafts.current[chat.id] = ''; }
        } catch (e) {
          toast(e.message, 'error');
        }
      }
    }
    for (const f of files) {
      try {
        setProgress(0);
        const isMusic = (f.type.startsWith('audio/') || /\.(mp3|m4a|flac|ogg|wav)$/i.test(f.name)) && !/^voice-\d+\./.test(f.name);
        const duration = isMusic ? await audioDuration(f) : 0;
        const media = await upload(f, setProgress);
        if (isMusic) Object.assign(media, { kind: 'audio', duration, ...titleFromFile(f.name) });
        window.__sentAt = Date.now();
        playSend();
        await sendMessage(chat.id, { media, text: files.length === 1 && visual.length <= 1 ? text.trim() : '', replyTo: reply?.id });
        if (files.length === 1 && visual.length <= 1) { setText(''); drafts.current[chat.id] = ''; }
      } catch (e) {
        toast(e.message, 'error');
      }
    }
    setProgress(null);
    setReply(null);
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mr.cancelled) return;
        const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.${(mr.mimeType || '').includes('mp4') ? 'm4a' : 'webm'}`, { type: blob.type });
        await sendFiles([file]);
      };
      mr.start();
      setRec({ mr, started: Date.now() });
    } catch {
      toast('Нет доступа к микрофону', 'error');
    }
  };
  const stopRec = (cancel) => {
    if (!rec) return;
    rec.mr.cancelled = cancel;
    rec.mr.stop();
    setRec(null);
  };
  const [, force] = useState(0);
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [rec]);

  const quote = edit || reply;
  return (
    <div className="composer-wrap" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) sendFiles([...e.dataTransfer.files]); }}>
      {schedOpen && <ScheduleModal onClose={() => setSchedOpen(false)} onPick={(at, silent) => { setSchedOpen(false); sendWith({ scheduleAt: at, silent }); }} />}
      {scheduled.length > 0 && (
        <div className="sched-bar">
          <button className="sched-chip" onClick={() => setSchedList(!schedList)}><Clock size={14} /> Отложенные: {scheduled.length}</button>
          {schedList && (
            <div className="sched-list">
              {scheduled.map((x) => (
                <div key={x.id} className="sched-item">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="tiny muted">{new Date(x.sendAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{x.silent ? ' · без звука' : ''}</div>
                    <div className="ellipsis small">{stripFormatting(x.text) || 'Медиа'}</div>
                  </div>
                  <button className="icon-btn" title="Отправить сейчас" onClick={async () => { try { await api(`/scheduled/${x.id}/send-now`, { body: {} }); loadScheduled(); } catch (e) { toast(e.message, 'error'); } }}><Send size={16} /></button>
                  <button className="icon-btn" title="Удалить" onClick={async () => { await api.del(`/scheduled/${x.id}`); loadScheduled(); }}><X size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {emoji && (
        <MediaPanel emojis={EMOJIS} onEmoji={(e) => onChange(text + e)} onSend={sendMedia} onClose={() => setEmoji(false)} />
      )}
      <div className="composer-inner">
        <div className="composer">
          {quote && (
            <div className="composer-reply">
              {edit ? <Pencil size={20} className="accent" /> : <Reply size={20} className="accent" />}
              <div className="reply-quote">
                <b>{edit ? 'Редактирование' : `Ответ ${reply.sender?.displayName || ''}`}</b>
                <span>{quote.text || 'Медиа'}</span>
              </div>
              <button className="icon-btn" onClick={() => { if (edit) { setText(''); } setReply(null); setEdit(null); }}><X size={20} /></button>
            </div>
          )}
          {progress !== null && <div className="upload-progress" style={{ width: `${progress * 100}%` }} />}
          <div className="composer-row">
            {rec ? (
              <div className="row grow" style={{ padding: '0 14px', height: 48 }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: 'var(--accent)', animation: 'pulse 1s infinite' }} />
                <span>{Math.floor((Date.now() - rec.started) / 1000)} c</span>
                <span className="spacer" />
                <button className="btn ghost sm" onClick={() => stopRec(true)}>Отмена</button>
              </div>
            ) : (
              <>
                <button className="icon-btn" onClick={() => setEmoji(!emoji)}><Smile size={24} /></button>
                <textarea
                  ref={taRef}
                  rows={1}
                  placeholder={chat.type === 'channel' ? 'Опубликовать…' : 'Сообщение'}
                  value={text}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
                    if (e.key === 'Escape') { setReply(null); setEdit(null); }
                    // Telegram Desktop formatting shortcuts
                    const mod = e.ctrlKey || e.metaKey;
                    const k = e.key.toLowerCase();
                    const mark = mod && !e.altKey && (
                      !e.shiftKey && (k === 'b' || k === 'и') ? '**'
                        : !e.shiftKey && (k === 'i' || k === 'ш') ? '__'
                          : e.shiftKey && (k === 'x' || k === 'ч') ? '~~'
                            : e.shiftKey && (k === 'm' || k === 'ь') ? '`'
                              : e.shiftKey && (k === 'p' || k === 'з') ? '||' : null);
                    if (mark) {
                      e.preventDefault();
                      const r = wrapSelection(e.currentTarget, mark);
                      onChange(r.value);
                      const ta = e.currentTarget;
                      requestAnimationFrame(() => ta.setSelectionRange(r.start, r.end));
                    }
                    // ↑ in an empty composer edits your last message (Telegram / Discord)
                    if (e.key === 'ArrowUp' && !text && !edit && !mod) {
                      const list = useStore.getState().messages[chat.id] || [];
                      const meId = useStore.getState().me?.id;
                      const last = [...list].reverse().find((x) => x.sender?.id === meId && x.type === 'text' && !x.deleted);
                      if (last) { e.preventDefault(); setEdit(last); }
                    }
                  }}
                  onPaste={(e) => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); sendFiles(files); } }}
                />
                {!edit && <button className="icon-btn" onClick={() => fileRef.current.click()}><Paperclip size={22} /></button>}
                <input ref={fileRef} type="file" multiple hidden onChange={(e) => { sendFiles([...e.target.files]); e.target.value = ''; }} />
              </>
            )}
          </div>
        </div>
        {text.trim() || edit ? (
          <div className="send-wrap">
            <button key={`s${fire}`} className={`send-btn ${fire ? 'fire' : ''}`}
              onPointerDown={(e) => { e.preventDefault(); if (!edit) sendPressStart(); }}
              onPointerUp={() => { if (!edit) sendPressEnd(); }}
              onPointerLeave={() => { if (pressTimer.current !== 'fired') { clearTimeout(pressTimer.current); pressTimer.current = null; } }}
              onContextMenu={(e) => { e.preventDefault(); if (!edit) setSendMenu(true); }}
              onClick={() => { if (!sendMenu) submit(); }}>{edit ? <Check size={24} /> : <Send size={22} style={{ marginLeft: 2 }} />}</button>
            {sendMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setSendMenu(false)} />
                <div className="ctx-menu send-menu" style={{ '--origin': 'bottom right' }}>
                  <button className="menu-item" onClick={() => { setSendMenu(false); sendWith({ silent: true }); }}><BellOff size={18} /> Отправить без звука</button>
                  <button className="menu-item" onClick={() => { setSendMenu(false); setSchedOpen(true); }}><Clock size={18} /> Отложить…</button>
                </div>
              </>
            )}
          </div>
        ) : rec ? (
          <button className="send-btn recording" onClick={() => stopRec(false)}><Send size={22} /></button>
        ) : (
          <button className="send-btn" onClick={startRec} title="Голосовое сообщение"><Mic size={22} /></button>
        )}
      </div>
    </div>
  );
}

export default function ChatView() {
  const chatId = useStore((s) => s.activeChatId);
  const chat = useStore((s) => s.chats.find((c) => c.id === s.activeChatId));
  const messages = useStore((s) => s.messages[s.activeChatId]);
  const [timerMenu, setTimerMenu] = useState(false);
  const shown = useMemo(() => messages?.filter((m) => !m.deleted), [messages]);
  const hasMore = useStore((s) => s.hasMore[s.activeChatId]);
  const me = useStore((s) => s.me);
  const typing = useStore((s) => s.typing[s.activeChatId]);
  const openChat = useStore((s) => s.openChat);
  const loadMessages = useStore((s) => s.loadMessages);
  const setRightPanel = useStore((s) => s.setRightPanel);
  const rightPanel = useStore((s) => s.rightPanel);
  const upsertChat = useStore((s) => s.upsertChat);
  const openModal = useStore((s) => s.openModal);
  const [menu, setMenu] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [showDown, setShowDown] = useState(false);
  const [highlight, setHighlight] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState([]);
  const wallpaper = useStore((s) => s.me?.wallpaper);
  // phones: the chat slides out to the right (and can be swiped back from the left edge)
  const mainRef = useRef();
  // the composer floats over the messages (liquid glass on top of the chat); keep its height in --composer-h
  useEffect(() => {
    const main = mainRef.current;
    const wrap = main?.querySelector('.composer-wrap');
    if (!main || !wrap) { main?.style.setProperty('--composer-h', '0px'); return undefined; }
    const ro = new ResizeObserver(() => main.style.setProperty('--composer-h', `${wrap.offsetHeight}px`));
    ro.observe(wrap);
    return () => ro.disconnect();
  });
  const closeChat = () => {
    const app = document.querySelector('.app');
    if (!app || innerWidth > 768) return openChat(null);
    const pane = app.querySelector('.chat-pane');
    if (pane) { pane.style.transition = ''; pane.style.transform = ''; }
    app.classList.remove('chat-dragging');
    app.classList.add('chat-closing');
    setTimeout(() => { openChat(null); app.classList.remove('chat-closing'); }, 340);
  };
  useEdgeSwipe(mainRef, {
    enabled: !!chatId,
    onBack: closeChat,
    onProgress: (p, animate) => {
      const app = document.querySelector('.app');
      const pane = app?.querySelector('.chat-pane');
      if (!pane || innerWidth > 768) return;
      pane.style.transition = animate ? '' : 'none';
      pane.style.transform = p ? `translateX(${p * 100}%)` : '';
      app.style.setProperty('--chat', String(1 - p));
      app.classList.toggle('chat-dragging', !animate);
    },
  });
  const otherUnread = useStore((s) => s.chats.reduce((n, c) => n + (c.id !== s.activeChatId && !c.muted ? c.unread || 0 : 0), 0));
  const scrollRef = useRef();
  // soft sound for messages arriving in the open chat
  const lastSeenId = useRef(null);
  useEffect(() => {
    const last = messages?.[messages.length - 1];
    if (!last) return;
    const meId = useStore.getState().me?.id;
    if (lastSeenId.current && last.id > lastSeenId.current && last.sender?.id !== meId && !document.hidden && !chat?.muted && !last.silent) playIncoming();
    lastSeenId.current = last.id;
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lastSeenId.current = null; }, [chatId]);
  const loadingOlder = useRef(false);
  const prevHeight = useRef(0);
  const stick = useRef(true);

  useEffect(() => {
    stick.current = true;
    setSearchOpen(false);
    useStore.setState({ composerReply: null, composerEdit: null });
  }, [chatId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingOlder.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      loadingOlder.current = false;
    } else if (stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, chatId]);

  const onScroll = () => {
    const el = scrollRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = nearBottom;
    setShowDown(!nearBottom);
    if (el.scrollTop < 200 && hasMore && !loadingOlder.current && messages?.length) {
      loadingOlder.current = true;
      prevHeight.current = el.scrollHeight;
      loadMessages(chatId, messages[0].id).catch(() => (loadingOlder.current = false));
    }
  };

  useEffect(() => {
    if (!searchOpen || searchQ.trim().length < 2) return setSearchRes([]);
    const t = setTimeout(() => api(`/chats/${chatId}/search?q=${encodeURIComponent(searchQ)}`).then((r) => setSearchRes(r.messages)), 300);
    return () => clearTimeout(t);
  }, [searchQ, searchOpen, chatId]);

  const jumpTo = (id) => {
    const el = scrollRef.current?.querySelector(`[data-mid="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlight(id);
      setTimeout(() => setHighlight(null), 1500);
    } else useStore.getState().toast('Сообщение слишком далеко в истории');
  };

  if (!chatId || !chat) {
    return (
      <div className="chat-main">
        <div className="chat-bg-pattern" />
        <div className="empty-chat desk-empty">
          <img src="/icon.svg" alt="" width={96} height={96} />
          <b>Recidivist</b>
          <span>Выберите чат слева или начните новый — кнопка ✎ вверху списка чатов</span>
        </div>
      </div>
    );
  }

  const typers = typing ? Object.values(typing).filter((t) => t.until > Date.now()) : [];
  let status;
  if (typers.length) status = <span className="status typing">{chat.type === 'private' ? 'печатает…' : `${typers.map((t) => t.name.split(' ')[0]).join(', ')} печатает…`}</span>;
  else if (chat.type === 'private') status = <span className={`status ${chat.peer?.online ? 'online' : ''}`}>{lastSeen(chat.peer)}</span>;
  else if (chat.type === 'saved') status = null;
  else status = <span className="status">{membersLabel(chat)}</span>;

  const canPost = chat.isMember && (chat.type !== 'channel' || chat.role !== 'member') && !(chat.type === 'private' && chat.peer?.isBot && !chat.peer?.interactive);
  const join = async () => {
    const r = await api(`/chats/${chat.id}/join`, { body: {} });
    upsertChat(r.chat);
  };
  const toggleMute = async () => {
    const r = await api(`/chats/${chat.id}/settings`, { body: { muted: !chat.muted } });
    upsertChat(r.chat);
  };

  return (
    <div ref={mainRef} className={`chat-main ${wallpaper ? 'has-wp' : ''}`}>
      <ChatWallpaper wp={wallpaper} />
      <div className="chat-header tg-head">
        <button className="lg tg-back" onClick={closeChat} aria-label="Назад">
          <ChevronLeft size={24} />
          {otherUnread > 0 && <span className="tg-back-count">{otherUnread > 999 ? '999+' : otherUnread}</span>}
        </button>
        {searchOpen ? (
          <div className="lg tg-search">
            <Search size={17} />
            <input autoFocus placeholder="Поиск в чате" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            <button onClick={() => { setSearchOpen(false); setSearchQ(''); }} aria-label="Закрыть"><X size={18} /></button>
          </div>
        ) : (
          <button className="lg tg-title" onClick={() => setRightPanel(!rightPanel)}>
            <span className="tg-name">
              <span className="ellipsis">{chat.title}</span>
              {chat.peer?.verified && <Verified size={15} />}
              {chat.peer?.premium && <PremiumStar size={14} />}
              <StatusBadge user={chat.peer} size={15} />
              {chat.peer?.wornGift && <WornGift gift={chat.peer.wornGift} size={18} />}
              {chat.muted && <BellOff size={13} className="muted" />}
            </span>
            {status || <span className="status">{chat.type === 'saved' ? 'облако' : ''}</span>}
          </button>
        )}
        {!searchOpen && (chat.type === 'private' || chat.type === 'saved' || chat.role === 'owner' || chat.role === 'admin') && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button className={`lg tg-round ${chat.autoDelete ? 'on' : ''}`} onClick={() => setTimerMenu(!timerMenu)} aria-label="Автоудаление" title="Автоудаление сообщений" style={chat.autoDelete ? { color: 'var(--accent)' } : undefined}><Timer size={19} /></button>
            {timerMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setTimerMenu(false)} />
                <div className="ctx-menu" style={{ position: 'absolute', right: 0, top: 52, left: 'auto', zIndex: 10, minWidth: 220, '--origin': 'top right' }}>
                  <div className="small muted" style={{ padding: '6px 12px' }}>Автоудаление сообщений</div>
                  {[[0, 'Выключено'], [3600, '1 час'], [86400, '1 день'], [604800, '1 неделя'], [2592000, '1 месяц']].map(([v, l]) => (
                    <button key={v} className="menu-item" onClick={async () => { setTimerMenu(false); try { upsertChat((await api(`/chats/${chat.id}/auto-delete`, { body: { seconds: v } })).chat); } catch (e) { useStore.getState().toast(e.message, 'error'); } }}>
                      {l}{(chat.autoDelete || 0) === v && <Check size={16} className="accent" style={{ marginLeft: 'auto' }} />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {!searchOpen && <button className="lg tg-round" onClick={() => setSearchOpen(true)} aria-label="Поиск"><Search size={19} /></button>}
        <button className="tg-avatar" onClick={() => setRightPanel(!rightPanel)} aria-label="Профиль">
          <Avatar src={chat.avatar} name={chat.title} id={chat.peer?.id || chat.id} size={44} saved={chat.type === 'saved'} />
        </button>
      </div>

      {searchOpen && searchRes.length > 0 && (
        <div style={{ maxHeight: 240, overflowY: 'auto', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
          {searchRes.map((m) => (
            <div key={m.id} className="list-item" onClick={() => jumpTo(m.id)}>
              <div className="grow">
                <div className="small bold">{m.sender?.displayName}</div>
                <div className="small muted ellipsis">{m.text}</div>
              </div>
              <span className="tiny muted">{dayLabel(m.createdAt)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-bg-pattern" />
        <div className="messages-inner">
          {!messages && <div className="center" style={{ padding: 40 }}><div className="spinner" /></div>}
          {shown?.length === 0 && (
            <div className="empty-chat" style={{ paddingTop: 80 }}>
              <span className="pill">{chat.type === 'saved' ? 'Пересылайте сюда сообщения и сохраняйте файлы' : 'Сообщений пока нет — напишите первым!'}</span>
            </div>
          )}
          {shown?.map((m, i) => {
            const prev = shown[i - 1];
            const next = shown[i + 1];
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const same = (a, b) => a && b && a.type !== 'system' && b.type !== 'system' && a.sender?.id === b.sender?.id && Math.abs(b.createdAt - a.createdAt) < 5 * 60_000 && new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString();
            return (
              <Fragment key={m.id}>
                {newDay && <div className="day-sep">{dayLabel(m.createdAt)}</div>}
                <Message
                  m={m}
                  chat={chat}
                  me={me}
                  grouped={same(prev, m)}
                  groupedNext={same(m, next)}
                  highlight={highlight === m.id}
                  onJump={jumpTo}
                  onContext={(e, msg) => setMenu({ m: msg, x: e.clientX, y: e.clientY })}
                  onOpenMedia={setLightbox}
                />
              </Fragment>
            );
          })}
        </div>
      </div>
      {showDown && (
        <button className="scroll-down" onClick={() => { const el = scrollRef.current; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }}>
          <ChevronDown size={24} />
          {chat.unread > 0 && <span className="badge" style={{ position: 'absolute', top: -8 }}>{chat.unread}</span>}
        </button>
      )}

      {canPost ? (
        <Composer chat={chat} />
      ) : (
        <div className="channel-footer">
          {!chat.isMember ? (
            <button className="btn" style={{ minWidth: 220 }} onClick={join}>{chat.type === 'channel' ? <><Megaphone size={18} /> Подписаться</> : 'Вступить в группу'}</button>
          ) : chat.type === 'channel' ? (
            <button className="btn ghost" onClick={toggleMute}>{chat.muted ? <><Bell size={18} /> Включить уведомления</> : <><BellOff size={18} /> Отключить уведомления</>}</button>
          ) : (
            <span className="muted small">Этот аккаунт присылает только уведомления</span>
          )}
        </div>
      )}

      {menu && (
        <MessageMenu
          {...menu}
          chat={chat}
          me={me}
          onClose={() => setMenu(null)}
          onReply={(m) => useStore.setState({ composerReply: m, composerEdit: null })}
          onEdit={(m) => useStore.setState({ composerEdit: m, composerReply: null })}
        />
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {lightbox.kind === 'video' ? <video src={mediaUrl(lightbox.url)} autoPlay controls playsInline onClick={(e) => e.stopPropagation()} /> : <img src={mediaUrl(lightbox.url)} alt="" />}
        </div>
      )}
    </div>
  );
}
