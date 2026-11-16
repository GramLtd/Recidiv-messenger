import { useEffect, useState } from 'react';
import { Check, Search, Camera } from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload } from '../api.js';
import { Avatar, Modal, Verified, useAction, Spark } from './common.jsx';
import { lastSeen } from '../util.js';

/** People the user already talks to + global search. */
function usePeoplePicker(q) {
  const chats = useStore((s) => s.chats);
  const [found, setFound] = useState([]);
  const known = chats.filter((c) => c.type === 'private' && c.peer && !c.peer.isBot).map((c) => c.peer);
  useEffect(() => {
    if (q.trim().length < 2) return setFound([]);
    const t = setTimeout(() => api(`/users/search?q=${encodeURIComponent(q)}`).then((r) => setFound(r.users)), 250);
    return () => clearTimeout(t);
  }, [q]);
  const ql = q.trim().toLowerCase();
  const list = ql ? [...known.filter((u) => u.displayName.toLowerCase().includes(ql)), ...found] : known;
  const me = useStore.getState().me;
  const seen = new Set();
  return list.filter((u) => u.id !== me.id && !u.isBot && !seen.has(u.id) && seen.add(u.id));
}

export function UserPicker({ selected, onToggle, single }) {
  const [q, setQ] = useState('');
  const people = usePeoplePicker(q);
  return (
    <>
      <div className="search-box" style={{ marginBottom: 8 }}>
        <Search size={18} />
        <input placeholder="Поиск по имени или @username" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {people.length === 0 && <div className="muted center small" style={{ padding: 20 }}>{q ? 'Никого не нашли' : 'Начните вводить имя'}</div>}
      {people.map((u) => {
        const on = selected?.some((x) => x.id === u.id);
        return (
          <div key={u.id} className={`list-item ${on ? 'selected' : ''}`} onClick={() => onToggle(u)}>
            <Avatar src={u.avatar} name={u.displayName} id={u.id} size={44} online={u.online} />
            <div className="grow">
              <div className="row" style={{ gap: 4 }}><span className="bold ellipsis">{u.displayName}</span>{u.verified && <Verified size={14} />}</div>
              <div className="small muted">{u.username ? `@${u.username}` : lastSeen(u)}</div>
            </div>
            {!single && <span className={`check ${on ? 'on' : ''}`}>{on && <Check size={14} />}</span>}
          </div>
        );
      })}
    </>
  );
}

export function NewChatModal({ type, chat }) {
  const openPrivate = useStore((s) => s.openPrivate);
  const upsertChat = useStore((s) => s.upsertChat);
  const openChat = useStore((s) => s.openChat);
  const closeAll = useStore((s) => s.closeAllModals);
  const [step, setStep] = useState(type === 'channel' ? 'details' : 'members');
  const [selected, setSelected] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [run, busy] = useAction();
  const toggle = (u) => setSelected((s) => (s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]));

  if (type === 'private') {
    return (
      <Modal title="Новое сообщение">
        <UserPicker single onToggle={(u) => openPrivate(u.id)} />
      </Modal>
    );
  }

  if (type === 'addMembers') {
    return (
      <Modal title="Добавить участников" footer={<button className="btn" disabled={!selected.length || busy} onClick={() => run(async () => { const r = await api(`/chats/${chat.id}/members`, { body: { userIds: selected.map((u) => u.id) } }); upsertChat(r.chat); closeAll(); }, 'Участники добавлены')}>Добавить ({selected.length})</button>}>
        <UserPicker selected={selected} onToggle={toggle} />
      </Modal>
    );
  }

  const create = () =>
    run(async () => {
      const r = await api(`/chats/${type}`, { body: { title, description, username: username || undefined, avatar, memberIds: selected.map((u) => u.id) } });
      upsertChat(r.chat);
      closeAll();
      openChat(r.chat.id);
    });

  if (step === 'members') {
    return (
      <Modal title="Новая группа" footer={<button className="btn" onClick={() => setStep('details')}>Далее {selected.length ? `(${selected.length})` : ''}</button>}>
        {selected.length > 0 && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {selected.map((u) => <span key={u.id} className="chip on" onClick={() => toggle(u)}>{u.displayName} ✕</span>)}
          </div>
        )}
        <UserPicker selected={selected} onToggle={toggle} />
      </Modal>
    );
  }

  return (
    <Modal
      title={type === 'channel' ? 'Новый канал' : 'Новая группа'}
      back={type === 'group' ? () => setStep('members') : undefined}
      footer={<button className="btn" disabled={!title.trim() || busy} onClick={create}>Создать</button>}
    >
      <div className="col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14 }}>
          <label style={{ cursor: 'pointer', position: 'relative' }}>
            <Avatar src={avatar} name={title || '?'} id={7} size={72} />
            <span className="story-add" style={{ width: 26, height: 26 }}><Camera size={13} /></span>
            <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files[0] && setAvatar((await upload(e.target.files[0])).url)} />
          </label>
          <div className="field grow"><input className="input" placeholder={type === 'channel' ? 'Название канала' : 'Название группы'} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>
        </div>
        <div className="field"><label>Описание</label><textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Необязательно" /></div>
        <div className="field">
          <label>Публичная ссылка</label>
          <input className="input" placeholder="username (пусто — приватный)" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
          <span className="hint">{type === 'channel' ? 'Подписчики смогут найти канал через поиск.' : 'Публичную группу можно найти через поиск.'}</span>
        </div>
      </div>
    </Modal>
  );
}

export function ForwardModal({ messageId }) {
  const chats = useStore((s) => s.chats);
  const closeAll = useStore((s) => s.closeAllModals);
  const openChat = useStore((s) => s.openChat);
  const [q, setQ] = useState('');
  const [run] = useAction();
  const list = chats.filter((c) => (c.type !== 'channel' || c.role !== 'member') && !(c.peer?.isBot) && c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Переслать">
      <div className="search-box" style={{ marginBottom: 8 }}><Search size={18} /><input placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
      {list.map((c) => (
        <div key={c.id} className="list-item" onClick={() => run(async () => { await api(`/messages/${messageId}/forward`, { body: { chatId: c.id } }); closeAll(); openChat(c.id); }, 'Переслано')}>
          <Avatar src={c.avatar} name={c.title} id={c.peer?.id || c.id} size={44} saved={c.type === 'saved'} />
          <div className="bold ellipsis grow">{c.title}</div>
        </div>
      ))}
    </Modal>
  );
}

export function TransferModal({ toUser }) {
  const me = useStore((s) => s.me);
  const close = useStore((s) => s.closeModal);
  const currency = useStore((s) => s.currency);
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [run, busy] = useAction();
  const send = () => run(async () => { await api('/wallet/transfer', { body: { toUserId: toUser.id, amount: Number(amount), comment } }); close(); }, 'Перевод отправлен');
  return (
    <Modal title={`Перевод ${currency.name}`} footer={<button className="btn block" disabled={busy || !(Number(amount) > 0)} onClick={send}>Отправить {amount ? <Spark amount={amount} /> : ''}</button>}>
      <div className="col" style={{ alignItems: 'center', gap: 12 }}>
        <Avatar src={toUser.avatar} name={toUser.displayName} id={toUser.id} size={72} />
        <div className="bold">{toUser.displayName}</div>
        <input className="input" style={{ textAlign: 'center', fontSize: '1.6em', fontWeight: 700, height: 64 }} inputMode="numeric" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} autoFocus />
        <div className="small muted">Ваш баланс: <Spark amount={me.balance} /></div>
        <input className="input" placeholder="Комментарий (необязательно)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={140} />
      </div>
    </Modal>
  );
}
