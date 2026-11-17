import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Repeat2, Send, Eye, MoreHorizontal, ImagePlus, X, Trash2, Link2, Hash, Share2 } from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload, mediaUrl, PUBLIC_ORIGIN } from '../api.js';
import { Avatar, Modal, Spinner, Verified, PremiumStar, StyledName, useAction } from './common.jsx';
import { useT } from '../i18n.js';
import { fmtNum } from '../util.js';

// ---------------- helpers ----------------
function ago(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} с`;
  if (s < 3600) return `${Math.floor(s / 60)} мин`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} д`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

/** Text with clickable #tags and @mentions. */
export function RichText({ text, onTag }) {
  const parts = String(text || '').split(/([#@][\p{L}\p{N}_]{2,40})/gu);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('#') && p.length > 2) return <button key={i} className="post-tag" onClick={(e) => { e.stopPropagation(); onTag?.(p.slice(1).toLowerCase()); }}>{p}</button>;
        if (p.startsWith('@') && p.length > 2) return <a key={i} className="post-tag" href={`/@${p.slice(1)}`} onClick={(e) => e.stopPropagation()}>{p}</a>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// batch "seen" reports for view counters
const seen = new Set();
let queue = [];
let timer = null;
function reportView(id) {
  if (seen.has(id)) return;
  seen.add(id);
  queue.push(id);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const ids = queue;
    queue = [];
    api('/posts/views', { body: { ids } }).catch(() => {});
  }, 1500);
}

// ---------------- post card ----------------
export function PostCard({ post, onChange, onRemove, onTag, index = 0, embedded }) {
  const t = useT();
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const toast = useStore((s) => s.toast);
  const ref = useRef();
  const [menu, setMenu] = useState(false);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (embedded || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { reportView(post.id); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [post.id, embedded]);

  if (post.deleted) return <div className="post deleted muted small">Пост удалён</div>;
  const like = async (e) => {
    e?.stopPropagation();
    if (!post.liked) { setPop(true); setTimeout(() => setPop(false), 600); }
    onChange?.({ ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) });
    try { onChange?.((await api(`/posts/${post.id}/like`, { body: {} })).post); } catch (er) { toast(er.message, 'error'); }
  };
  const repost = async () => {
    setMenu(false);
    try {
      await api('/posts', { body: { repostOf: post.repost?.id || post.id } });
      toast('Репост опубликован');
      onChange?.({ ...post, reposts: post.reposts + 1 });
    } catch (er) { toast(er.message, 'error'); }
  };
  const remove = async () => {
    setMenu(false);
    if (!confirm('Удалить пост?')) return;
    await api.del(`/posts/${post.id}`);
    onRemove?.(post);
  };
  const a = post.author;
  const openProfile = (e) => { e.stopPropagation(); openModal('userProfile', { userId: a.id }); };
  const body = post.repost && !post.text && !post.media.length ? post.repost : post;
  const isPureRepost = body !== post;

  return (
    <article ref={ref} className={`post ${embedded ? 'embedded' : ''}`} style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }} onClick={() => !embedded && openModal('post', { postId: post.id, initial: post, onChange, onRemove })}>
      {isPureRepost && <div className="post-repost-label"><Repeat2 size={14} /> {a.displayName} — репост</div>}
      <div className="post-head">
        <span onClick={openProfile}><Avatar src={body.author.avatar} name={body.author.displayName} id={body.author.id} size={42} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 4, minWidth: 0 }}>
            <b className="row" style={{ gap: 4, minWidth: 0 }} onClick={openProfile}><StyledName user={body.author} />{body.author.verified && <Verified size={14} />}{body.author.premium && <PremiumStar size={14} />}</b>
            <span className="muted small ellipsis">{body.author.username ? `@${body.author.username} · ` : ''}{ago(body.createdAt)}</span>
          </div>
        </div>
        {!embedded && (
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn" onClick={() => setMenu(!menu)}><MoreHorizontal size={18} /></button>
            {menu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setMenu(false)} />
                <div className="ctx-menu" style={{ position: 'absolute', right: 0, top: 40, left: 'auto', zIndex: 10, '--origin': 'top right' }}>
                  <button className="menu-item" onClick={() => { setMenu(false); navigator.clipboard?.writeText(`${PUBLIC_ORIGIN}/post/${post.id}`); toast('Ссылка скопирована'); }}><Link2 size={18} /> {t('Скопировать ссылку')}</button>
                  <button className="menu-item" onClick={repost}><Repeat2 size={18} /> {t('Репост')}</button>
                  <button className="menu-item" onClick={() => { setMenu(false); openModal('sharePost', { post }); }}><Share2 size={18} /> {t('Поделиться')}</button>
                  {(post.mine || me.isAdmin) && <button className="menu-item danger" onClick={remove}><Trash2 size={18} className="danger" /> {t('Удалить')}</button>}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {body.text && <div className="post-text selectable"><RichText text={body.text} onTag={onTag} /></div>}
      {body.media?.length > 0 && (
        <div className={`post-media n${Math.min(body.media.length, 4)}`}>
          {body.media.map((m, i) => (m.kind === 'video'
            ? <video key={i} src={mediaUrl(m.url)} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} />
            : <img key={i} src={mediaUrl(m.url)} alt="" loading="lazy" onClick={(e) => { e.stopPropagation(); openModal('lightbox', { url: m.url }); }} />))}
        </div>
      )}
      {!isPureRepost && post.repost && <div className="post-quote"><PostCard post={post.repost} embedded onTag={onTag} /></div>}
      {!embedded && (
        <div className="post-actions" onClick={(e) => e.stopPropagation()}>
          <button className={`pa like ${post.liked ? 'on' : ''} ${pop ? 'pop' : ''}`} onClick={like}><Heart size={20} fill={post.liked ? 'currentColor' : 'none'} />{post.likes > 0 && <span>{fmtNum(post.likes)}</span>}</button>
          <button className="pa" onClick={() => openModal('post', { postId: post.id, initial: post, onChange, onRemove, focus: true })}><MessageCircle size={20} />{post.comments > 0 && <span>{fmtNum(post.comments)}</span>}</button>
          <button className="pa" onClick={repost}><Repeat2 size={20} />{post.reposts > 0 && <span>{fmtNum(post.reposts)}</span>}</button>
          <button className="pa" onClick={() => openModal('sharePost', { post })}><Send size={19} /></button>
          <span className="spacer" />
          <span className="pa muted"><Eye size={18} /><span>{fmtNum(post.views)}</span></span>
        </div>
      )}
    </article>
  );
}

