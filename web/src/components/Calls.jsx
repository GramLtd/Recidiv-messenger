import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, MonitorUp, Minimize2, Maximize2, Headphones, LogOut } from 'lucide-react';
import { useStore, getSocket, onSocket } from '../store.js';
import { Avatar } from './common.jsx';

/*
 * Calls (WebRTC). The server only relays signalling; audio/video go peer-to-peer (or via the TURN relay when the
 * admin configured one). 1:1 calls in private chats + voice rooms in groups (mesh, up to 8).
 */

const emit = (ev, data) => new Promise((res) => { const s = getSocket(); if (!s) return res({ error: 'Нет соединения' }); s.emit(ev, data, (r) => res(r || {})); });

/* ---------- ringtone (generated, no files) ---------- */
let ringCtx = null; let ringTimer = null;
function ring(kind) {
  stopRing();
  try {
    ringCtx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => {
      const t = ringCtx.currentTime;
      [0, 0.25].forEach((d, i) => {
        const o = ringCtx.createOscillator(); const g = ringCtx.createGain();
        o.frequency.value = kind === 'in' ? (i ? 660 : 880) : 440;
        g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.12, t + d + 0.02); g.gain.linearRampToValueAtTime(0, t + d + 0.22);
        o.connect(g).connect(ringCtx.destination); o.start(t + d); o.stop(t + d + 0.25);
      });
    };
    beep(); ringTimer = setInterval(beep, kind === 'in' ? 1600 : 3000);
  } catch {}
}
function stopRing() { clearInterval(ringTimer); ringTimer = null; try { ringCtx?.close(); } catch {} ringCtx = null; }

/* ---------- 1:1 call state ---------- */
export const useCall = create(() => ({ call: null, local: null, remote: null, muted: false, camOff: false, sharing: false, mini: false, error: null }));
let pc = null; let pendingIce = []; let pendingOffer = null; let camTrack = null; let screenStream = null;

async function getMedia(video) {
  try { return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { width: 1280, height: 720 } : false }); } catch {
    if (video) return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    throw new Error('Нет доступа к микрофону');
  }
}

function makePc(ice, callId) {
  const relayOnly = (() => { try { return localStorage.getItem('calls.relayOnly') === '1'; } catch { return false; } })();
  const p = new RTCPeerConnection({ iceServers: ice.iceServers, iceTransportPolicy: relayOnly && ice.hasRelay ? 'relay' : 'all' });
  p.onicecandidate = (e) => e.candidate && getSocket()?.emit('call:signal', { callId, data: { ice: e.candidate } });
  p.ontrack = (e) => {
    const cur = useCall.getState().remote || new MediaStream();
    if (!cur.getTracks().includes(e.track)) cur.addTrack(e.track);
    useCall.setState({ remote: cur });
    e.track.onunmute = () => useCall.setState({ remote: new MediaStream(cur.getTracks()) });
  };
  p.onconnectionstatechange = () => {
    const st = p.connectionState;
    const c = useCall.getState().call;
    if (st === 'connected' && c) { stopRing(); useCall.setState({ call: { ...c, status: 'active', startedAt: c.startedAt || Date.now() } }); }
    if (st === 'failed' && c) { useCall.setState({ error: 'Не удалось соединиться (сеть блокирует прямое соединение)' }); hangup(); }
  };
  return p;
}

async function attachLocal(p, video) {
  const local = await getMedia(video);
  local.getAudioTracks().forEach((t) => p.addTrack(t, local));
  camTrack = local.getVideoTracks()[0] || null;
  // always keep a video sender so the camera / screen can be switched on later without renegotiation;
  // the answering side reuses the video transceiver created by the offer
  let vt = p.getTransceivers().find((t) => t.receiver.track?.kind === 'video' && !t.sender.track);
  if (vt) vt.direction = 'sendrecv'; else vt = p.addTransceiver('video', { direction: 'sendrecv' });
  if (camTrack) await vt.sender.replaceTrack(camTrack);
  useCall.setState({ local, camOff: !camTrack });
  return local;
}

function cleanup() {
  stopRing();
  try { pc?.close(); } catch {}
  pc = null; pendingIce = []; pendingOffer = null;
  const { local } = useCall.getState();
  local?.getTracks().forEach((t) => t.stop());
  screenStream?.getTracks().forEach((t) => t.stop());
  screenStream = null; camTrack = null;
  useCall.setState({ call: null, local: null, remote: null, muted: false, camOff: false, sharing: false, mini: false });
}

