import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ExternalLink, FlaskConical, RefreshCw, Rocket, Wallet } from 'lucide-react-native';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { useCached } from '../lib/useCached';
import { C } from '../lib/theme';
import { AccentFill, Btn, Glass, Press, Rise, Spark, T } from '../components/ui';
import { SheetHead, sheetStyle } from '../components/Sheets';

/** Top up sparks (web TopUp): packages, TON (any wallet app via ton:// link) or xRocket, pending check. */
export default function TopUp() {
  const me = useStore((s) => s.me);
  const [data, , reload] = useCached<any>('/wallet');
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [cur, setCur] = useState<'TONCOIN' | 'USDT'>('TONCOIN');
  const [payment, setPayment] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const pkgs: any[] = data?.packages || [];
  const pkg = pkgs.find((p) => p.id === pkgId) || pkgs[1] || pkgs[0];
  useEffect(() => {
    if (!payment || payment.status !== 'pending') return undefined;
    const t = setInterval(() => api(`/wallet/payments/${payment.id}/check`, { body: {} }).then((r) => { setPayment(r.payment); if (r.payment.status === 'paid') reload(); }).catch(() => {}), 6000);
    return () => clearInterval(t);
  }, [payment?.id, payment?.status]);
  const run = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); } catch (e: any) { Alert.alert(e.message); } finally { setBusy(false); } };
  const payTon = () => run(async () => {
    const r = await api('/wallet/topup/ton', { body: { packageId: pkg.id } });
    setPayment(r.payment);
    const url = `ton://transfer/${r.address}?amount=${r.amountNano}&text=${encodeURIComponent(r.comment)}`;
    await Linking.openURL(url).catch(() => Alert.alert('Нет TON-кошелька', 'Установите Tonkeeper или другой TON-кошелёк.'));
  });
  const payX = () => run(async () => { const r = await api('/wallet/topup/xrocket', { body: { packageId: pkg.id, currency: cur } }); setPayment(r.payment); Linking.openURL(r.payment.payUrl); });
  const payTest = () => run(async () => { await api('/wallet/topup/test', { body: { packageId: pkg.id } }); reload(); Alert.alert('Тестовое пополнение зачислено'); });
  const check = () => run(async () => { const r = await api(`/wallet/payments/${payment.id}/check`, { body: {} }); setPayment(r.payment); if (r.payment.status === 'paid') reload(); });
  if (!me) return null;
  return (
    <View style={sheetStyle}>
      <SheetHead title="Пополнить" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 14 }}>
        <Rise style={{ alignItems: 'center', gap: 4, paddingVertical: 10 }}>
          <T size={13} dim>Ваш баланс</T>
          <Spark amount={me.balance} size={30} />
          <T size={13} dim>Искры — внутренняя валюта Recidivist</T>
        </Rise>
        {payment ? (
          <Glass radius={20} style={{ padding: 16, gap: 12 }}>
            {payment.status === 'paid' ? <T w={700} color={C.green} center>✅ Оплачено — {payment.sparks} ✦ зачислено</T>
              : payment.status === 'expired' ? <T w={700} color={C.danger} center>Счёт истёк</T>
              : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ActivityIndicator color={C.accent} /><T>Ожидаем оплату {payment.amount} {payment.currency}…</T></View>}
            {payment.payUrl && payment.status === 'pending' && <Btn title="Открыть счёт xRocket" icon={<ExternalLink size={18} color="#fff" />} onPress={() => Linking.openURL(payment.payUrl)} />}
            {payment.status === 'pending' && <Btn secondary title="Проверить оплату" icon={<RefreshCw size={16} color={C.text} />} disabled={busy} onPress={check} />}
            <Btn secondary title={payment.status === 'paid' ? 'Готово' : 'Назад'} onPress={() => (payment.status === 'paid' ? router.back() : setPayment(null))} />
          </Glass>
        ) : (
          <>
            <View style={st.grid}>
              {pkgs.map((p, i) => (
                <Rise key={p.id} delay={i * 30} style={{ width: '48%' }}>
                  <Press scale={0.95} onPress={() => setPkgId(p.id)}>
                    <Glass radius={18} edge={p.id === pkg?.id ? C.accent : 'rgba(255,255,255,0.16)'} fill={p.id === pkg?.id ? `rgba(${C.accentRgb},0.14)` : C.glass} style={st.pkg}>
                      <Spark amount={p.sparks} size={17} />
                      <T size={12.5} dim>{p.ton} TON · ${p.usdt}</T>
                    </Glass>
                  </Press>
                </Rise>
              ))}
            </View>
            {pkg && (
              <View style={{ gap: 8 }}>
                <Btn height={48} disabled={busy || !data?.providers?.ton} title={`Оплатить ${pkg.ton} TON`} icon={<Wallet size={18} color="#fff" />} onPress={payTon} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Btn secondary height={48} style={{ flex: 1 }} disabled={busy || !data?.providers?.xrocket} title={`xRocket · ${cur === 'USDT' ? `${pkg.usdt} USDT` : `${pkg.ton} TON`}`} icon={<Rocket size={18} color={C.text} />} onPress={payX} />
                  <Press scale={0.92} onPress={() => setCur(cur === 'USDT' ? 'TONCOIN' : 'USDT')}>
                    {cur === 'USDT' ? <AccentFill radius={24} style={st.cur}><T w={700} color="#fff">USDT</T></AccentFill> : <Glass radius={24} style={st.cur}><T w={700}>TON</T></Glass>}
                  </Press>
                </View>
                {data?.providers?.test && <Btn secondary title="Тестовая оплата (dev)" icon={<FlaskConical size={18} color={C.text} />} disabled={busy} onPress={payTest} />}
                {!data?.providers?.ton && !data?.providers?.xrocket && <T size={12} dim center>Платёжные шлюзы не настроены на сервере.</T>}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  pkg: { alignItems: 'center', gap: 4, paddingVertical: 16 },
  cur: { width: 72, height: 48, alignItems: 'center', justifyContent: 'center' },
});
