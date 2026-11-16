import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Eye, ChevronLeft, ChevronRight, Image, Type, Send, Pause, Play } from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload, mediaUrl } from '../api.js';
import { Avatar, Modal, useAction } from './common.jsx';
import { chatTime, timeHM } from '../util.js';

const BGS = [
  'linear-gradient(135deg,#ff2d3d,#5a0000)', 'linear-gradient(135deg,#000,#3a3a3a)', 'linear-gradient(135deg,#ff2bd6,#3b005a)',
  'linear-gradient(135deg,#1fb6ff,#001a5a)', 'linear-gradient(135deg,#f5b400,#7a2e00)', 'linear-gradient(135deg,#2ecc71,#003322)',
];
const STORY_MS = 6000;

export function StoryCreateModal() {
  const loadStories = useStore((s) => s.loadStories);
  const close = useStore((s) => s.closeModal);
  const [mode, setMode] = useState('media');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [text, setText] = useState('');
  const [bg, setBg] = useState(BGS[0]);
  const [run, busy] = useAction();
  const pick = (f) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const publish = () =>
    run(async () => {
      if (mode === 'text') {
        await api('/stories', { body: { media: text, mediaType: 'text', bg } });
      } else {
        const up = await upload(file);
        await api('/stories', { body: { media: up.url, mediaType: up.kind === 'video' ? 'video' : 'image', caption } });
      }
      await loadStories();
      close();
    }, 'История опубликована на 24 часа');
  return (
    <Modal title="Новая история" footer={<button className="btn block" disabled={busy || (mode === 'media' ? !file : !text.trim())} onClick={publish}>Опубликовать</button>}>
      <div className="tabs">
        <button className={mode === 'media' ? 'on' : ''} onClick={() => setMode('media')}><Image size={15} style={{ verticalAlign: -2 }} /> Фото / видео</button>
        <button className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}><Type size={15} style={{ verticalAlign: -2 }} /> Текст</button>
      </div>
      {mode === 'media' ? (
        <div className="col">
          <label className="center" style={{ aspectRatio: '9/16', maxHeight: 420, borderRadius: 16, background: 'var(--bg-2)', border: '2px dashed var(--border)', cursor: 'pointer', overflow: 'hidden', alignSelf: 'center', width: 'min(100%, 240px)' }}>
            {preview ? (file.type.startsWith('video') ? <video src={preview} autoPlay muted loop style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />) : <span className="muted col center"><Image size={36} />Выбрать файл</span>}
            <input type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files[0])} />
          </label>
          <input className="input" placeholder="Подпись" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} />
        </div>
      ) : (
        <div className="col">
          <div style={{ aspectRatio: '9/16', maxHeight: 420, borderRadius: 16, background: bg, alignSelf: 'center', width: 'min(100%, 240px)', overflow: 'hidden' }}>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ваш текст…" maxLength={300} style={{ width: '100%', height: '100%', background: 'transparent', border: 0, outline: 'none', color: '#fff', fontSize: '1.4em', fontWeight: 700, textAlign: 'center', padding: '40% 16px 16px', resize: 'none' }} />
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            {BGS.map((b) => <button key={b} onClick={() => setBg(b)} style={{ width: 30, height: 30, borderRadius: 15, background: b, boxShadow: bg === b ? '0 0 0 2px var(--bg), 0 0 0 4px var(--accent)' : 'none' }} />)}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Viewers({ storyId, onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => { api(`/stories/${storyId}/viewers`).then((r) => setList(r.viewers)); }, [storyId]);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '60%', background: 'var(--bg)', borderRadius: '16px 16px 0 0', zIndex: 5, overflowY: 'auto', padding: 10, color: 'var(--text)' }} onClick={(e) => e.stopPropagation()}>
      <div className="row" style={{ padding: '0 6px 8px' }}><b className="grow">Просмотры {list ? `(${list.length})` : ''}</b><button className="icon-btn" onClick={onClose}><X size={20} /></button></div>
      {list?.length === 0 && <div className="muted center small" style={{ padding: 16 }}>Пока никто не посмотрел</div>}
      {list?.map((v) => (
        <div key={v.user.id} className="list-item">
          <Avatar src={v.user.avatar} name={v.user.displayName} id={v.user.id} size={38} />
          <div className="grow"><div className="bold small">{v.user.displayName}</div><div className="tiny muted">{timeHM(v.viewedAt)}</div></div>
          {v.reaction && <span style={{ fontSize: '1.3em' }}>{v.reaction}</span>}
        </div>
      ))}
    </div>
  );
}