export async function startCall(chat, video) {
  if (useCall.getState().call) return;
  const peer = chat.peer;
  useCall.setState({ call: { chatId: chat.id, peer, video, dir: 'out', status: 'calling' }, error: null });
  const r = await emit('call:start', { chatId: chat.id, video });
  if (r.error) { useStore.getState().toast(r.error, 'error'); cleanup(); return; }
  useCall.setState({ call: { ...useCall.getState().call, id: r.callId } });
  ring('out');
  try { pc = makePc(r, r.callId); await attachLocal(pc, video); } catch (e) { useStore.getState().toast(e.message, 'error'); emit('call:end', { callId: r.callId }); cleanup(); }
}

export async function acceptCall() {
  const c = useCall.getState().call;
  if (!c) return;
  stopRing();
  useCall.setState({ call: { ...c, status: 'connecting' } });
  const r = await emit('call:accept', { callId: c.id });
  if (r.error) { useStore.getState().toast(r.error, 'error'); cleanup(); return; }
  try {
    pc = makePc(r, c.id);
    pc.__callee = true;
    if (pendingOffer) { const o = pendingOffer; pendingOffer = null; await answerOffer(c.id, o); }
  } catch (e) { useStore.getState().toast(e.message, 'error'); hangup(); }
}

/** Callee: apply the offer first, then attach the microphone / camera to the negotiated transceivers, then answer. */
async function answerOffer(callId, sdp) {
  const c = useCall.getState().call;
  await pc.setRemoteDescription(sdp);
  if (!useCall.getState().local) await attachLocal(pc, c?.video);
  await pc.setLocalDescription(await pc.createAnswer());
  getSocket()?.emit('call:signal', { callId, data: { sdp: pc.localDescription } });
  for (const i of pendingIce) pc.addIceCandidate(i).catch(() => {});
  pendingIce = [];
}

export function declineCall() { const c = useCall.getState().call; if (c) getSocket()?.emit('call:decline', { callId: c.id }); cleanup(); }
export function hangup() { const c = useCall.getState().call; if (c?.id) getSocket()?.emit('call:end', { callId: c.id }); cleanup(); }

export function toggleMute() {
  const { local, muted } = useCall.getState();
  local?.getAudioTracks().forEach((t) => { t.enabled = muted; });
  useCall.setState({ muted: !muted });
}
export async function toggleCam() {
  if (!pc) return;
  const sender = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video')?.sender;
  const { camOff, local } = useCall.getState();
  if (camOff) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
      camTrack = s.getVideoTracks()[0];
      local?.addTrack(camTrack);
      if (!useCall.getState().sharing) await sender?.replaceTrack(camTrack);
      useCall.setState({ camOff: false, local: new MediaStream(local.getTracks()) });
    } catch { useStore.getState().toast('Нет доступа к камере', 'error'); }
  } else {
    if (!useCall.getState().sharing) await sender?.replaceTrack(null);
    camTrack?.stop(); local?.removeTrack(camTrack); camTrack = null;
    useCall.setState({ camOff: true, local: new MediaStream(local.getTracks()) });
  }
}
export async function toggleShare() {
  if (!pc) return;
  const sender = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video')?.sender;
  if (useCall.getState().sharing) {
    screenStream?.getTracks().forEach((t) => t.stop()); screenStream = null;
    await sender?.replaceTrack(camTrack || null);
    useCall.setState({ sharing: false });
    return;
  }
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    const track = screenStream.getVideoTracks()[0];
    track.onended = () => { if (useCall.getState().sharing) toggleShare(); };
    await sender?.replaceTrack(track);
    useCall.setState({ sharing: true });
  } catch {}
}

