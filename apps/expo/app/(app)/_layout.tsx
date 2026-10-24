/**
 * Authenticated shell: guards on the PB session, then Calendar/Coach/Settings
 * tabs. Redirect happens post-mount so static web export stays renderable.
 */
import { router, Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { usePendingProposals } from '@/lib/queries';
import { colors, fontSize, spacing } from '@/theme';

/** placeholder icon (text labels only for now — the vision pass adds icons) */
function iconStub(): React.JSX.Element | null {
  return null;
}

export default function AppLayout() {
  const { ready, user } = useAuth();
  const pending = usePendingProposals();

  useEffect(() => {
    if (ready && !user) router.replace('/sign-in');
  }, [ready, user]);

  if (!ready || !user) {
    return (
      <View style={styles.guard}>
        <ActivityIndicator color={colors.muted} />
        <Text style={styles.guardText}>Restoring session…</Text>
      </View>
    );
  }

  const pendingCount = pending.data?.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.tabLabel,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: iconStub }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: 'Coach',
          tabBarIcon: iconStub,
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
        }}
      />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: iconStub }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  guard: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  guardText: { color: colors.muted, fontSize: fontSize.body },
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: { fontSize: fontSize.small, fontWeight: '600' },
});