// ---------------- list with paging ----------------
export function PostList({ source, onTag, header, emptyText }) {
  const t = useT();
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (before) => {
    setLoading(true);
    try {
      const sep = source.includes('?') ? '&' : '?';
      const r = await api(`${source}${before ? `${sep}before=${before}` : ''}`);
      setPosts((p) => (before ? [...(p || []), ...r.posts] : r.posts));
      setMore(r.hasMore);
    } finally {
      setLoading(false);
    }
  }, [source]);
  useEffect(() => { setPosts(null); load(); }, [load]);
  useEffect(() => {
    const h = (e) => { if (e.detail) setPosts((p) => [e.detail, ...(p || [])]); };
    window.addEventListener('post:new', h);
    return () => window.removeEventListener('post:new', h);
  }, []);
  const sentinel = useRef();
  useEffect(() => {
    if (!sentinel.current || !more) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !loading && posts?.length) load(posts[posts.length - 1].createdAt); }, { rootMargin: '400px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [more, loading, posts, load]);
  const change = (np) => setPosts((p) => p.map((x) => (x.id === np.id ? np : x)));
  const remove = (op) => setPosts((p) => p.filter((x) => x.id !== op.id));
  return (
    <div className="post-list">
      {header}
      {!posts ? <div className="center" style={{ padding: 30 }}><Spinner /></div>
        : !posts.length ? <div className="muted center small" style={{ padding: 40 }}>{emptyText || t('Постов пока нет')}</div>
          : posts.map((p, i) => (p.kind === 'channel' ? <ChannelCard key={p.id} item={p} index={i} onTag={onTag} /> : <PostCard key={p.id} post={p} index={i} onChange={change} onRemove={remove} onTag={onTag} />))}
      {more && <div ref={sentinel} className="center" style={{ padding: 20 }}>{loading && <Spinner size={22} />}</div>}
    </div>
  );
}

