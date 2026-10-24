/**
 * Calendar tab = a Stack, so the day-detail screen pushes INSIDE the tab
 * instead of becoming a sibling tab.
 */
import { Stack } from 'expo-router';
import React from 'react';
import { colors } from '@/theme';

export default function CalendarTabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
