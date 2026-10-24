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
    (async () => {
      if (pb.authStore.isValid) {
        try {
          const res = await pb.collection('users').authRefresh();
          if (!cancelled) setUser(toAppUser(res.record as Record<string, unknown>));
        } catch {
          pb.authStore.clear(); // stale/invalid token — sign out cleanly
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await pb.collection('users').authWithPassword(email.trim(), password);
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
    () => ({ ready, user, signIn, signOut, refreshUser }),
    [ready, user, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
