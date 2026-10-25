/**
 * Coach tab = a Stack (mirrors calendar/): the chat is the index, the
 * sessions list pushes INSIDE the tab instead of becoming a sibling route.
 */
import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '@/theme-context';

export default function CoachTabLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