// signalling (registered once)
let wired = false;
function wire() {
  if (wired) return; wired = true;
  onSocket('call:incoming', (p) => {
    if (useCall.getState().call) { getSocket()?.emit('call:decline', { callId: p.callId }); return; }
    const chat = useStore.getState().chats.find((c) => c.id === p.chatId);
    useCall.setState({ call: { id: p.callId, chatId: p.chatId, peer: chat?.peer || p.from, video: p.video, dir: 'in', status: 'ringing' } });
    ring('in');
  });
  onSocket('call:taken', ({ callId }) => { const c = useCall.getState().call; if (c?.id === callId && c.status === 'ringing') cleanup(); });
  onSocket('call:accepted', async ({ callId }) => {
    const c = useCall.getState().call;
    if (!pc || c?.id !== callId) return;
    stopRing();
    useCall.setState({ call: { ...c, status: 'connecting' } });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    getSocket()?.emit('call:signal', { callId, data: { sdp: pc.localDescription } });
  });
  onSocket('call:signal', async ({ callId, data }) => {
    const c = useCall.getState().call;
    if (c?.id !== callId) return;
    if (!pc) { if (data.ice) pendingIce.push(data.ice); if (data.sdp) pendingOffer = data.sdp; return; }
    if (data.sdp) {
      if (data.sdp.type === 'offer') { await answerOffer(callId, data.sdp); return; }
      await pc.setRemoteDescription(data.sdp);
      for (const i of pendingIce) pc.addIceCandidate(i).catch(() => {});
      pendingIce = [];
    } else if (data.ice) {
      if (pc.remoteDescription) pc.addIceCandidate(data.ice).catch(() => {}); else pendingIce.push(data.ice);
    }
  });
  onSocket('call:end', ({ callId, reason }) => {
    const c = useCall.getState().call;
    if (c?.id !== callId) return;
    if (reason === 'declined') useStore.getState().toast('Звонок отклонён');
    else if (reason === 'missed' && c.dir === 'out') useStore.getState().toast('Абонент не ответил');
    cleanup();
  });
  // voice rooms
  onSocket('room:joined', ({ chatId, user }) => useRoom.getState().chatId === chatId && useRoom.setState({ peers: { ...useRoom.getState().peers, [user.id]: { user } } }));
  onSocket('room:left', ({ chatId, userId }) => { if (useRoom.getState().chatId === chatId) dropPeer(userId); });
  onSocket('room:signal', (p) => roomSignal(p));
  onSocket('room:count', ({ chatId, users }) => useRoomCounts.setState({ [chatId]: users }));
}

/* ---------- voice rooms (mesh) ---------- */
export const useRoom = create(() => ({ chatId: null, peers: {}, muted: false, local: null, ice: null }));
export const useRoomCounts = create(() => ({}));
const roomPcs = new Map(); // userId -> RTCPeerConnection

function roomPc(userId) {
  if (roomPcs.has(userId)) return roomPcs.get(userId);
  const { ice, local, chatId } = useRoom.getState();
  const p = new RTCPeerConnection({ iceServers: ice.iceServers });
  local?.getTracks().forEach((t) => p.addTrack(t, local));
  p.onicecandidate = (e) => e.candidate && getSocket()?.emit('room:signal', { chatId, to: userId, data: { ice: e.candidate } });
  p.ontrack = (e) => {
    const peers = useRoom.getState().peers;
    useRoom.setState({ peers: { ...peers, [userId]: { ...(peers[userId] || {}), stream: e.streams[0] } } });
  };
  roomPcs.set(userId, p);
  return p;
}
async function roomSignal({ chatId, from, data }) {
  if (useRoom.getState().chatId !== chatId) return;
  const p = roomPc(from);
  if (data.sdp) {
    await p.setRemoteDescription(data.sdp);
    if (data.sdp.type === 'offer') {
      await p.setLocalDescription(await p.createAnswer());
      getSocket()?.emit('room:signal', { chatId, to: from, data: { sdp: p.localDescription } });
    }
  } else if (data.ice) p.addIceCandidate(data.ice).catch(() => {});
}
function dropPeer(userId) {
  roomPcs.get(userId)?.close(); roomPcs.delete(userId);
  const peers = { ...useRoom.getState().peers }; delete peers[userId];
  useRoom.setState({ peers });
}
export async function joinRoom(chat) {
  if (useRoom.getState().chatId) await leaveRoom();
  let local;
  try { local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { useStore.getState().toast('Нет доступа к микрофону', 'error'); return; }
  const r = await emit('room:join', { chatId: chat.id });
  if (r.error) { local.getTracks().forEach((t) => t.stop()); useStore.getState().toast(r.error, 'error'); return; }
  useRoom.setState({ chatId: chat.id, title: chat.title, local, ice: r, muted: false, peers: Object.fromEntries(r.peers.map((u) => [u.id, { user: u }])) });
  // the newcomer calls everyone already in the room
  for (const u of r.peers) {
    const p = roomPc(u.id);
    await p.setLocalDescription(await p.createOffer());
    getSocket()?.emit('room:signal', { chatId: chat.id, to: u.id, data: { sdp: p.localDescription } });
  }
}
export async function leaveRoom() {
  const { chatId, local } = useRoom.getState();
  if (!chatId) return;
  getSocket()?.emit('room:leave', { chatId });
  for (const id of [...roomPcs.keys()]) dropPeer(id);
  local?.getTracks().forEach((t) => t.stop());
  useRoom.setState({ chatId: null, peers: {}, local: null, muted: false });
}
export function toggleRoomMute() {
  const { local, muted } = useRoom.getState();
  local?.getAudioTracks().forEach((t) => { t.enabled = muted; });
  useRoom.setState({ muted: !muted });
}

/* ---------- UI ---------- */
function Media({ stream, muted, mirror, className }) {
  const ref = useRef();
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} style={mirror ? { transform: 'scaleX(-1)' } : undefined} />;
}
function useTimer(start) {
  const [, t] = useState(0);
  useEffect(() => { if (!start) return undefined; const i = setInterval(() => t((x) => x + 1), 1000); return () => clearInterval(i); }, [start]);
  if (!start) return '';
  const s = Math.floor((Date.now() - start) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function Speaking({ stream }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return undefined;
    let raf; let ctx;
    try {
      ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => { an.getByteFrequencyData(buf); setOn(buf.reduce((a, b) => a + b, 0) / buf.length > 18); raf = requestAnimationFrame(loop); };
      loop();
    } catch {}
    return () => { cancelAnimationFrame(raf); ctx?.close().catch(() => {}); };
  }, [stream]);
  return <i className={`speak-ring ${on ? 'on' : ''}`} />;
}

