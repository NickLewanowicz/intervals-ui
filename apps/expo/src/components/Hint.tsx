/**
 * Hint — dependency-free tooltip primitive (design spec calendar-home-v2 §4:
 * "Implement ONE Tooltip/LongPressHint primitive: web = hover/focus popover;
 * native = long-press popover"). Used by info-i icons (InfoHint) and by
 * flagged chips (Hint wrapping any trigger).
 *
 * The bubble renders in a transparent Modal measured against the anchor with
 * measureInWindow, so it escapes card overflow clipping. Dismissal (spec:
 * scroll / out-press): outside press on the overlay, ANY key while open
 * (parity-2 BUG #20 / WCAG 2.1.2 — Escape always works, Tab always moves on;
 * the trigger's Enter/Space activation is handled by its own toggle), scroll
 * intents (wheel/touchmove), or — web — moving the pointer clearly off both
 * the trigger and the bubble, or focus leaving the trigger.
 *
 * Keyboard safety (BUG #20): the bubble NEVER contains focusable content and
 * its wrappers are tabIndex=-1, so RNW's Modal focus trap has nothing to yank
 * focus into — focus stays on the trigger (WAI-ARIA tooltip pattern) and
 * returns there on close. The ModalFocusTrap's refocus-on-unmount re-fires
 * the trigger's onFocus, which would re-open what the user just dismissed —
 * the reopen guard (lib/hint-view.ts) suppresses that within a short
 * cooldown. The pointer check runs at the window level because the overlay
 * covers the trigger the instant it opens (a naive hover-out on the trigger
 * would close-flicker the bubble). No DOM-only APIs: the same code path runs
 * native (long-press to open, tap-away to close).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GlassSurface } from '@/components/glass';
import {
  armReopenGuard,
  reopenAllowed,
  shouldDismissOnKey,
} from '@/lib/hint-view';
import { fontSize, lineHeight, radius, shadows, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

const BUBBLE_MAX_W = 280;
const SCREEN_MARGIN = 8;
const ANCHOR_GAP = 8;
/** Vertical room required above the anchor to prefer opening upward. */
const PREFER_ABOVE = 140;
/** Slack around anchor+bubble for the pointer-out test (px). */
const OUT_SLACK = 12;

interface AnchorRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Window listeners typed structurally (no DOM lib dependency). */
type WindowTarget = {
  addEventListener?: (
    type: string,
    listener: (e?: { key?: string; clientX?: number; clientY?: number }) => void,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (e?: { key?: string; clientX?: number; clientY?: number }) => void,
  ) => void;
};

/**
 * Only one bubble at a time (module-level claim — no context/DOM needed).
 */
let activeDismiss: (() => void) | null = null;
const claimDismiss = (hide: () => void) => {
  activeDismiss?.();
  activeDismiss = hide;
};
const releaseDismiss = (hide: () => void) => {
  if (activeDismiss === hide) activeDismiss = null;
};