// ---------------- composer ----------------
export function Composer({ autoOpen, onDone }) {
  const t = useT();
  const me = useStore((s) => s.me);
  const toast = useStore((s) => s.toast);
  const [text, setText] = useState('');
  const [media, setMedia] = useState([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!!autoOpen);
  const pick = async (files) => {
    for (const f of [...files].slice(0, 4 - media.length)) {
      if (!/^(image|video)\//.test(f.type)) continue;
      try {
        const m = await upload(f);
        setMedia((x) => [...x, { url: m.url, kind: m.kind }].slice(0, 4));
      } catch (e) { toast(e.message, 'error'); }
    }
  };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api('/posts', { body: { text, media } });
      window.dispatchEvent(new CustomEvent('post:new', { detail: r.post }));
      setText(''); setMedia([]); setOpen(!!autoOpen);
      onDone?.(r.post);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <div className={`post-composer ${open ? 'open' : ''}`}>
      <Avatar src={me.avatar} name={me.displayName} id={me.id} size={40} />
      <div className="grow">
        <textarea autoFocus={autoOpen} placeholder={t('Что нового?')} value={text} onFocus={() => setOpen(true)} onChange={(e) => setText(e.target.value)} maxLength={2000} rows={open ? 3 : 1} />
        {media.length > 0 && (
          <div className="composer-media">
            {media.map((m, i) => (
              <div key={i} className="cm-item">
                {m.kind === 'video' ? <video src={mediaUrl(m.url)} muted /> : <img src={mediaUrl(m.url)} alt="" />}
                <button onClick={() => setMedia(media.filter((_, k) => k !== i))}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
        {open && (
          <div className="row" style={{ marginTop: 8 }}>
            <label className="icon-btn" title="Фото / видео"><ImagePlus size={20} /><input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ''; }} /></label>
            <span className="tiny muted">{text.length}/2000</span>
            <span className="spacer" />
            <button className="btn sm" disabled={busy || (!text.trim() && !media.length)} onClick={submit}>{t('Опубликовать')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- page ----------------
export function FeedPage() {
  const t = useT();
  const [tab, setTab] = useState('all');
  const [tag, setTag] = useState(null);
  const [tags, setTags] = useState(null);
  useEffect(() => { if (tab === 'tags' && !tags) api('/tags/trending').then((r) => setTags(r.tags)).catch(() => setTags([])); }, [tab, tags]);
  const openTag = (tg) => { setTab('tags'); setTag(tg); };
  const idx = ['all', 'following', 'tags'].indexOf(tab);
  return (
    <div className="page feed-page">
      <div className="feed-head">
        <div className="seg">
          <span className="seg-ind" style={{ transform: `translateX(${idx * 100}%)` }} />
          {[['all', t('Лента')], ['following', t('Подписки')], ['tags', t('Теги')]].map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => { setTab(k); if (k !== 'tags') setTag(null); }}>{l}</button>
          ))}
        </div>
      </div>
      <div className="page-body feed-body" key={`${tab}:${tag || ''}`}>
        {tab === 'tags' && !tag ? (
          <div className="tags-cloud">
            <div className="section-title">{t('Популярные теги')}</div>
            {!tags ? <div className="center" style={{ padding: 20 }}><Spinner /></div> : !tags.length ? <div className="muted small center" style={{ padding: 30 }}>Тегов пока нет — добавьте #тег в пост</div> : (
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {tags.map((x, i) => <button key={x.tag} className="chip" style={{ animation: `popIn .4s ${i * 0.03}s both` }} onClick={() => setTag(x.tag)}><Hash size={14} />{x.tag}<span className="muted tiny">{x.count}</span></button>)}
              </div>
            )}
          </div>
        ) : (
          <PostList
            source={tab === 'following' ? '/feed?tab=following' : tag ? `/feed?tab=tag&tag=${encodeURIComponent(tag)}` : '/feed'}
            onTag={openTag}
            header={tag ? <div className="row tag-head"><Hash size={20} className="accent" /><b className="grow">{tag}</b><button className="btn sm secondary" onClick={() => setTag(null)}>Все теги</button></div> : <Composer />}
            emptyText={tab === 'following' ? 'Подпишитесь на людей — их посты появятся здесь' : undefined}
          />
        )}
      </div>
    </div>
  );
}

// ---------------- modals ----------------
export function PostModal({ postId, initial, onChange, onRemove, focus }) {
  const t = useT();
  const close = useStore((s) => s.closeModal);
  const toast = useStore((s) => s.toast);
  const [post, setPost] = useState(initial || null);
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  useEffect(() => {
    api(`/posts/${postId}`).then((r) => setPost(r.post)).catch((e) => { toast(e.message, 'error'); close(); });
    api(`/posts/${postId}/comments`).then((r) => setComments(r.comments)).catch(() => setComments([]));
  }, [postId]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (p) => { setPost(p); onChange?.(p); };
  const send = () => run(async () => {
    const r = await api(`/posts/${postId}/comments`, { body: { text } });
    setComments((c) => [...(c || []), r.comment]);
    setText('');
    change({ ...post, comments: post.comments + 1 });
  });
  const delComment = (c) => run(async () => {
    await api.del(`/comments/${c.id}`);
    setComments((x) => x.filter((y) => y.id !== c.id));
    change({ ...post, comments: Math.max(0, post.comments - 1) });
  });
  return (
    <Modal title={t('Комментарии')} footer={
      <div className="row" style={{ width: '100%' }}>
        <input className="input grow" autoFocus={focus} placeholder={t('Написать комментарий…')} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && send()} />
        <button className="send-btn" style={{ width: 46, height: 46 }} disabled={busy || !text.trim()} onClick={send}><Send size={20} /></button>
      </div>
    }>
      {post ? <PostCard post={post} onChange={change} onRemove={(p) => { onRemove?.(p); close(); }} /> : <Spinner />}
      <div className="comments">
        {!comments ? <div className="center" style={{ padding: 20 }}><Spinner size={22} /></div> : !comments.length ? <div className="muted small center" style={{ padding: 20 }}>Комментариев пока нет</div> : comments.map((c, i) => (
          <div key={c.id} className="comment" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <Avatar src={c.author.avatar} name={c.author.displayName} id={c.author.id} size={32} />
            <div className="grow">
              <div className="row" style={{ gap: 4 }}><b className="small row" style={{ gap: 4 }}><StyledName user={c.author} />{c.author.premium && <PremiumStar size={12} />}</b><span className="tiny muted">{ago(c.createdAt)}</span></div>
              <div className="selectable" style={{ whiteSpace: 'pre-wrap' }}><RichText text={c.text} /></div>
            </div>
            {(c.mine || post?.mine) && <button className="icon-btn" onClick={() => delComment(c)}><Trash2 size={16} /></button>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function SharePostModal({ post }) {
  const chats = useStore((s) => s.chats);
  const close = useStore((s) => s.closeModal);
  const [run] = useAction();
  const share = (c) => run(async () => { await api(`/posts/${post.id}/share`, { body: { chatId: c.id } }); close(); }, `Отправлено в «${c.title}»`);
  return (
    <Modal title="Отправить в чат">
      {chats.filter((c) => c.type !== 'channel' || c.role !== 'member').map((c) => (
        <div key={c.id} className="list-item" onClick={() => share(c)}>
          <Avatar src={c.avatar} name={c.title} id={c.peer?.id || c.id} size={42} saved={c.type === 'saved'} />
          <div className="grow bold ellipsis">{c.title}</div>
          <Send size={18} className="accent" />
        </div>
      ))}
    </Modal>
  );
}

export function LightboxModal({ url }) {
  const close = useStore((s) => s.closeModal);
  return <div className="lightbox" onClick={close}><img src={mediaUrl(url)} alt="" /></div>;
}

/** A shared post inside a chat message. */
export function PostPreview({ media }) {
  const openModal = useStore((s) => s.openModal);
  return (
    <div className="post-preview" onClick={() => openModal('post', { postId: media.postId })}>
      {media.image && <img src={mediaUrl(media.image)} alt="" />}
      <div>
        <b>📰 {media.author || 'Пост'}</b>
        <span>{media.text || 'Открыть пост'}</span>
      </div>
    </div>
  );
}

/** A message from a public channel in the feed: tap → open the channel. */
function ChannelCard({ item, index, onTag }) {
  const openChat = useStore((s) => s.openChat);
  const upsertChat = useStore((s) => s.upsertChat);
  const setTab = useStore((s) => s.setTab);
  const openModal = useStore((s) => s.openModal);
  const c = item.chat;
  const open = () => { upsertChat(c); setTab('chats'); openChat(c.id); };
  return (
    <article className="post channel-post-card" style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }} onClick={open}>
      <div className="post-head">
        <Avatar src={c.avatar} name={c.title} id={c.id} size={42} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6, minWidth: 0 }}>
            <b className="ellipsis">{c.title}</b>
            <span className="chan-tag">канал</span>
          </div>
          <div className="muted small ellipsis">{c.username ? `@${c.username} · ` : ''}{ago(item.createdAt)}</div>
        </div>
      </div>
      {item.text && <div className="post-text selectable"><RichText text={item.text} onTag={onTag} /></div>}
      {item.media?.length > 0 && (
        <div className="post-media n1">
          {item.media.map((m, i) => (m.kind === 'video'
            ? <video key={i} src={mediaUrl(m.url)} controls playsInline preload="metadata" onClick={(e) => e.stopPropagation()} />
            : <img key={i} src={mediaUrl(m.url)} alt="" loading="lazy" onClick={(e) => { e.stopPropagation(); openModal('lightbox', { url: m.url }); }} />))}
        </div>
      )}
      <div className="post-actions">
        <button className="pa chan-open" onClick={(e) => { e.stopPropagation(); open(); }}>Открыть канал</button>
        <span className="spacer" />
        <span className="pa muted"><Eye size={18} /><span>{fmtNum(item.views || 0)}</span></span>
      </div>
    </article>
  );
}

export function CreatePostModal() {
  const close = useStore((s) => s.closeModal);
  const setTab = useStore((s) => s.setTab);
  return (
    <Modal title="Новый пост">
      <Composer autoOpen onDone={() => { close(); setTab('feed'); useStore.getState().toast('Пост опубликован'); }} />
      <div className="tiny muted" style={{ marginTop: 10 }}>Добавьте #теги — по ним пост найдут во вкладке «Теги».</div>
    </Modal>
  );
}
