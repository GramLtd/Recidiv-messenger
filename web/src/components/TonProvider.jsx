import { TonConnectUI, TonConnectUIProvider } from '@tonconnect/ui-react';
import { PUBLIC_ORIGIN } from '../api.js';

// TonConnect is heavy (~1 MB), so it lives in its own chunk and is created once, on first use.
let instance;
const manifestUrl = import.meta.env.VITE_TONCONNECT_MANIFEST || `${PUBLIC_ORIGIN}/tonconnect-manifest.json`;

export function TonProvider({ children }) {
  if (!instance) instance = new TonConnectUI({ manifestUrl });
  return <TonConnectUIProvider instance={instance}>{children}</TonConnectUIProvider>;
}