export function Hint({
  content,
  label,
  children,
  style,
  hitSlop,
}: {
  content: string | React.ReactNode;
  /** Accessibility label describing what the hint is about. */
  label: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { width: winW, height: winH } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const [bubbleH, setBubbleH] = useState<number | null>(null);
  const anchorRef = useRef<View | null>(null);
  const reopenGuardUntil = useRef(0);
  const isWeb = Platform.OS === 'web';

  const hide = useCallback(() => {
    reopenGuardUntil.current = armReopenGuard(Date.now());
    setOpen(false);
    releaseDismiss(hide);
  }, []);
  const show = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, w, h) => {
      claimDismiss(hide);
      setBubbleH(null);
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  }, [hide]);
  // focus-open consults the reopen guard: the Modal's refocus-on-unmount
  // re-fires onFocus right after a dismissal and must not re-open (BUG #20).
  const showOnFocus = useCallback(() => {
    if (!reopenAllowed(reopenGuardUntil.current, Date.now())) return;
    show();
  }, [show]);

  const bubbleW = Math.min(BUBBLE_MAX_W, winW - SCREEN_MARGIN * 2);
  const above = anchor ? anchor.y > PREFER_ABOVE : true;
  const left = anchor
    ? Math.max(SCREEN_MARGIN, Math.min(anchor.x + anchor.w / 2 - bubbleW / 2, winW - bubbleW - SCREEN_MARGIN))
    : 0;
  const maxHeight = anchor
    ? above
      ? anchor.y - ANCHOR_GAP - SCREEN_MARGIN
      : winH - anchor.y - anchor.h - ANCHOR_GAP - SCREEN_MARGIN
    : 300;

  // Any-key dismissal while open (all platforms — the optional global call
  // no-ops where no window exists; native also has the Modal's
  // onRequestClose for the back gesture). Scroll-intent / pointer-out checks
  // are web-only: the overlay covers the trigger once open, so a hover-out
  // on the trigger itself would fire immediately and flicker.
  useEffect(() => {
    if (!open) return;
    const target = globalThis as WindowTarget;
    const onKey = (e?: { key?: string }) => {
      if (shouldDismissOnKey(e?.key)) hide();
    };
    target.addEventListener?.('keydown', onKey);
    if (!isWeb) return () => target.removeEventListener?.('keydown', onKey);

    const onScrollIntent = () => hide();
    const onMove = (e?: { clientX?: number; clientY?: number }) => {
      if (!anchor) return;
      const x = e?.clientX;
      const y = e?.clientY;
      if (typeof x !== 'number' || typeof y !== 'number') return;
      const estH = bubbleH ?? 140;
      const inBox = (bx: number, by: number, bw: number, bh: number) =>
        x >= bx - OUT_SLACK && x <= bx + bw + OUT_SLACK && y >= by - OUT_SLACK && y <= by + bh + OUT_SLACK;
      const inAnchor = inBox(anchor.x, anchor.y, anchor.w, anchor.h);
      const inBubble = inBox(left, above ? anchor.y - ANCHOR_GAP - estH : anchor.y + anchor.h + ANCHOR_GAP, bubbleW, estH);
      if (!inAnchor && !inBubble) hide();
    };
    target.addEventListener?.('wheel', onScrollIntent);
    target.addEventListener?.('touchmove', onScrollIntent);
    target.addEventListener?.('mousemove', onMove);
    return () => {
      target.removeEventListener?.('keydown', onKey);
      target.removeEventListener?.('wheel', onScrollIntent);
      target.removeEventListener?.('touchmove', onScrollIntent);
      target.removeEventListener?.('mousemove', onMove);
    };
  }, [open, isWeb, anchor, bubbleH, left, bubbleW, above, hide]);

  return (
    <>
      <Pressable
        ref={anchorRef}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Shows an explanation"
        style={style}
        hitSlop={hitSlop}
        // web: hover or keyboard focus opens; press toggles (touch screens).
        // native: long-press opens (press = no-op so cards stay tappable).
        onPress={isWeb ? () => (open ? hide() : show()) : undefined}
        onLongPress={isWeb ? undefined : show}
        delayLongPress={250}
        onHoverIn={isWeb ? show : undefined}
        onFocus={isWeb ? showOnFocus : undefined}
        onBlur={isWeb ? hide : undefined}
      >
        {children}
      </Pressable>
      {/* rendered only when open + measured: Modal children are constructed
          eagerly, so the anchor math must not run before measureInWindow */}
      {open && anchor ? (
        <Modal transparent animationType="fade" onRequestClose={hide} statusBarTranslucent>
          {/* tabIndex=-1 on both wrappers (BUG #20): RNW's Modal wraps content
              in a focus trap — any focusable node in here lets it yank focus
              off the trigger and strand it inside the bubble. With none, the
              trap can't move focus and the bubble reads as role=tooltip. The
              content must stay non-interactive (text only). */}
          <Pressable
            accessibilityLabel="Dismiss explanation"
            onPress={hide}
            style={s.dismissLayer}
            tabIndex={-1}
          >
            {/* the wrapper IS positioned (shrink-wraps the bubble) and captures
                presses on the bubble so they don't dismiss the overlay */}
            <Pressable
              style={[
                s.bubbleStop,
                {
                  left,
                  width: bubbleW,
                  ...(above
                    ? { bottom: winH - anchor.y + ANCHOR_GAP }
                    : { top: anchor.y + anchor.h + ANCHOR_GAP }),
                },
              ]}
              tabIndex={-1}
            >
              <View
                onLayout={(e) => setBubbleH(e.nativeEvent.layout.height)}
                style={{ width: '100%' }}
                role="tooltip"
                accessibilityLiveRegion="polite"
              >
                <GlassSurface style={[s.bubble, { maxHeight }]}>
                  {typeof content === 'string' ? (
                    <Text style={s.bubbleText}>{content}</Text>
                  ) : (
                    content
                  )}
                </GlassSurface>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

/** Small info-i trigger that opens a Hint. Sits inline after labels/values. */
export function InfoHint({
  content,
  label,
  size = 14,
}: {
  content: string | React.ReactNode;
  label: string;
  size?: number;
}) {
  const { colors } = useTheme();
  return (
    <Hint content={content} label={label} hitSlop={6}>
      <View accessibilityElementsHidden>
        <Ionicons name="information-circle-outline" size={size} color={colors.muted} />
      </View>
    </Hint>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    dismissLayer: { flex: 1 },
    // Pressable wrapper stops bubble presses from dismissing the overlay;
    // it carries the anchor-relative coordinates and shrink-wraps the bubble.
    bubbleStop: { position: 'absolute' },
    bubble: {
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      ...shadows(p).bar,
    },
    bubbleText: {
      color: p.text,
      fontSize: fontSize.tiny + 1,
      lineHeight: lineHeight.small + 2,
    },
  });
