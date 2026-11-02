/**
 * Auth context: restores the persisted PB session (authRefresh validates the
 * token and reloads the user record), exposes signIn/signOut.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { pb } from './pb';
import { toAppUser, type AppUser } from './records';

interface AuthContextValue {
  /** false until the persisted session (if any) has been restored. */
  ready: boolean;
  user: AppUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => void;
  /** Re-fetch the user record (after settings PATCHes). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ranRefresh = false;
    const restore = async () => {
      // The AsyncAuthStore hydrates ASYNCHRONOUSLY (localStorage microtask,
      // AsyncStorage slower on native): at mount isValid is always false.
      // Run on mount AND on every authStore change — the hydration save
      // fires onChange, which is what actually restores the session. A
      // failed refresh means a stale token: sign out cleanly. ready only
      // flips true once no restore is pending (or there was never a token).
      if (ranRefresh || cancelled) return;
      if (!pb.authStore.isValid) {
        setReady(true); // nothing stored — anonymous mode is fine
        return;
      }
      ranRefresh = true;
      try {
        const res = await pb.collection('users').authRefresh();
        if (!cancelled) setUser(toAppUser(res.record as Record<string, unknown>));
      } catch {
        pb.authStore.clear(); // stale/invalid token — sign out cleanly
        if (!cancelled) setUser(null);
      }
      if (!cancelled) setReady(true);
    };
    restore();
    const unsub = pb.authStore.onChange(() => restore());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await pb.collection('users').authWithPassword(email.trim(), password);
    setUser(toAppUser(res.record as Record<string, unknown>));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // popup flow on web; native uses the OS browser via the PB SDK
    const res = await pb.collection('users').authWithOAuth2({ provider: 'google' });
    setUser(toAppUser(res.record as Record<string, unknown>));
  }, []);

  const signOut = useCallback(() => {
    pb.authStore.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!pb.authStore.isValid) return;
    const res = await pb.collection('users').authRefresh();
    setUser(toAppUser(res.record as Record<string, unknown>));
  }, []);

  const value = useMemo(
    () => ({ ready, user, signIn, signInWithGoogle, signOut, refreshUser }),
    [ready, user, signIn, signInWithGoogle, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
