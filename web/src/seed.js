import { generateMnemonic, validateMnemonic, mnemonicToSeed } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const newMnemonic = () => generateMnemonic(wordlist, 128); // 12 words

export const normalizeMnemonic = (s) => s.trim().toLowerCase().split(/\s+/).join(' ');

export const isValidMnemonic = (m) => validateMnemonic(normalizeMnemonic(m), wordlist);

export const WORDLIST = wordlist;

/**
 * The seed phrase never leaves the device. We derive the BIP39 seed and then an
 * app-specific auth key from it (HMAC with a domain tag), and only that key is sent.
 */
export async function deriveAuthKey(mnemonic) {
  const seed = await mnemonicToSeed(normalizeMnemonic(mnemonic));
  return bytesToHex(hmac(sha256, seed, utf8ToBytes('recidivist/auth/v1'))) + bytesToHex(hmac(sha256, seed, utf8ToBytes('recidivist/auth/v1/b')));
}
