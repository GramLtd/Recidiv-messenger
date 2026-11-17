import Native from '../../modules/recidivist-proxy';

/** Persist proxy settings in the native layer (Keychain-free UserDefaults / SharedPreferences). Returns true if applied live. */
export async function applyProxy(cfg: Record<string, unknown>) {
  try { return !!Native?.setProxy(cfg); } catch { return false; }
}