export function StoryViewer({ startUserId }) {
  const feed = useStore((s) => s.stories);
  const me = useStore((s) => s.me);
  const close = useStore((s) => s.closeModal);
  const loadStories = useStore((s) => s.loadStories);
  const toast = useStore((s) => s.toast);
  const [userIdx, setUserIdx] = useState(() => Math.max(0, feed.findIndex((f) => f.user.id === startUserId)));
  const [storyIdx, setStoryIdx] = useState(() => {
    const f = feed.find((x) => x.user.id === startUserId);
    const i = f?.stories.findIndex((s) => !s.viewed);
    return i > 0 ? i : 0;
  });
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [reply, setReply] = useState('');
  const videoRef = useRef();
  const group = feed[userIdx];
  const story = group?.stories[storyIdx];

  const next = () => {
    if (!group) return close();
    if (storyIdx < group.stories.length - 1) setStoryIdx(storyIdx + 1);
    else if (userIdx < feed.length - 1) { setUserIdx(userIdx + 1); setStoryIdx(0); }
    else { close(); loadStories(); }
  };
  const prev = () => {
    if (storyIdx > 0) setStoryIdx(storyIdx - 1);
    else if (userIdx > 0) { setUserIdx(userIdx - 1); setStoryIdx(feed[userIdx - 1].stories.length - 1); }
  };

  useEffect(() => {
    if (!story) return;
    setProgress(0);
    if (!story.viewed && group.user.id !== me.id) api(`/stories/${story.id}/view`, { body: {} }).catch(() => {});
  }, [story?.id]);

  useEffect(() => {
    if (!story || paused || showViewers || story.mediaType === 'video') return;
    const started = Date.now() - progress * STORY_MS;
    const t = setInterval(() => {
      const p = (Date.now() - started) / STORY_MS;
      if (p >= 1) { clearInterval(t); next(); } else setProgress(p);
    }, 50);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id, paused, showViewers]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!story) return null;
  const isMine = group.user.id === me.id;
  const del = async () => {
    if (!confirm('Удалить историю?')) return;
    await api.del(`/stories/${story.id}`);
    await loadStories();
    close();
  };
  const sendReply = async (textOrEmoji, isReaction) => {
    try {
      if (isReaction) await api(`/stories/${story.id}/view`, { body: { reaction: textOrEmoji } });
      const { chat } = await api('/chats/private', { body: { userId: group.user.id } });
      await api(`/chats/${chat.id}/messages`, { body: { text: `${isReaction ? textOrEmoji : `💬 ${textOrEmoji}`}\n↪ ответ на историю` } });
      setReply('');
      toast('Отправлено');
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="story-viewer" onClick={(e) => e.target === e.currentTarget && close()}>
      {userIdx > 0 && <button className="story-nav" style={{ left: 'calc(50% - min(50vw, 28dvh) - 60px)' }} onClick={prev}><ChevronLeft /></button>}
      <div className="story-frame">
        <div className="story-progress">
          {group.stories.map((s, i) => <div key={s.id}><i style={{ width: `${i < storyIdx ? 100 : i === storyIdx ? progress * 100 : 0}%` }} /></div>)}
        </div>
        <div className="story-top">
          <Avatar src={group.user.avatar} name={group.user.displayName} id={group.user.id} size={36} />
          <div className="grow"><div className="bold small">{isMine ? 'Моя история' : group.user.displayName}</div><div className="tiny" style={{ opacity: 0.75 }}>{chatTime(story.createdAt)}</div></div>
          <button className="icon-btn" onClick={() => setPaused(!paused)}>{paused ? <Play size={20} /> : <Pause size={20} />}</button>
          {isMine && <button className="icon-btn" onClick={del}><Trash2 size={20} /></button>}
          <button className="icon-btn" onClick={close}><X size={22} /></button>
        </div>
        {story.mediaType === 'text' ? (
          <div className="story-text-bg" style={{ background: story.bg || BGS[0] }}>{story.media}</div>
        ) : story.mediaType === 'video' ? (
          <video ref={videoRef} src={mediaUrl(story.media)} autoPlay playsInline onTimeUpdate={(e) => setProgress(e.target.currentTime / (e.target.duration || 1))} onEnded={next} />
        ) : (
          <img src={mediaUrl(story.media)} alt="" />
        )}
        <div className="story-tap left" onClick={prev} />
        <div className="story-tap right" onClick={next} />
        {story.caption && <div className="story-caption">{story.caption}</div>}
        <div className="story-bottom">
          {isMine ? (
            <button className="btn secondary sm" style={{ background: 'rgba(0,0,0,.4)', color: '#fff' }} onClick={() => setShowViewers(true)}><Eye size={16} /> {story.viewsCount ?? 0}</button>
          ) : (
            <>
              <input placeholder="Ответить…" value={reply} onChange={(e) => setReply(e.target.value)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} onKeyDown={(e) => e.key === 'Enter' && reply.trim() && sendReply(reply.trim())} />
              {reply.trim() ? <button className="icon-btn" style={{ color: '#fff' }} onClick={() => sendReply(reply.trim())}><Send size={22} /></button> : (
                ['❤️', '🔥', '😂'].map((e) => <button key={e} style={{ fontSize: '1.5em' }} onClick={() => sendReply(e, true)}>{e}</button>)
              )}
            </>
          )}
        </div>
        {showViewers && <Viewers storyId={story.id} onClose={() => setShowViewers(false)} />}
      </div>
      {userIdx < feed.length - 1 && <button className="story-nav" style={{ right: 'calc(50% - min(50vw, 28dvh) - 60px)' }} onClick={next}><ChevronRight /></button>}
    </div>
  );
}

