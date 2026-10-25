/**
 * Local keystore for the user's own OpenRouter key (ADR-0006).
 *
 * Web: localStorage (this browser profile only). Native: expo-secure-store
 * (Keychain / Keystore). The chat path reads this to decide between the
 * direct client→OpenRouter transport and the Worker fallback — the PB hidden
 * field stays the Worker's copy (server-side fallback + background features).
 *
 * The key is a secret: never logged, never rendered, never sent anywhere
 * except the OpenRouter chat endpoint in lib/local-chat.ts.
 */

const OR_KEY = 'intervals.orkey';

/**
 * Probe localStorage with a real call: expo's static-export render env
 * defines a localStorage whose methods throw (same trap as lib/pb.ts).
 */
function webStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return null;
    }
    const probe = localStorage.getItem('__orkey_probe__');
    return typeof probe === 'string' || probe === null ? localStorage : null;
  } catch {
    return null;
  }
}

/** The locally saved OpenRouter key, or null when this device has none. */
export async function getLocalOrKey(): Promise<string | null> {
  const ls = webStorage();
  if (ls) {
    const v = ls.getItem(OR_KEY);
    return v && v.length > 0 ? v : null;
  }
  const SecureStore = await import('expo-secure-store');
  const v = await SecureStore.getItemAsync(OR_KEY);
  return v && v.length > 0 ? v : null;
}

/** Save the key on this device (typed at Settings save time). */
export async function setLocalOrKey(key: string): Promise<void> {
  const trimmed = key.trim();
  const ls = webStorage();
  if (ls) {
    if (trimmed) ls.setItem(OR_KEY, trimmed);
    else ls.removeItem(OR_KEY);
    return;
  }
  const SecureStore = await import('expo-secure-store');
  if (trimmed) await SecureStore.setItemAsync(OR_KEY, trimmed);
  else await SecureStore.deleteItemAsync(OR_KEY);
}

/** Remove the local copy (the PB hidden field is untouched — Worker chat keeps working). */
export async function clearLocalOrKey(): Promise<void> {
  await setLocalOrKey('');
}
