/**
 * Root layout: web runtime shim, QueryClient, PB auth bootstrap, theme
 * (system + manual override), Stack.
 */
import '@expo/metro-runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/theme-context';

/**
 * The static export prerenders with the build-time (light) palette; a
 * dark-OS client hydrates with dark values and React 19 ADOPTS mismatched
 * prerendered styles without repainting (fiber already holds the new
 * values) — leaving stale light paint under client-dark layers. Bumping
 * this key once after mount remounts the tree with fully client-applied
 * styles. Web-only: native has no prerender.
 */
function useHydrationRepaintKey() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') setKey((k) => k + 1);
  }, []);
  return key;
}

/** Stack chrome that tracks the active palette (status bar included). */
function Chrome() {
  const { colors, isDark } = useTheme();
  const repaintKey = useHydrationRepaintKey();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        key={repaintKey}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <Chrome />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
