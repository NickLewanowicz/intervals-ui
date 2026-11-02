/**
 * First-run onboarding gate (round 23).
 *
 * The API-key fields on the users record are PB-hidden (invisible to
 * clients), so "has this athlete connected their keys yet?" is detected via
 * the NON-hidden `onboarded` bool, set true when the onboarding sheet
 * completes. Fallback: a local non-secret "settings ever visited" flag covers
 * records where the PB field can't be read yet (pre-migration tokens, a
 * failed authRefresh) — anyone who has deliberately been in Settings never
 * sees the sheet.
 *
 * Companion signal for the coach screen: a local "key reported missing" flag,
 * set when onboarding finishes WITHOUT an OpenRouter key so the friendly
 * banner can replace raw transport errors. Cleared the moment a key is saved
 * on this device.
 *
 * Storage mirrors lib/widget-data.ts: AsyncStorage (localStorage-backed on
 * web) — the flag is NOT a secret, only a UI gate.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const VISITED_KEY = 'intervals.settingsVisited';
const KEY_MISSING = 'intervals.orkey.missing';

// ---------- pure decisions (unit tested) ----------

export interface OnboardingUser {
  onboarded?: boolean | null;
}

/**
 * True while the athlete hasn't completed onboarding AND has never visited
 * Settings locally. An unset/false/missing PB field counts as not onboarded
 * (pre-migration records) — the local visited flag then protects existing
 * users from a spurious sheet.
 */
export function needsOnboarding(user: OnboardingUser | null | undefined, visitedSettings: boolean): boolean {
  if (visitedSettings) return false;
  return user?.onboarded !== true;
}

/**
 * Coach-screen guard: show the "add your OpenRouter key" banner instead of
 * raw transport errors when this device has no local key AND we have reason
 * to believe no key exists anywhere (never onboarded, or onboarding finished
 * with the key step skipped). A PB-hidden-key user on a new device is
 * onboarded and NOT flagged missing → server transport keeps working, no
 * banner.
 */
export function showKeyBanner(
  user: OnboardingUser | null | undefined,
  hasLocalKey: boolean,
  keyMissingFlag: boolean,
): boolean {
  if (hasLocalKey) return false;
  return keyMissingFlag || user?.onboarded !== true;
}

// ---------- local flags ----------

export async function getSettingsVisited(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(VISITED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markSettingsVisited(): Promise<void> {
  try {
    await AsyncStorage.setItem(VISITED_KEY, '1');
  } catch {
    // storage unavailable — the PB `onboarded` field still gates the sheet
  }
}

export async function getKeyMissingFlag(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_MISSING)) === '1';
  } catch {
    return false;
  }
}

/** Onboarding finished without an OpenRouter key (coach banner shows). */
export async function markKeyMissing(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_MISSING, '1');
  } catch {
    // non-fatal: banner heuristics fall back to the onboarded field
  }
}

/** A key was saved on this device (Settings or onboarding) — banner clears. */
export async function clearKeyMissingFlag(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_MISSING);
  } catch {
    // non-fatal
  }
}
