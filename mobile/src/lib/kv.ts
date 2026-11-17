import * as SecureStore from 'expo-secure-store';

/** Secrets (token, seed-derived keys) live in the iOS Keychain / Android Keystore. */
export const secret = {
  get: (k: string) => SecureStore.getItemAsync(k),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  del: (k: string) => SecureStore.deleteItemAsync(k),
};
