import { Router } from 'express';
import crypto from 'node:crypto';
import { Address, Cell, loadStateInit, contractAddress } from '@ton/core';
import { db } from '../db.js';
import { fail } from '../auth.js';
import { now } from '../services.js';

/**
 * Linking TON wallets (Tonkeeper, MyTonWallet, Tonhub, Telegram Wallet… — anything TonConnect speaks)
 * to the account. Ownership is proven with TonConnect's ton_proof: the wallet signs our one-time payload.
 */
const r = Router();

db.exec(`
CREATE TABLE IF NOT EXISTS user_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT '-239',
  app_name TEXT,
  app_image TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (address)
);
CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);
`);

const PROOF_TTL = 15 * 60 * 1000;
const payloads = new Map(); // payload -> { userId, expires }

const friendly = (raw, network) => Address.parse(raw).toString({ bounceable: false, testOnly: String(network) === '-3' });
const serialize = (w) => ({ id: w.id, address: w.address, network: w.network, appName: w.app_name, appImage: w.app_image, createdAt: w.created_at });

r.get('/wallets', (req, res) => {
  const rows = db.prepare('SELECT * FROM user_wallets WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json({ wallets: rows.map(serialize) });
});

r.post('/wallets/payload', (req, res) => {
  for (const [k, v] of payloads) if (v.expires < Date.now()) payloads.delete(k);
  const payload = crypto.randomBytes(32).toString('hex');
  payloads.set(payload, { userId: req.user.id, expires: Date.now() + PROOF_TTL });
  res.json({ payload });
});

/** Public key of a standard wallet contract (v3/v4: after seqno+subwallet; v5: after a 1-bit flag). */
function publicKeysFromStateInit(stateInitB64) {
  const init = loadStateInit(Cell.fromBase64(stateInitB64).beginParse());
  const keys = [];
  if (init.data) {
    const bits = init.data.bits;
    for (const off of [64, 65]) {
      if (bits.length >= off + 256) {
        const sl = init.data.beginParse();
        sl.skip(off);
        keys.push(sl.loadBuffer(32));
      }
    }
  }
  return { init, keys };
}

function verifyEd25519(pub, message, signature) {
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pub]);
  const key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
  return crypto.verify(null, message, key, signature);
}

r.post('/wallets/link', (req, res) => {
  const { address, network, publicKey, walletStateInit, proof, appName, appImage } = req.body || {};
  if (!address || !proof || !walletStateInit) fail(400, 'Кошелёк не прислал подтверждение владения (ton_proof)');
  const entry = payloads.get(String(proof.payload));
  if (!entry || entry.userId !== req.user.id || entry.expires < Date.now()) fail(400, 'Подтверждение устарело — попробуйте ещё раз');

  let addr;
  try { addr = Address.parse(String(address)); } catch { fail(400, 'Некорректный адрес'); }
  // 1. the state init really belongs to this address
  let parsed;
  try { parsed = publicKeysFromStateInit(String(walletStateInit)); } catch { fail(400, 'Некорректный state init кошелька'); }
  if (!contractAddress(addr.workChain, parsed.init).equals(addr)) fail(400, 'State init не соответствует адресу');
  // 2. the public key is the one inside the contract
  const pub = publicKey ? Buffer.from(String(publicKey), 'hex') : parsed.keys[0];
  if (!pub || pub.length !== 32 || !parsed.keys.some((k) => k.equals(pub))) fail(400, 'Неизвестный тип кошелька');
  // 3. fresh timestamp and our domain
  const ts = Number(proof.timestamp);
  if (!ts || Math.abs(Date.now() / 1000 - ts) > PROOF_TTL / 1000) fail(400, 'Подтверждение устарело');
  const domain = String(proof.domain?.value || '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0];
  if (!domain || (host && domain !== host && !domain.endsWith(`.${host}`) && host !== 'localhost')) fail(400, `Подтверждение выдано для другого сайта (${domain})`);
  // 4. signature
  const wc = Buffer.alloc(4); wc.writeInt32BE(addr.workChain);
  const dl = Buffer.alloc(4); dl.writeUInt32LE(Buffer.byteLength(domain));
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64LE(BigInt(ts));
  const msg = Buffer.concat([Buffer.from('ton-proof-item-v2/'), wc, addr.hash, dl, Buffer.from(domain), tsb, Buffer.from(String(proof.payload))]);
  const full = Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect'), crypto.createHash('sha256').update(msg).digest()]);
  const ok = verifyEd25519(pub, crypto.createHash('sha256').update(full).digest(), Buffer.from(String(proof.signature), 'base64'));
  if (!ok) fail(400, 'Подпись кошелька не прошла проверку');
  payloads.delete(String(proof.payload));

  const pretty = friendly(addr.toRawString(), network);
  const taken = db.prepare('SELECT user_id FROM user_wallets WHERE address = ?').get(pretty);
  if (taken && taken.user_id !== req.user.id) fail(409, 'Этот кошелёк уже привязан к другому аккаунту');
  const img = typeof appImage === 'string' && /^https:\/\//.test(appImage) ? appImage.slice(0, 300) : null;
  if (taken) db.prepare('UPDATE user_wallets SET app_name = ?, app_image = ? WHERE address = ?').run(String(appName || '').slice(0, 40) || null, img, pretty);
  else db.prepare('INSERT INTO user_wallets (user_id, address, network, app_name, app_image, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, pretty, String(network || '-239'), String(appName || '').slice(0, 40) || null, img, now());
  const rows = db.prepare('SELECT * FROM user_wallets WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json({ wallets: rows.map(serialize) });
});

r.delete('/wallets/:id', (req, res) => {
  db.prepare('DELETE FROM user_wallets WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  const rows = db.prepare('SELECT * FROM user_wallets WHERE user_id = ? ORDER BY id').all(req.user.id);
  res.json({ wallets: rows.map(serialize) });
});

export default r;
