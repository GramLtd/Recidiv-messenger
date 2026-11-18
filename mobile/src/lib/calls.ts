import { Alert } from 'react-native';
import { create } from 'zustand';
import { emitAck, emit, on } from './socket';
import { kv } from './db';
import { useStore } from './store';
import { RTCPeerConnection, mediaDevices, MediaStream } from './webrtc';

/*
 * Calls in the app — same protocol as the web: the server relays signalling, media goes peer-to-peer
 * (or via the TURN relay). 1:1 audio/video calls in private chats + voice rooms in groups (mesh).
 */

type Call = { id?: string; chatId: number; peer: any; video: boolean; dir: 'in' | 'out'; status: 'calling' | 'ringing' | 'connecting' | 'active'; startedAt?: number };
type CallState = { call: Call | null; local: any; remote: any; muted: boolean; camOff: boolean; speaker: boolean };
export const useCall = create<CallState>(() => ({ call: null, local: null, remote: null, muted: false, camOff: false, speaker: false }));

let pc: any = null;
let pendingIce: any[] = [];
let pendingOffer: any = null;

const relayOnly = () => !!kv.get('calls.relayOnly', false);
async function getMedia(video: boolean) {
  try { return await mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user', width: 1280, height: 720 } : false }); } catch {
    if (video) return mediaDevices.getUserMedia({ audio: true, video: false });
    throw new Error('Нет доступа к микрофону');
  }
}

function makePc(ice: any, callId: string) {
  const p = new RTCPeerConnection({ iceServers: ice.iceServers, iceTransportPolicy: relayOnly() && ice.hasRelay ? 'relay' : 'all' });
  p.addEventListener('icecandidate', (e: any) => e.candidate && emit('call:signal', { callId, data: { ice: e.candidate } }));
  p.addEventListener('track', (e: any) => {
    const cur = useCall.getState().remote || new MediaStream();
    if (!cur.getTracks().includes(e.track)) cur.addTrack(e.track);
    useCall.setState({ remote: new MediaStream(cur.getTracks()) });
  });
  p.addEventListener('connectionstatechange', () => {
    const c = useCall.getState().call;
    if (p.connectionState === 'connected' && c) useCall.setState({ call: { ...c, status: 'active', startedAt: c.startedAt || Date.now() } });
    if (p.connectionState === 'failed') { Alert.alert('Не удалось соединиться', 'Сеть блокирует прямое соединение.'); hangup(); }
  });
  return p;
}

async function attachLocal(p: any, video: boolean) {
  const local = await getMedia(video);
  local.getAudioTracks().forEach((t: any) => p.addTrack(t, local));
  const cam = local.getVideoTracks()[0];
  if (cam) p.addTrack(cam, local);
  useCall.setState({ local, camOff: !cam });
}

function cleanup() {
  try { pc?.close(); } catch {}
  pc = null; pendingIce = []; pendingOffer = null;
  useCall.getState().local?.getTracks().forEach((t: any) => t.stop());
  useCall.setState({ call: null, local: null, remote: null, muted: false, camOff: false });
}

export async function startCall(chat: any, video: boolean) {
  if (useCall.getState().call) return;
  useCall.setState({ call: { chatId: chat.id, peer: chat.peer, video, dir: 'out', status: 'calling' } });
  const r: any = await emitAck('call:start', { chatId: chat.id, video });
  if (r.error) { Alert.alert(r.error); cleanup(); return; }
  useCall.setState({ call: { ...useCall.getState().call!, id: r.callId } });
  try { pc = makePc(r, r.callId); await attachLocal(pc, video); } catch (e: any) { Alert.alert(e.message); emit('call:end', { callId: r.callId }); cleanup(); }
}

async function answerOffer(callId: string, sdp: any) {
  const c = useCall.getState().call;
  await pc.setRemoteDescription(sdp);
  if (!useCall.getState().local) await attachLocal(pc, !!c?.video);
  await pc.setLocalDescription(await pc.createAnswer());
  emit('call:signal', { callId, data: { sdp: pc.localDescription } });
  for (const i of pendingIce) pc.addIceCandidate(i).catch(() => {});
  pendingIce = [];
}

export async function acceptCall() {
  const c = useCall.getState().call;
  if (!c?.id) return;
  useCall.setState({ call: { ...c, status: 'connecting' } });
  const r: any = await emitAck('call:accept', { callId: c.id });
  if (r.error) { Alert.alert(r.error); cleanup(); return; }
  try {
    pc = makePc(r, c.id);
    if (pendingOffer) { const o = pendingOffer; pendingOffer = null; await answerOffer(c.id, o); }
  } catch (e: any) { Alert.alert(e.message); hangup(); }
}
export function declineCall() { const c = useCall.getState().call; if (c?.id) emit('call:decline', { callId: c.id }); cleanup(); }
export function hangup() { const c = useCall.getState().call; if (c?.id) emit('call:end', { callId: c.id }); cleanup(); }
export function toggleMute() {
  const { local, muted } = useCall.getState();
  local?.getAudioTracks().forEach((t: any) => { t.enabled = muted; });
  useCall.setState({ muted: !muted });
}
export function toggleCam() {
  const { local, camOff } = useCall.getState();
  const v = local?.getVideoTracks()[0];
  if (!v) { Alert.alert('Камера недоступна в этом звонке'); return; }
  v.enabled = camOff;
  useCall.setState({ camOff: !camOff });
}
export function flipCam() {
  const v = useCall.getState().local?.getVideoTracks()[0];
  try { v?._switchCamera?.(); } catch {}
}

