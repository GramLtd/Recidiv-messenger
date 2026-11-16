import { useState } from 'react';
import { X, AtSign, Info, Link2, MessageCircle, Gift, Send, Pin, Bell, BellOff, LogOut, UserPlus, Pencil, Shield, Trash2, Copy, Camera, Users } from 'lucide-react';
import { useStore } from '../store.js';
import { api, upload } from '../api.js';
import { Avatar, Verified, Modal, useAsync, Spinner, useAction, WornGift } from './common.jsx';
import { GiftArt } from './GiftArt.jsx';
import { lastSeen, membersLabel } from '../util.js';

export function GiftTile({ ug, onClick, index = 0 }) {
  const col = ug.collectible;
  return (
    <div className={`gift-card ${col ? 'is-col' : ''}`} onClick={onClick} style={{ animationDelay: `${Math.min(index, 20) * 30}ms`, opacity: ug.hidden ? 0.45 : undefined }}>
      {col ? (
        <GiftArt userGift={ug} size="100%" height="100%" rounded={0} style={{ position: 'absolute', inset: 0 }} />
      ) : (
        <div className="gift-card-art"><GiftArt userGift={ug} size="78%" height="78%" /></div>
      )}
      {ug.pinned && <span className="gift-pin"><Pin size={12} /></span>}
      {ug.listing && <span className="gift-sale">продаётся</span>}
      <div className="gift-card-name ellipsis">{col ? `${ug.gift.name} #${col.number}` : ug.gift.name}</div>
    </div>
  );
}

export function GiftsGrid({ userId, onlyCollectible }) {
  const openModal = useStore((s) => s.openModal);
  const { data, loading } = useAsync(() => api(`/users/${userId}/gifts`), [userId]);
  if (loading) return <div className="center" style={{ padding: 20 }}><Spinner /></div>;
  const gifts = (data?.gifts || []).filter((g) => !onlyCollectible || g.collectible);
  if (!gifts.length) return <div className="muted center small" style={{ padding: 30, flexDirection: 'column', gap: 6 }}><Gift size={34} className="accent" />{onlyCollectible ? 'Нет коллекционных подарков' : 'Подарков пока нет'}</div>;
  return (
    <div className="gift-cards">
      {gifts.map((ug, i) => <GiftTile key={ug.id} ug={ug} index={i} onClick={() => openModal('giftDetails', { userGiftId: ug.id })} />)}
    </div>
  );
}

export function UserProfileBody({ userId, compact }) {
  const me = useStore((s) => s.me);
  const openPrivate = useStore((s) => s.openPrivate);
  const openModal = useStore((s) => s.openModal);
  const { data, loading } = useAsync(() => api(`/users/${userId}`), [userId]);
  const [tab, setTab] = useState('info');
  if (loading || !data) return <div className="center" style={{ padding: 40 }}><Spinner /></div>;
  const u = data.user;
  const isMe = u.id === me.id;
  return (
    <>
      <div className="profile-hero">
        <Avatar src={u.avatar} name={u.displayName} id={u.id} size={compact ? 100 : 110} />
        <h2>{u.displayName}{u.verified && <Verified size={20} />}{u.wornGift ? <WornGift gift={u.wornGift} size={26} /> : u.emojiStatus && <span>{u.emojiStatus}</span>}</h2>
        <div className={u.online ? 'accent small' : 'muted small'}>{isMe ? 'это вы' : lastSeen(u)}</div>
      </div>
      {!isMe && !u.isBot && (
        <div className="action-grid">
          <button onClick={() => openPrivate(u.id)}><MessageCircle size={22} />Сообщение</button>
          <button onClick={() => openModal('giftShop', { toUser: u })}><Gift size={22} />Подарок</button>
          <button onClick={() => openModal('transfer', { toUser: u })}><Send size={22} />Перевод</button>
        </div>
      )}
      <div className="tabs" style={{ margin: '0 16px 8px' }}>
        <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>Инфо</button>
        <button className={tab === 'gifts' ? 'on' : ''} onClick={() => setTab('gifts')}>Подарки {data.user.giftsCount ? `(${data.user.giftsCount})` : ''}</button>
      </div>
      {tab === 'info' ? (
        <>
          {u.username && (
            <div className="info-row">
              <AtSign size={22} />
              <div className="grow">
                <div>@{u.username}</div>
                {u.otherUsernames?.length > 0 && <div className="small muted">также {u.otherUsernames.map((n) => `@${n}`).join(', ')}</div>}
                <div className="label">Имя пользователя</div>
              </div>
            </div>
          )}
          {u.bio && (
            <div className="info-row"><Info size={22} /><div className="grow"><div style={{ whiteSpace: 'pre-wrap' }}>{u.bio}</div><div className="label">О себе</div></div></div>
          )}
          {u.isAdmin && <div className="info-row"><Shield size={22} /><div className="grow"><div>Администратор Recidivist</div></div></div>}
        </>
      ) : (
        <div style={{ padding: '4px 12px 16px' }}><GiftsGrid userId={u.id} /></div>
      )}
    </>
  );
}

