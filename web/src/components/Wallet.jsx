import { useEffect, useState } from 'react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Wallet as WalletIcon, Rocket, FlaskConical, ExternalLink, RefreshCw, Store, Gift } from 'lucide-react';
import { useStore } from '../store.js';
import { api } from '../api.js';
import { Modal, Spark, Spinner, useAsync, useAction } from './common.jsx';
import { commentPayload } from '../ton.js';
import { fmtNum } from '../util.js';

const TX_LABELS = {
  topup: 'Пополнение', bonus: 'Бонус', gift_buy: 'Покупка подарка', gift_upgrade: 'Улучшение подарка', gift_convert: 'Конвертация подарка',
  market_buy: 'Покупка на маркете', market_sell: 'Продажа на маркете', transfer_in: 'Входящий перевод', transfer_out: 'Исходящий перевод',
  admin_grant: 'Начисление', admin_revoke: 'Списание', username: 'Юзернейм',
};

function PendingPayment({ payment, onUpdate }) {
  const [run, busy] = useAction();
  const check = () => run(async () => onUpdate((await api(`/wallet/payments/${payment.id}/check`, { body: {} })).payment));
  useEffect(() => {
    if (payment.status !== 'pending') return;
    const t = setInterval(() => api(`/wallet/payments/${payment.id}/check`, { body: {} }).then((r) => onUpdate(r.payment)).catch(() => {}), 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.id, payment.status]);
  if (payment.status === 'paid') return <div className="card center" style={{ color: '#2ecc71', fontWeight: 600 }}>✅ Оплачено — <Spark amount={payment.sparks} /> зачислено</div>;
  if (payment.status === 'expired') return <div className="card center danger">Счёт истёк</div>;
  return (
    <div className="card col" style={{ gap: 10 }}>
      <div className="row"><Spinner size={18} /> <span>Ожидаем оплату {payment.amount} {payment.currency}…</span></div>
      {payment.payUrl && <a className="btn block" href={payment.payUrl} target="_blank" rel="noreferrer"><ExternalLink size={18} /> Открыть счёт xRocket</a>}
      <button className="btn secondary block" disabled={busy} onClick={check}><RefreshCw size={16} /> Проверить оплату</button>
    </div>
  );
}

function TopUp({ data, onPaid }) {
  const [pkgId, setPkgId] = useState(data.packages[1]?.id || data.packages[0]?.id);
  const [payment, setPayment] = useState(null);
  const [xrCurrency, setXrCurrency] = useState('TONCOIN');
  const [run, busy] = useAction();
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const pkg = data.packages.find((p) => p.id === pkgId);

  const payTon = () =>
    run(async () => {
      if (!wallet) {
        await tonConnectUI.openModal();
        return;
      }
      const r = await api('/wallet/topup/ton', { body: { packageId: pkgId } });
      setPayment(r.payment);
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: r.address, amount: r.amountNano, payload: commentPayload(r.comment) }],
      });
    });
  const payXrocket = () => run(async () => {
    const r = await api('/wallet/topup/xrocket', { body: { packageId: pkgId, currency: xrCurrency } });
    setPayment(r.payment);
    window.open(r.payment.payUrl, '_blank');
  });
  const payTest = () => run(async () => { await api('/wallet/topup/test', { body: { packageId: pkgId } }); onPaid(); }, 'Тестовое пополнение зачислено');

  if (payment) {
    return (
      <div className="col">
        <PendingPayment payment={payment} onUpdate={(p) => { setPayment(p); if (p.status === 'paid') onPaid(); }} />
        <button className="btn ghost" onClick={() => setPayment(null)}>Назад</button>
      </div>
    );
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="pkg-grid">
        {data.packages.map((p) => (
          <div key={p.id} className={`pkg ${p.id === pkgId ? 'on' : ''}`} onClick={() => setPkgId(p.id)}>
            <div className="s"><Spark amount={p.sparks} /></div>
            <div className="small muted">{p.ton} TON · ${p.usdt}</div>
          </div>
        ))}
      </div>
      {pkg && (
        <div className="col" style={{ gap: 8 }}>
          <button className="btn block" disabled={busy || !data.providers.ton} onClick={payTon} title={data.providers.ton ? '' : 'Не настроено на сервере'}>
            <WalletIcon size={18} /> {wallet ? `Оплатить ${pkg.ton} TON с кошелька` : 'Подключить TON-кошелёк'}
          </button>
          {wallet && <div className="tiny muted center">Кошелёк: {wallet.account.address.slice(0, 8)}… <button className="accent" onClick={() => tonConnectUI.disconnect()}>отключить</button></div>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary grow" disabled={busy || !data.providers.xrocket} onClick={payXrocket}>
              <Rocket size={18} /> xRocket · {xrCurrency === 'USDT' ? `${pkg.usdt} USDT` : `${pkg.ton} TON`}
            </button>
            <select className="input" style={{ width: 100, height: 44 }} value={xrCurrency} onChange={(e) => setXrCurrency(e.target.value)}>
              <option value="TONCOIN">TON</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
          {data.providers.test && (
            <button className="btn ghost block" disabled={busy} onClick={payTest}><FlaskConical size={18} /> Тестовая оплата (dev)</button>
          )}
          {!data.providers.ton && !data.providers.xrocket && (
            <div className="hint center">Платёжные шлюзы не настроены: задайте TON_WALLET_ADDRESS и/или XROCKET_API_KEY на сервере.</div>
          )}
        </div>
      )}
    </div>
  );
}

export function WalletModal() {
  const me = useStore((s) => s.me);
  const openModal = useStore((s) => s.openModal);
  const { data, loading, reload } = useAsync(() => api('/wallet'), []);
  const [tab, setTab] = useState('topup');
  return (
    <Modal title="Кошелёк">
      <div className="balance-hero">
        <div className="small muted">Ваш баланс</div>
        <div className="amount"><Spark amount={me.balance} /></div>
        <div className="small muted">{data?.currency.name || 'Искры'} — внутренняя валюта Recidivist</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="chip" onClick={() => openModal('giftShop')}><Gift size={14} /> Подарки</button>
          <button className="chip" onClick={() => openModal('market')}><Store size={14} /> Маркет</button>
        </div>
      </div>
      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={tab === 'topup' ? 'on' : ''} onClick={() => setTab('topup')}>Пополнить</button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>История</button>
      </div>
      {loading || !data ? <div className="center" style={{ padding: 30 }}><Spinner /></div> : tab === 'topup' ? (
        <TopUp data={data} onPaid={reload} />
      ) : (
        <div>
          {data.transactions.length === 0 && <div className="muted center" style={{ padding: 20 }}>Операций пока нет</div>}
          {data.transactions.map((t) => (
            <div key={t.id} className="tx-row">
              <div className="grow">
                <div className="bold small">{TX_LABELS[t.type] || t.type}</div>
                <div className="tiny muted ellipsis">{t.description}</div>
                <div className="tiny muted">{new Date(t.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <div className={`amt ${t.amount > 0 ? 'plus' : ''}`}>{t.amount > 0 ? '+' : ''}{fmtNum(t.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
