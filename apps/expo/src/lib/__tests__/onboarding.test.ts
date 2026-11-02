/**
 * Onboarding gate (round 23): needsOnboarding + showKeyBanner pure decisions,
 * and the local flag round trips (AsyncStorage mocked in-memory — the real
 * package imports react-native, absent in node tests).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearKeyMissingFlag,
  getKeyMissingFlag,
  getSettingsVisited,
  markKeyMissing,
  markSettingsVisited,
  needsOnboarding,
  showKeyBanner,
} from '../onboarding';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
    setItem: (k: string, v: string) => (store.set(k, v), Promise.resolve()),
    removeItem: (k: string) => (store.delete(k), Promise.resolve()),
  },
}));

describe('needsOnboarding', () => {
  it('shows the sheet for a brand-new user (PB onboarded absent/false)', () => {
    expect(needsOnboarding(null, false)).toBe(true);
    expect(needsOnboarding(undefined, false)).toBe(true);
    expect(needsOnboarding({ onboarded: false }, false)).toBe(true);
    expect(needsOnboarding({}, false)).toBe(true);
  });

  it('never shows for a user who completed onboarding', () => {
    expect(needsOnboarding({ onboarded: true }, false)).toBe(false);
    expect(needsOnboarding({ onboarded: true }, true)).toBe(false);
  });

  it('the local settings-visited fallback suppresses the sheet (pre-migration records)', () => {
    // PB field unreadable/unset, but this athlete has deliberately been in Settings
    expect(needsOnboarding({ onboarded: false }, true)).toBe(false);
    expect(needsOnboarding(null, true)).toBe(false);
  });
});

describe('showKeyBanner', () => {
  it('shows when no local key and no reason to believe a key exists anywhere', () => {
    expect(showKeyBanner(null, false, false)).toBe(true);
    expect(showKeyBanner({ onboarded: false }, false, false)).toBe(true);
    // onboarding completed but the key step was skipped → flagged missing
    expect(showKeyBanner({ onboarded: true }, false, true)).toBe(true);
  });

  it('hides when a local key exists (chat runs on-device)', () => {
    expect(showKeyBanner(null, true, false)).toBe(false);
    expect(showKeyBanner({ onboarded: true }, true, true)).toBe(false);
  });

  it('hides for an onboarded user without the missing flag (PB-hidden key on another device)', () => {
    // server transport works there — no banner, no nag
    expect(showKeyBanner({ onboarded: true }, false, false)).toBe(false);
  });
});

describe('local flags', () => {
  beforeEach(() => store.clear());

  it('settings-visited round trips and defaults false', async () => {
    expect(await getSettingsVisited()).toBe(false);
    await markSettingsVisited();
    expect(await getSettingsVisited()).toBe(true);
  });

  it('key-missing flag round trips and clears (key saved on device)', async () => {
    expect(await getKeyMissingFlag()).toBe(false);
    await markKeyMissing();
    expect(await getKeyMissingFlag()).toBe(true);
    await clearKeyMissingFlag();
    expect(await getKeyMissingFlag()).toBe(false);
  });
});
