import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../store.js';
import { Avatar } from './common.jsx';
import { stripFormatting } from '../richtext.jsx';

/*
 * Discord-style quick switcher (Ctrl/⌘+K) + Telegram Desktop chat navigation (Alt+↑ / Alt+↓, Ctrl+Tab).
 */
export function QuickSwitcher() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inputRef = useRef();
  const chats = useStore((s) => s.chats);

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && (k === 'k' || k === 'л')) { e.preventDefault(); setOpen((v) => !v); setQ(''); setI(0); return; }
      if ((e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) || (e.ctrlKey && e.key === 'Tab')) {
        e.preventDefault();
        const st = useStore.getState();
        const list = st.chats;
        if (!list.length) return;
        const cur = list.findIndex((c) => c.id === st.activeChatId);
        const down = e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey);
        const next = cur < 0 ? 0 : (cur + (down ? 1 : -1) + list.length) % list.length;
        st.openChat(list[next].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);

  const results = useMemo(() => {
    const ql = q.trim().toLowerCase().replace(/^@/, '');
    const list = ql ? chats.filter((c) => c.title?.toLowerCase().includes(ql) || c.peer?.username?.toLowerCase().includes(ql) || c.username?.toLowerCase().includes(ql)) : chats;
    return list.slice(0, 9);
  }, [q, chats]);

  if (!open) return null;
  const go = (c) => { if (!c) return; useStore.getState().openChat(c.id); setOpen(false); };
  return (
    <div className="qs-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="qs" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Быстрый переход">
        <div className="qs-input">
          <Search size={18} />
          <input ref={inputRef} value={q} placeholder="Куда перейти? Имя чата или @username" onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(results.length - 1, x + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
              if (e.key === 'Enter') { e.preventDefault(); go(results[i]); }
              if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
              if (/^[1-9]$/.test(e.key) && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(results[Number(e.key) - 1]); }
            }} />
          <kbd>Esc</kbd>
        </div>
        <div className="qs-list">
          {results.map((c, k) => (
            <button key={c.id} className={`qs-item ${k === i ? 'on' : ''}`} onMouseEnter={() => setI(k)} onClick={() => go(c)} style={{ animationDelay: `${k * 18}ms` }}>
              <Avatar src={c.avatar} name={c.title} id={c.peer?.id || c.id} size={34} saved={c.type === 'saved'} />
              <span className="grow ellipsis"><b>{c.title}</b><small className="muted ellipsis">{c.lastMessage ? stripFormatting(c.lastMessage.text) : ''}</small></span>
              {c.unread > 0 && <span className="qs-badge">{c.unread}</span>}
              <kbd>{(navigator.platform || '').includes('Mac') ? '⌘' : 'Ctrl'}{k + 1}</kbd>
            </button>
          ))}
          {!results.length && <div className="muted center small" style={{ padding: 18 }}>Ничего не нашли</div>}
        </div>
        <div className="qs-foot muted">↑↓ — выбрать · Enter — открыть · Alt+↑/↓ — соседний чат</div>
      </div>
    </div>
  );
}
