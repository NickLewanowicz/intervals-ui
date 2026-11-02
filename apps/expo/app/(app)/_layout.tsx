/**
 * Authenticated shell: guards on the PB session, then Calendar/Coach/Settings
 * tabs behind a floating glass tab bar (viet-study chassis: inset pill bar,
 * filled active pill, icons + labels).
 */
import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassBar } from '@/components/glass';
import { PressableScale } from '@/components/motion';
import OnboardingSheet from '@/components/OnboardingSheet';
import { Icon } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getSettingsVisited, needsOnboarding } from '@/lib/onboarding';
import { usePendingProposals } from '@/lib/queries';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const TAB_ICONS: Record<string, { on: IconName; off: IconName }> = {
  calendar: { on: 'calendar', off: 'calendar-outline' },
  coach: { on: 'chatbubbles', off: 'chatbubbles-outline' },
  settings: { on: 'settings', off: 'settings-outline' },
};

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = styles(colors);

  return (
    <View
      pointerEvents="box-none"
      style={[styles2.tabWrap, { bottom: layout.tabBarBottom + insets.bottom }]}
    >
      <GlassBar edge="none" floating style={[s.tabBar, styles2.tabBarConstrained]}>
        {state.routes.map((route, i) => {
          const { options } = descriptors[route.key]!;
          const focused = state.index === i;
          // Expo Router names leaf tabs 'coach/index' when the directory has no
          // nested layout (directories WITH one, like calendar/, get the plain
          // name) — normalize so every tab finds its icon (round-8 FIX-1).
          const nameKey = route.name.replace(/\/index$/, '');
          const icons = TAB_ICONS[nameKey] ?? { on: 'ellipse', off: 'ellipse-outline' };
          const label = options.title ?? route.name;
          const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : 0;
          const tint = focused ? colors.onAccent : colors.muted;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          return (
            <PressableScale
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              style={[s.tab, focused && [s.tabActive, { backgroundColor: colors.accent }]]}
            >
              <Icon name={focused ? icons.on : icons.off} size={19} color={tint} />
              <Text style={[s.tabLabel, { color: tint }]} numberOfLines={1}>
                {label}
              </Text>
              {badge > 0 ? (
                <View style={[s.tabBadge, focused && { borderColor: colors.onAccent }]}>
                  <Text style={[s.tabBadgeText, { color: focused ? colors.onAccent : colors.accentText }]}>
                    {badge}
                  </Text>
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </GlassBar>
    </View>
  );
}

export default function AppLayout() {
  const { ready, user, refreshUser } = useAuth();
  const { colors } = useTheme();
  const pending = usePendingProposals();
  const s = styles(colors);
  // Round 23 first-run gate: the PB `onboarded` bool + the local
  // settings-visited fallback. Null until the local flag resolves — no sheet
  // flash while storage reads.
  const [visitedSettings, setVisitedSettings] = useState<boolean | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace('/sign-in');
  }, [ready, user]);

  useEffect(() => {
    let cancelled = false;
    void getSettingsVisited().then((v) => {
      if (!cancelled) setVisitedSettings(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || !user) {
    return (
      <View style={[s.guard, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.muted} />
        <Text style={[s.guardText, { color: colors.muted }]}>Restoring session…</Text>
      </View>
    );
  }

  const pendingCount = pending.data?.length ?? 0;
  const showOnboarding = visitedSettings !== null && needsOnboarding(user, visitedSettings);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
        <Tabs.Screen
          name="coach"
          options={{ title: 'Coach', tabBarBadge: pendingCount > 0 ? pendingCount : undefined }}
        />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
      {showOnboarding ? (
        <OnboardingSheet
          key={user.id}
          userId={user.id}
          onFinished={() => {
            // the local gate flips immediately (the sheet persisted it too);
            // refreshUser re-reads the PB `onboarded` field for the long run
            setVisitedSettings(true);
            void refreshUser();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    guard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    guardText: { fontSize: fontSize.body },
    tabBar: {
      flexDirection: 'row',
      alignItems: 'center',
      height: layout.tabBarHeight,
      paddingHorizontal: spacing.sm + 2,
      gap: spacing.xs,
    },
    tab: {
      flex: 1,
      height: layout.tabBarHeight - spacing.md,
      borderRadius: radius.xl - spacing.xs,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
    },
    tabActive: {},
    tabLabel: { fontSize: fontSize.small, fontWeight: '600', flexShrink: 1 },
    tabBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      backgroundColor: p.card,
    },
    tabBadgeText: { fontSize: 10, fontWeight: '700' },
  });

/** Theme-independent layout for the floating bar. */
const styles2 = StyleSheet.create({
  tabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: layout.tabBarBottom,
    alignItems: 'center',
  },
  tabBarConstrained: { width: '100%', maxWidth: 480 },
});