/* ---------- voice rooms ---------- */
type RoomState = { chatId: number | null; title?: string; peers: Record<number, { user: any; stream?: any }>; muted: boolean; local: any; ice: any };
export const useRoom = create<RoomState>(() => ({ chatId: null, peers: {}, muted: false, local: null, ice: null }));
export const useRoomCounts = create<Record<number, any[]>>(() => ({}));
const roomPcs = new Map<number, any>();

function roomPc(userId: number) {
  if (roomPcs.has(userId)) return roomPcs.get(userId);
  const { ice, local, chatId } = useRoom.getState();
  const p = new RTCPeerConnection({ iceServers: ice.iceServers });
  local?.getTracks().forEach((t: any) => p.addTrack(t, local));
  p.addEventListener('icecandidate', (e: any) => e.candidate && emit('room:signal', { chatId, to: userId, data: { ice: e.candidate } }));
  p.addEventListener('track', (e: any) => {
    const peers = useRoom.getState().peers;
    useRoom.setState({ peers: { ...peers, [userId]: { ...(peers[userId] || {}), stream: e.streams?.[0] } } });
  });
  roomPcs.set(userId, p);
  return p;
}
function dropPeer(userId: number) {
  roomPcs.get(userId)?.close(); roomPcs.delete(userId);
  const peers = { ...useRoom.getState().peers }; delete peers[userId];
  useRoom.setState({ peers });
}
export async function joinRoom(chat: any) {
  if (useRoom.getState().chatId) await leaveRoom();
  let local: any;
  try { local = await mediaDevices.getUserMedia({ audio: true, video: false }); } catch { Alert.alert('Нет доступа к микрофону'); return; }
  const r: any = await emitAck('room:join', { chatId: chat.id });
  if (r.error) { local.getTracks().forEach((t: any) => t.stop()); Alert.alert(r.error); return; }
  useRoom.setState({ chatId: chat.id, title: chat.title, local, ice: r, muted: false, peers: Object.fromEntries(r.peers.map((u: any) => [u.id, { user: u }])) });
  for (const u of r.peers) {
    const p = roomPc(u.id);
    await p.setLocalDescription(await p.createOffer({}));
    emit('room:signal', { chatId: chat.id, to: u.id, data: { sdp: p.localDescription } });
  }
}
export async function leaveRoom() {
  const { chatId, local } = useRoom.getState();
  if (!chatId) return;
  emit('room:leave', { chatId });
  for (const id of [...roomPcs.keys()]) dropPeer(id);
  local?.getTracks().forEach((t: any) => t.stop());
  useRoom.setState({ chatId: null, peers: {}, local: null, muted: false });
}
export function toggleRoomMute() {
  const { local, muted } = useRoom.getState();
  local?.getAudioTracks().forEach((t: any) => { t.enabled = muted; });
  useRoom.setState({ muted: !muted });
}

/* ---------- signalling ---------- */
let wired = false;
export function wireCalls() {
  if (wired) return; wired = true;
  on('call:incoming', (p: any) => {
    if (useCall.getState().call) { emit('call:decline', { callId: p.callId }); return; }
    const chat = useStore.getState().chats.find((c: any) => c.id === p.chatId);
    useCall.setState({ call: { id: p.callId, chatId: p.chatId, peer: chat?.peer || p.from, video: p.video, dir: 'in', status: 'ringing' } });
  });
  on('call:taken', ({ callId }: any) => { const c = useCall.getState().call; if (c && c.id === callId && c.status === 'ringing') cleanup(); });
  on('call:accepted', async ({ callId }: any) => {
    const c = useCall.getState().call;
    if (!pc || !c || c.id !== callId) return;
    useCall.setState({ call: { ...c, status: 'connecting' } });
    await pc.setLocalDescription(await pc.createOffer({}));
    emit('call:signal', { callId, data: { sdp: pc.localDescription } });
  });
  on('call:signal', async ({ callId, data }: any) => {
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
  on('call:end', ({ callId, reason }: any) => {
    const c = useCall.getState().call;
    if (c?.id !== callId) return;
    if (reason === 'declined') Alert.alert('Звонок отклонён');
    cleanup();
  });
  on('room:joined', ({ chatId, user }: any) => useRoom.getState().chatId === chatId && useRoom.setState({ peers: { ...useRoom.getState().peers, [user.id]: { user } } }));
  on('room:left', ({ chatId, userId }: any) => { if (useRoom.getState().chatId === chatId) dropPeer(userId); });
  on('room:signal', async ({ chatId, from, data }: any) => {
    if (useRoom.getState().chatId !== chatId) return;
    const p = roomPc(from);
    if (data.sdp) {
      await p.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await p.setLocalDescription(await p.createAnswer());
        emit('room:signal', { chatId, to: from, data: { sdp: p.localDescription } });
      }
    } else if (data.ice) p.addIceCandidate(data.ice).catch(() => {});
  });
  on('room:count', ({ chatId, users }: any) => useRoomCounts.setState({ [chatId]: users }));
}
