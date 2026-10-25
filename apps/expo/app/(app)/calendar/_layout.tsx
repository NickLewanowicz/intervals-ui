/**
 * Calendar tab = a Stack, so the day-detail screen pushes INSIDE the tab
 * instead of becoming a sibling tab.
 */
import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '@/theme-context';

export default function CalendarTabLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
