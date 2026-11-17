import { lazy, Suspense } from 'react';
import { Modal, Spinner } from './common.jsx';

// Wallet screens load TonConnect only when opened.
const Wallet = lazy(() => import('./Wallet.jsx').then((m) => ({ default: m.WalletModal })));
const Wallets = lazy(() => import('./Wallets.jsx').then((m) => ({ default: m.WalletsSection })));

const center = <div className="center" style={{ padding: 40 }}><Spinner /></div>;
export function WalletModal(props) {
  return <Suspense fallback={<Modal title="Кошелёк">{center}</Modal>}><Wallet {...props} /></Suspense>;
}
export function WalletsSection(props) {
  return <Suspense fallback={center}><Wallets {...props} /></Suspense>;
}
