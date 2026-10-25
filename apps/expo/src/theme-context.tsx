/**
 * Theme context: resolves the active palette from a user preference
 * ('system' | 'light' | 'dark') over the OS scheme (useColorScheme), and
 * persists the override.
 *
 * Persistence strategy (no migrations allowed): the override PATCHes the
 * signed-in user's `theme` select field when the field exists; PocketBase
 * rejects unknown fields with a 400, in which case — and also as a cache for
 * pre-login — the preference lives in AsyncStorage. Either way the app boots
 * with the right theme next launch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { pb } from '@/lib/pb';
import {
  dark,
  light,
  resolvePalette,
  type Palette,
  type Scheme,
  type ThemePreference,
} from '@/theme';

const STORAGE_KEY = 'intervals.theme';

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Resolved concrete palette (preference + OS scheme applied). */
  colors: Palette;
  isDark: boolean;
  scheme: Scheme;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalize(v: unknown): ThemePreference | null {
  return v === 'light' || v === 'dark' || v === 'system' ? v : null;
}

function loadStored(): Promise<ThemePreference> {
  // PB record wins (it follows the account); AsyncStorage is the fallback cache.
  const fromRecord = normalize(pb.authStore.record?.theme);
  if (fromRecord) return Promise.resolve(fromRecord);
  return AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => normalize(v) ?? 'system')
    .catch(() => 'system');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    void loadStored().then(setPref);
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    void AsyncStorage.setItem(STORAGE_KEY, p).catch(() => undefined);
    const record = pb.authStore.record;
    if (record?.id) {
      // Best-effort: 400 here means the `theme` field isn't in the schema yet;
      // AsyncStorage above is the durable fallback until then.
      void pb
        .collection('users')
        .update(record.id, { theme: p })
        .catch(() => undefined);
    }
  }, []);

  const scheme: Scheme = systemScheme === 'light' ? 'light' : 'dark';
  const colors = resolvePalette(preference, scheme);
  const isDark = colors === dark || (colors !== light && scheme === 'dark');

  const value = useMemo(
    () => ({ preference, setPreference, colors, isDark, scheme }),
    [preference, setPreference, colors, isDark, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