export function CallLayer() {
  useEffect(() => { wire(); }, []);
  const { call, local, remote, muted, camOff, sharing, mini } = useCall();
  const room = useRoom();
  const time = useTimer(call?.status === 'active' ? call.startedAt : null);
  const remoteVideo = remote?.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
  return (
    <>
      {call && (
        <div className={`call-layer ${mini ? 'mini' : ''} ${remoteVideo ? 'has-video' : ''}`}>
          <Media stream={remote} className="call-remote" />
          {!remoteVideo && (
            <div className="call-who">
              <div className={`call-ava ${call.status === 'ringing' || call.status === 'calling' ? 'ringing' : ''}`}><Avatar src={call.peer?.avatar} name={call.peer?.displayName} id={call.peer?.id} size={mini ? 44 : 120} /></div>
              <div className="call-name">{call.peer?.displayName}</div>
            </div>
          )}
          <div className="call-status">{call.status === 'calling' ? 'Вызов…' : call.status === 'ringing' ? (call.video ? 'Входящий видеозвонок' : 'Входящий звонок') : call.status === 'connecting' ? 'Соединение…' : time}</div>
          {local && !camOff && <Media stream={local} muted mirror={!sharing} className="call-self" />}
          {!mini && <button className="call-min" onClick={() => useCall.setState({ mini: true })} title="Свернуть"><Minimize2 size={18} /></button>}
          {mini && <button className="call-min" onClick={() => useCall.setState({ mini: false })} title="Развернуть"><Maximize2 size={16} /></button>}
          <div className="call-controls">
            {call.dir === 'in' && call.status === 'ringing' ? (
              <>
                <button className="cc red" onClick={declineCall} title="Отклонить"><PhoneOff size={24} /></button>
                <button className="cc green" onClick={acceptCall} title="Ответить">{call.video ? <Video size={24} /> : <Phone size={24} />}</button>
              </>
            ) : (
              <>
                <button className={`cc ${muted ? 'on' : ''}`} onClick={toggleMute} title="Микрофон">{muted ? <MicOff size={22} /> : <Mic size={22} />}</button>
                <button className={`cc ${!camOff ? 'on' : ''}`} onClick={toggleCam} title="Камера">{camOff ? <VideoOff size={22} /> : <Video size={22} />}</button>
                {!!navigator.mediaDevices?.getDisplayMedia && <button className={`cc ${sharing ? 'on' : ''}`} onClick={toggleShare} title="Демонстрация экрана"><MonitorUp size={22} /></button>}
                <button className="cc red" onClick={hangup} title="Завершить"><PhoneOff size={24} /></button>
              </>
            )}
          </div>
        </div>
      )}
      {room.chatId && (
        <div className="room-bar">
          <Headphones size={18} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="bold small ellipsis">Голосовая комната · {room.title}</div>
            <div className="room-people">
              <span className="room-p"><Speaking stream={room.local} /><Avatar src={useStore.getState().me?.avatar} name={useStore.getState().me?.displayName} id={useStore.getState().me?.id} size={26} /></span>
              {Object.entries(room.peers).map(([id, p]) => (
                <span key={id} className="room-p" title={p.user?.displayName}><Speaking stream={p.stream} /><Avatar src={p.user?.avatar} name={p.user?.displayName} id={p.user?.id} size={26} />{p.stream && <Media stream={p.stream} className="room-audio" />}</span>
              ))}
            </div>
          </div>
          <button className={`cc sm ${room.muted ? 'on' : ''}`} onClick={toggleRoomMute}>{room.muted ? <MicOff size={18} /> : <Mic size={18} />}</button>
          <button className="cc sm red" onClick={leaveRoom} title="Выйти"><LogOut size={18} /></button>
        </div>
      )}
    </>
  );
}
