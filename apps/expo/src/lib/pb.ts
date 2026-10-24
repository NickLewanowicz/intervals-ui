/**
 * PocketBase client singleton.
 *
 * Auth persistence: localStorage on web, AsyncStorage on native — both go
 * through the SDK's AsyncAuthStore so app code never branches on platform.
 *
 * The detection PROBES localStorage with a real call inside try/catch:
 * expo's static-export render environment defines a `localStorage` global
 * whose methods throw, which would crash module evaluation in Node.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import PocketBase from 'pocketbase';
import { AsyncAuthStore } from 'pocketbase';

export const PB_URL = process.env.EXPO_PUBLIC_PB_URL ?? 'https://intervals.pockethost.io';

const AUTH_KEY = 'intervals.pb.auth';

function usableLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
      return null;
    }
    const probe = localStorage.getItem('__pb_probe__'); // throws in SSR render envs
    return typeof probe === 'string' || probe === null ? localStorage : null;
  } catch {
    return null;
  }
}

const ls = usableLocalStorage();

async function persistSave(serialized: string): Promise<void> {
  if (ls) ls.setItem(AUTH_KEY, serialized);
  else await AsyncStorage.setItem(AUTH_KEY, serialized);
}

async function persistClear(): Promise<void> {
  if (ls) ls.removeItem(AUTH_KEY);
  else await AsyncStorage.removeItem(AUTH_KEY);
}

function loadInitial(): Promise<string | undefined> | undefined {
  try {
    if (ls) return Promise.resolve(ls.getItem(AUTH_KEY) ?? undefined);
    return AsyncStorage.getItem(AUTH_KEY)
      .then((v) => v ?? undefined)
      .catch(() => undefined);
  } catch {
    return undefined;
  }
}

export const pb = new PocketBase(
  PB_URL,
  new AsyncAuthStore({
    save: persistSave,
    clear: persistClear,
    initial: loadInitial(),
  }),
);

// React Query is the sole cache coordinator — PB SDK request-level
// auto-cancellation only causes spurious aborts when queries race.
pb.autoCancellation(false);

export function currentUserId(): string | null {
  return pb.authStore.isValid ? (pb.authStore.record?.id ?? null) : null;
}

export function authToken(): string | null {
  return pb.authStore.isValid ? pb.authStore.token : null;
}
