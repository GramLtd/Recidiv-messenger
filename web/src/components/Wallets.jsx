import { useEffect, useRef, useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { Wallet, Plus, Trash2, Copy, ShieldCheck } from 'lucide-react';
import { useStore } from '../store.js';
import { TonProvider } from './TonProvider.jsx';
import { api } from '../api.js';
import { Spinner, useAsync } from './common.jsx';

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-6)}` : '');

/** Link TON wallets to the account: Tonkeeper, MyTonWallet, Tonhub, Telegram Wallet… (via TonConnect + ton_proof). */
function WalletsSectionInner() {
  const toast = useStore((s) => s.toast);
  const [tonConnectUI] = useTonConnectUI();
  const { data, setData } = useAsync(() => api('/wallets'), []);
  const [linking, setLinking] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (!tonConnectUI) return undefined;
    return tonConnectUI.onStatusChange(async (w) => {
      if (!pending.current || !w) return;
      const tp = w.connectItems?.tonProof;
      pending.current = false;
      tonConnectUI.setConnectRequestParameters(null);
      try {
        if (!tp || !('proof' in tp)) throw new Error('Кошелёк не подтвердил владение. Попробуйте другой кошелёк.');
        const r = await api('/wallets/link', {
          body: {
            address: w.account.address,
            network: w.account.chain,
            publicKey: w.account.publicKey,
            walletStateInit: w.account.walletStateInit,
            proof: tp.proof,
            appName: w.name || w.device?.appName,
            appImage: w.imageUrl,
          },
        });
        setData(r);
        toast('Кошелёк привязан');
      } catch (e) {
        toast(e.message, 'error');
      } finally {
        setLinking(false);
        // keep the session clean: payments reconnect on demand
        tonConnectUI.disconnect().catch(() => {});
      }
    });
  }, [tonConnectUI]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async () => {
    try {
      setLinking(true);
      if (tonConnectUI.connected) await tonConnectUI.disconnect();
      const { payload } = await api('/wallets/payload', { body: {} });
      tonConnectUI.setConnectRequestParameters({ state: 'ready', value: { tonProof: payload } });
      pending.current = true;
      await tonConnectUI.openModal();
      const unsub = tonConnectUI.onModalStateChange((st) => {
        if (st.status === 'closed') {
          unsub();
          setTimeout(() => { if (pending.current) { pending.current = false; setLinking(false); tonConnectUI.setConnectRequestParameters(null); } }, 1500);
        }
      });
    } catch (e) {
      setLinking(false);
      toast(e.message, 'error');
    }
  };
  const unlink = async (w) => {
    if (!confirm(`Отвязать кошелёк ${short(w.address)}?`)) return;
    setData(await api.del(`/wallets/${w.id}`));
  };

  if (!data) return <div className="center" style={{ padding: 30 }}><Spinner /></div>;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="small muted">Привяжите TON-кошельки к аккаунту: Tonkeeper, MyTonWallet, Tonhub, Wallet в Telegram и другие. Кошелёк подписывает одноразовый запрос — так мы проверяем, что он ваш. Доступ к средствам Recidivist не получает.</div>
      {data.wallets.map((w) => (
        <div key={w.id} className="wallet-row">
          {w.appImage ? <img src={w.appImage} alt="" /> : <span className="auth-feature-icon"><Wallet size={20} /></span>}
          <div className="grow">
            <div className="bold">{w.appName || 'TON-кошелёк'}{w.network === '-3' && <span className="tag" style={{ marginLeft: 6 }}>testnet</span>}</div>
            <div className="wallet-addr ellipsis">{short(w.address)}</div>
          </div>
          <button className="icon-btn" title="Скопировать адрес" onClick={() => { navigator.clipboard?.writeText(w.address); toast('Адрес скопирован'); }}><Copy size={18} /></button>
          <button className="icon-btn" title="Отвязать" onClick={() => unlink(w)}><Trash2 size={18} className="danger" /></button>
        </div>
      ))}
      {!data.wallets.length && <div className="muted center small" style={{ padding: 16 }}>Кошельков пока нет</div>}
      <button className="btn block" disabled={linking} onClick={link}><Plus size={18} /> {linking ? 'Ждём подтверждения в кошельке…' : 'Привязать кошелёк'}</button>
      <div className="warn-box"><ShieldCheck size={18} /><span>Никогда не вводите сид-фразу кошелька на сайтах. Привязка идёт только через приложение кошелька.</span></div>
    </div>
  );
}

export function WalletsSection(props) {
  return <TonProvider><WalletsSectionInner {...props} /></TonProvider>;
}
