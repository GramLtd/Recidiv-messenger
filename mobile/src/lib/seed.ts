import 'react-native-get-random-values';
import { validateMnemonic, mnemonicToSeed, generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const normalize = (s: string) => s.trim().toLowerCase().split(/\s+/).join(' ');
export const isValid = (m: string) => validateMnemonic(normalize(m), wordlist);
export const newMnemonic = () => generateMnemonic(wordlist, 128);

/** Same derivation as the web client: the phrase never leaves the device, only an HMAC of the BIP39 seed. */
export async function deriveKeys(mnemonic: string) {
  const seed = await mnemonicToSeed(normalize(mnemonic));
  const authKey = bytesToHex(hmac(sha256, seed, utf8ToBytes('recidivist/auth/v1'))) + bytesToHex(hmac(sha256, seed, utf8ToBytes('recidivist/auth/v1/b')));
  const e2eSecret = bytesToHex(hmac(sha256, seed, utf8ToBytes('recidivist/e2e/v1')));
  return { authKey, e2eSecret };
}
