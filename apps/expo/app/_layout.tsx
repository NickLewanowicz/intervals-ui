/**
 * Root layout: web runtime shim, QueryClient, PB auth bootstrap, theme
 * (system + manual override), Stack.
 */
import '@expo/metro-runtime';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { AuthProvider } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/theme-context';

/** Stack chrome that tracks the active palette (status bar included). */
function Chrome() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
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