export function UserProfileModal({ userId }) {
  return (
    <Modal title="Профиль">
      <div style={{ margin: '0 -18px' }}><UserProfileBody userId={userId} /></div>
    </Modal>
  );
}

function GroupInfo({ chat }) {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const removeChat = useStore((s) => s.removeChat);
  const upsertChat = useStore((s) => s.upsertChat);
  const toast = useStore((s) => s.toast);
  const isAdmin = chat.role === 'owner' || chat.role === 'admin';
  const members = useAsync(() => api(`/chats/${chat.id}/members`), [chat.id, chat.memberCount]);
  const link = chat.username ? `${location.origin}/@${chat.username}` : chat.inviteCode ? `${location.origin}/join/${chat.inviteCode}` : null;
  const leave = async () => {
    if (!confirm(chat.type === 'channel' ? 'Покинуть канал?' : 'Покинуть группу?')) return;
    await api(`/chats/${chat.id}/leave`, { body: {} });
    removeChat(chat.id);
  };
  const mute = async () => upsertChat((await api(`/chats/${chat.id}/settings`, { body: { muted: !chat.muted } })).chat);
  const kick = async (u) => {
    if (!confirm(`Исключить ${u.displayName}?`)) return;
    await api.del(`/chats/${chat.id}/members/${u.id}`);
    members.reload();
  };
  const setRole = async (u, role) => {
    await api(`/chats/${chat.id}/members/${u.id}/role`, { body: { role } });
    members.reload();
  };
  return (
    <>
      <div className="profile-hero">
        <Avatar src={chat.avatar} name={chat.title} id={chat.id} size={110} />
        <h2>{chat.title}</h2>
        <div className="muted small">{membersLabel(chat)}</div>
      </div>
      <div className="action-grid">
        <button onClick={mute}>{chat.muted ? <Bell size={22} /> : <BellOff size={22} />}{chat.muted ? 'Вкл. звук' : 'Без звука'}</button>
        {isAdmin && <button onClick={() => openModal('editChat', { chat })}><Pencil size={22} />Изменить</button>}
        {isAdmin && <button onClick={() => openModal('newChat', { type: 'addMembers', chat })}><UserPlus size={22} />Добавить</button>}
        {chat.isMember && <button onClick={leave} style={{ color: '#ff4d4f' }}><LogOut size={22} />Покинуть</button>}
      </div>
      {chat.description && <div className="info-row"><Info size={22} /><div className="grow"><div style={{ whiteSpace: 'pre-wrap' }}>{chat.description}</div><div className="label">Описание</div></div></div>}
      {link && (
        <div className="info-row" style={{ cursor: 'pointer' }} onClick={() => { navigator.clipboard?.writeText(link); toast('Ссылка скопирована'); }}>
          <Link2 size={22} />
          <div className="grow"><div className="ellipsis">{chat.username ? `@${chat.username}` : link}</div><div className="label">{chat.username ? 'Публичная ссылка' : 'Пригласительная ссылка'}</div></div>
          <Copy size={18} />
        </div>
      )}
      {members.data?.members?.length > 0 && (
        <>
          <div className="section-title row" style={{ paddingLeft: 16 }}><Users size={16} /> {chat.type === 'channel' ? 'Подписчики' : 'Участники'}</div>
          <div style={{ padding: '0 6px 16px' }}>
            {members.data.members.map((u) => (
              <div key={u.id} className="list-item" onClick={() => u.id !== me.id && openModal('userProfile', { userId: u.id })}>
                <Avatar src={u.avatar} name={u.displayName} id={u.id} size={42} online={u.online} />
                <div className="grow">
                  <div className="row" style={{ gap: 4 }}><span className="ellipsis bold">{u.displayName}</span>{u.verified && <Verified size={14} />}</div>
                  <div className={`small ${u.online ? 'accent' : 'muted'}`}>{lastSeen(u)}</div>
                </div>
                {u.role !== 'member' && <span className="small accent">{u.role === 'owner' ? 'владелец' : 'админ'}</span>}
                {chat.role === 'owner' && u.role !== 'owner' && (
                  <button className="icon-btn" title={u.role === 'admin' ? 'Снять админа' : 'Сделать админом'} onClick={(e) => { e.stopPropagation(); setRole(u, u.role === 'admin' ? 'member' : 'admin'); }}><Shield size={17} /></button>
                )}
                {isAdmin && u.role === 'member' && u.id !== me.id && (
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); kick(u); }}><Trash2 size={17} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function RightPanel() {
  const chat = useStore((s) => s.chats.find((c) => c.id === s.activeChatId));
  const setRightPanel = useStore((s) => s.setRightPanel);
  if (!chat) return null;
  return (
    <aside className="right-panel">
      <div className="chat-header" style={{ borderBottom: 0 }}>
        <button className="icon-btn" onClick={() => setRightPanel(false)}><X size={22} /></button>
        <div className="bold">{chat.type === 'private' ? 'Информация' : chat.type === 'channel' ? 'Канал' : chat.type === 'saved' ? 'Избранное' : 'Группа'}</div>
      </div>
      {chat.type === 'private' && chat.peer ? <UserProfileBody userId={chat.peer.id} compact /> : chat.type === 'saved' ? (
        <div className="muted center" style={{ padding: 30, textAlign: 'center' }}>Ваше личное облачное хранилище: пересылайте сюда сообщения и файлы.</div>
      ) : <GroupInfo chat={chat} />}
    </aside>
  );
}

export function EditChatModal({ chat }) {
  const upsertChat = useStore((s) => s.upsertChat);
  const close = useStore((s) => s.closeModal);
  const [title, setTitle] = useState(chat.title);
  const [description, setDescription] = useState(chat.description || '');
  const [username, setUsername] = useState(chat.username || '');
  const [avatar, setAvatar] = useState(chat.avatar);
  const [run, busy] = useAction();
  const pick = async (e) => {
    const f = e.target.files[0];
    if (f) setAvatar((await upload(f)).url);
  };
  const save = () => run(async () => {
    const r = await api.patch(`/chats/${chat.id}`, { title, description, avatar, username });
    upsertChat(r.chat);
    close();
  }, 'Сохранено');
  return (
    <Modal title={chat.type === 'channel' ? 'Редактировать канал' : 'Редактировать группу'} footer={<button className="btn" disabled={busy} onClick={save}>Сохранить</button>}>
      <div className="col" style={{ gap: 14 }}>
        <label className="center" style={{ cursor: 'pointer', position: 'relative', alignSelf: 'center' }}>
          <Avatar src={avatar} name={title} id={chat.id} size={96} />
          <span className="story-add" style={{ width: 30, height: 30 }}><Camera size={15} /></span>
          <input type="file" accept="image/*" hidden onChange={pick} />
        </label>
        <div className="field"><label>Название</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label>Описание</label><textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="field">
          <label>Публичная ссылка (@username)</label>
          <input className="input" value={username} placeholder="пусто — приватный" onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} />
          <span className="hint">Публичные {chat.type === 'channel' ? 'каналы' : 'группы'} можно найти в поиске.</span>
        </div>
      </div>
    </Modal>
  );
}
