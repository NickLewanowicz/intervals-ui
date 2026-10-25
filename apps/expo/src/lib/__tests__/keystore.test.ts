/**
 * Web-mode keystore tests: localStorage is probed with a real call (the
 * static-export render env defines one that throws), so storage is resolved
 * per-call — a plain in-memory Storage stub on globalThis is enough.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLocalOrKey, getLocalOrKey, setLocalOrKey } from '../keystore';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

describe('keystore (web mode)', () => {
  let original: PropertyDescriptor | undefined;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('round-trips the OpenRouter key under the reserved name', async () => {
    expect(await getLocalOrKey()).toBeNull();
    await setLocalOrKey('sk-or-v1-test');
    expect(await getLocalOrKey()).toBe('sk-or-v1-test');
    expect(localStorage.getItem('intervals.orkey')).toBe('sk-or-v1-test');
  });

  it('trims on save and treats empty as absent', async () => {
    await setLocalOrKey('  sk-or-v1-x  ');
    expect(await getLocalOrKey()).toBe('sk-or-v1-x');
    await setLocalOrKey('   ');
    expect(await getLocalOrKey()).toBeNull();
  });

  it('clear removes only the local copy', async () => {
    await setLocalOrKey('sk-or-v1-keep');
    await clearLocalOrKey();
    expect(await getLocalOrKey()).toBeNull();
  });
});
