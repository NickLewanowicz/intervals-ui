/**
 * FormRing (design spec calendar-home-v2 §2): a mini progress ring showing
 * where form sits on the fresh/fatigued band — sweep 0 (deeply fatigued end)
 * to 1 (very fresh end). SVG circles stroked with theme tokens only; the
 * ring color comes from the caller (band tone). react-native-svg renders
 * the same component on web and native.
 */
import React from 'react';
import Svg, { Circle } from 'react-native-svg';

export function FormRing({
  fraction,
  color,
  track,
  size = 34,
  strokeWidth = 3.5,
}: {
  /** 0..1 sweep (already clamped by formRingModel). */
  fraction: number;
  /** Band tone color (success/text/danger via the palette). */
  color: string;
  /** Track color (palette border). */
  track: string;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0.02, fraction));
  return (
    <Svg width={size} height={size} accessibilityRole="image">
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={track}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - clamped)}
        // start at 12 o'clock, sweep clockwise
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}
