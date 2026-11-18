import React from 'react';
import { RTCView } from 'react-native-webrtc';
// Native WebRTC (react-native-webrtc). The web preview uses webrtc.web.tsx (browser APIs).
export { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, MediaStream, mediaDevices } from 'react-native-webrtc';
export function StreamView({ stream, style, mirror }: { stream: any; style?: any; mirror?: boolean }) {
  if (!stream) return null;
  return <RTCView streamURL={stream.toURL()} style={style} mirror={mirror} objectFit="cover" />;
}
