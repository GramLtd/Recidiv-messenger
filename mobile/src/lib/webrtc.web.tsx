import React, { useEffect, useRef } from 'react';
// Browser WebRTC for the web preview of the app.
const g = globalThis as any;
export const RTCPeerConnection = g.RTCPeerConnection;
export const RTCIceCandidate = g.RTCIceCandidate;
export const RTCSessionDescription = g.RTCSessionDescription;
export const MediaStream = g.MediaStream;
export const mediaDevices = g.navigator?.mediaDevices;
export function StreamView({ stream, style, mirror }: { stream: any; style?: any; mirror?: boolean }) {
  const ref = useRef<any>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
  return React.createElement('video', { ref, autoPlay: true, playsInline: true, muted: !!mirror, style: { ...flat, objectFit: 'cover', transform: mirror ? 'scaleX(-1)' : undefined } });
}
