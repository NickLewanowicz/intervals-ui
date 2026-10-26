/**
 * ProposalBundleSheet (proposal-approval v2 §2) — pending proposals that share
 * a bundle_key review as ONE sheet with multi-select: the coach's shared
 * reason renders ONCE (avatar strip), each item is a collapsible row with a
 * checkbox (default ALL CHECKED), inline metric diff bars, and expand → full
 * detail (fields + current/proposed timelines). "Approve selected (n)" runs
 * the worker batch endpoint and reports per-item results as row chips;
 * "Dismiss all" clears the bundle in one confirmed action.
 *
 * Chassis: same slide-up Modal + grabber + scrim + drag-the-handle-to-close
 * pattern as calendar/DetailSheet.tsx (the fixed gesture negotiation — the
 * pan responder claims the head row at touch start; buttons still win).
 * NOT the single-proposal ProposalModal — bundles never mix with it.
 */
import { diffBar, formatDuration, formatKm } from '@intervals/core';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Icon, IconButton } from '@/components/ui';
import WorkoutTimeline from '@/components/WorkoutTimeline';
import { applyBatch, dismissBatch } from '@/lib/api';
import { sharedRationale, type BundleGroup } from '@/lib/proposal-bundles';
import { proposalTitle } from '@/lib/proposal-diff';
import { useMirroredEvent } from '@/lib/queries';
import type { Proposal } from '@/lib/records';
import { normalizeDescription, workoutSummaryLine } from '@/lib/workout-view';
import { dayLabel, timeLabel } from '@/lib/dates';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

const COACH_AVATAR = require('@/assets/coach-avatar.png');

const KIND_ICON: Record<Proposal['kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  create_event: 'add-circle-outline',
  update_event: 'create-outline',
  delete_event: 'trash-outline',
};

/** Drag distance (px) past which a handle release closes the sheet. */
const CLOSE_DRAG = 110;
/** Min downward drag (px) before a fast release counts as a close fling. */
const FLING_MIN_DRAG = 12;
/** Scrim press slop (px): a release farther than this is a swipe, not a tap. */
const TAP_SLOP = 10;

type RowStatus = 'applying' | 'applied' | 'dismissed' | 'failed';

export default function ProposalBundleSheet({
  group,
  onResolved,
}: {
  group: BundleGroup;
  onResolved: (outcome: 'applied' | 'dismissed' | 'closed') => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const drag = useRef(new Animated.Value(0)).current;
  const scrimPress = useRef<{ x: number; y: number } | null>(null);

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(group.proposals.map((p) => p.id)),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, RowStatus>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'apply' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  const shared = useMemo(() => sharedRationale(group.proposals), [group]);

  // rows still awaiting a decision (this sheet's own bookkeeping — the batch
  // endpoint is the source of truth server-side; resolved rows can't re-apply)
  const openRows = useMemo(
    () =>
      group.proposals.filter((p) => status[p.id] !== 'applied' && status[p.id] !== 'dismissed'),
    [group, status],
  );
  const actionableIds = useMemo(
    () => openRows.filter((p) => checked.has(p.id)).map((p) => p.id),
    [openRows, checked],
  );

  const busyRef = useRef(false);
  busyRef.current = busy !== null;
  const resolvedRef = useRef(onResolved);
  resolvedRef.current = onResolved;

  const close = useCallback(() => {
    if (!busyRef.current) resolvedRef.current('closed');
  }, []);

  // the FIXED drag-to-close gesture (calendar/DetailSheet.tsx): the pan
  // responder claims every touch starting in the handle row — a Pressable
  // wrapper there would claim it first and the drag would never engage — and
  // denies termination (web text selection must not kill a mid-drag). Buttons
  // inside still win the negotiation (deepest-first).
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) drag.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > CLOSE_DRAG || (g.dy > FLING_MIN_DRAG && g.vy > 0.9)) close();
        // JS-driven on purpose: drag.setValue() must not mix with a
        // native-driven node (it throws on native).
        Animated.spring(drag, { toValue: 0, friction: 18, tension: 300, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, friction: 18, tension: 300, useNativeDriver: false }).start();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ).current;

  const toggle = (id: string) => {
    setConfirmDismiss(false);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Fan the batch results back onto the rows; unreported ids fail visibly. */
  const settle = (requested: string[], results: Array<{ id: string; ok: boolean; error?: string }>, okStatus: RowStatus) => {
    const byId = new Map(results.map((r) => [r.id, r]));
    setStatus((prev) => {
      const next = { ...prev };
      for (const id of requested) {
        const r = byId.get(id);
        next[id] = r ? (r.ok ? okStatus : 'failed') : 'failed';
      }
      return next;
    });
    setRowErrors((prev) => {
      const next = { ...prev };
      for (const id of requested) {
        const r = byId.get(id);
        if (r && !r.ok) next[id] = r.error ?? 'failed';
        else delete next[id];
      }
      return next;
    });
  };

  const clearApplying = (ids: string[]) => {
    setStatus((prev) => {
      const next = { ...prev };
      for (const id of ids) if (next[id] === 'applying') delete next[id];
      return next;
    });
  };

  const applySelected = async () => {
    if (busyRef.current || actionableIds.length === 0) return;
    const ids = actionableIds;
    setBusy('apply');
    setError(null);
    setConfirmDismiss(false);
    setStatus((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = 'applying';
      return next;
    });
    try {
      const outcome = await applyBatch(ids);
      settle(ids, outcome.results, 'applied');
      if (outcome.ok) {
        resolvedRef.current('applied');
        return;
      }
      const failed = outcome.results.filter((r) => !r.ok).length;
      setError(
        `Applied ${outcome.results.length - failed} of ${outcome.results.length} — resolve the remaining rows below.`,
      );
    } catch (e) {
      clearApplying(ids);
      setError(e instanceof Error ? e.message : 'Batch apply failed');
    } finally {
      setBusy(null);
    }
  };

  const dismissAll = async () => {
    if (busyRef.current || openRows.length === 0) return;
    if (!confirmDismiss) {
      setConfirmDismiss(true); // two-tap confirm — a bundle-wide action
      return;
    }
    setConfirmDismiss(false);
    const ids = openRows.map((p) => p.id);
    setBusy('dismiss');
    setError(null);
    try {
      const outcome = await dismissBatch(ids);
      settle(ids, outcome.results, 'dismissed');
      if (outcome.ok) {
        resolvedRef.current('dismissed');
        return;
      }
      const failed = outcome.results.filter((r) => !r.ok).length;
      setError(`${failed} of ${outcome.results.length} could not be dismissed — try again.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch dismiss failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={close}
      accessibilityLabel="Bundled proposal review"
    >
      <Pressable
        style={s.overlay}
        accessibilityLabel="Close bundled review"
        onPressIn={(e) => {
          scrimPress.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }}
        onPress={(e) => {
          // same tap-vs-swipe discrimination as DetailSheet (Android fires the
          // scrim press on release even after a long drag)
          const start = scrimPress.current;
          scrimPress.current = null;
          if (!start) {
            close();
            return;
          }
          const dx = e.nativeEvent.pageX - start.x;
          const dy = e.nativeEvent.pageY - start.y;
          if (Math.sqrt(dx * dx + dy * dy) < TAP_SLOP) close();
        }}
      >
        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY: drag }] }]}
          testID="bundle-sheet"
        >
          {/* handle row: drag to close — also the sheet's grab area */}
          <View style={s.handleRow} {...panResponder.panHandlers}>
            <View style={s.grabber} />
            <View style={s.head}>
              <View style={s.bundleBadge}>
                <Icon name="layers-outline" size={18} color={colors.onAccent} />
              </View>
              <View style={s.headTitles}>
                <Text accessibilityRole="header" style={s.title} numberOfLines={2}>
                  {group.summary}
                </Text>
                <View style={s.headMeta}>
                  <Badge label={`${group.proposals.length} changes`} tone="accent" />
                  <Text style={s.clauses} numberOfLines={1}>
                    One review for related changes — you pick what applies.
                  </Text>
                </View>
              </View>
              <IconButton icon="close" label="Close bundled review" onPress={close} size={16} hitSlop={8} disabled={busy !== null} />
            </View>
          </View>

          {/* the shared "why", read first, rendered once (v2 §2) */}
          {shared ? (
            <View style={s.rationaleStrip}>
              <Image source={COACH_AVATAR} style={s.avatar} accessibilityIgnoresInvertColors />
              <Text style={s.rationaleText}>{shared}</Text>
            </View>
          ) : null}

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
            {group.proposals.map((p, i) => (
              <BundleItemRow
                key={p.id}
                proposal={p}
                checked={checked.has(p.id)}
                status={status[p.id]}
                errorText={rowErrors[p.id]}
                expanded={expandedId === p.id}
                shared={shared}
                last={i === group.proposals.length - 1}
                frozen={busy !== null}
                onToggle={() => toggle(p.id)}
                onExpand={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
              />
            ))}
          </ScrollView>

          <View style={s.footer}>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <View style={s.actions}>
              <Button
                title={
                  busy === 'apply'
                    ? 'Applying…'
                    : `Approve selected (${actionableIds.length})`
                }
                icon="checkmark"
                onPress={() => void applySelected()}
                loading={busy === 'apply'}
                disabled={busy !== null || actionableIds.length === 0}
                style={{ flex: 1.35 }}
              />
              <Button
                title={
                  busy === 'dismiss'
                    ? 'Dismissing…'
                    : confirmDismiss
                      ? 'Tap again to dismiss all'
                      : 'Dismiss all'
                }
                variant={confirmDismiss ? 'danger' : 'ghost'}
                icon="close"
                onPress={() => void dismissAll()}
                loading={busy === 'dismiss'}
                disabled={busy !== null || openRows.length === 0}
                style={{ flex: 1 }}
              />
            </View>
            <Text style={s.hint}>
              Approve writes the checked changes to intervals.icu — dismiss all clears the bundle.
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// one collapsible item row
// ---------------------------------------------------------------------------

function BundleItemRow({
  proposal: p,
  checked,
  status,
  errorText,
  expanded,
  shared,
  last,
  frozen,
  onToggle,
  onExpand,
}: {
  proposal: Proposal;
  checked: boolean;
  status?: RowStatus;
  errorText?: string;
  expanded: boolean;
  shared: string | null;
  last: boolean;
  frozen: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const pld = p.payload;

  // the "before" side of the metric bars — the same never-blocks rule as the
  // single modal: mirror miss/load failure degrades to the proposed state.
  const needsMirror = (p.kind === 'update_event' || p.kind === 'delete_event') && pld.id != null;
  const mirrored = useMirroredEvent(needsMirror ? pld.id : null);
  const before = mirrored.data ?? null;

  const titleName = p.kind === 'create_event' ? pld.name : (before?.name ?? pld.name);
  const title = proposalTitle(p.kind, titleName);
  const when = pld.start_date_local
    ? `${dayLabel(pld.start_date_local.slice(0, 10))} · ${timeLabel(pld.start_date_local) || pld.start_date_local.slice(11)}`
    : null;
  const isRace = (pld.category ?? '').startsWith('RACE');

  const resolved = status === 'applied' || status === 'dismissed';
  const oldDistance = before?.distance ?? (p.kind === 'delete_event' ? pld.distance : null);
  const oldDuration = before?.moving_time ?? (p.kind === 'delete_event' ? pld.moving_time : null);
  // update payloads are partial patches — an omitted metric keeps the old value
  const newDistance = p.kind === 'delete_event' ? null : (pld.distance ?? oldDistance ?? null);
  const newDuration = p.kind === 'delete_event' ? null : (pld.moving_time ?? oldDuration ?? null);

  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <View style={s.rowHead}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Include ${title}`}
          onPress={onToggle}
          disabled={frozen || resolved}
          hitSlop={6}
          style={s.checkbox}
        >
          <Icon
            name={checked ? 'checkbox' : 'square-outline'}
            size={22}
            color={checked && !resolved ? colors.accent : colors.muted}
          />
        </Pressable>
        <View
          style={[
            s.rowIcon,
            p.kind === 'delete_event' && { backgroundColor: colors.danger },
            p.kind === 'update_event' && { backgroundColor: colors.accentText },
            p.kind === 'create_event' && { backgroundColor: colors.accent },
          ]}
        >
          <Icon name={KIND_ICON[p.kind]} size={13} color={colors.onAccent} />
        </View>
        <Pressable style={s.rowMain} onPress={onExpand} accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} details for ${title}`}>
          <View style={s.rowTitleRow}>
            <Text style={[s.rowTitle, resolved && s.rowTitleResolved]} numberOfLines={1}>
              {title}
            </Text>
            <RowStatusChip status={status} />
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} />
          </View>
          {when ? (
            <Text style={s.rowWhen} numberOfLines={1}>
              {when}
              {isRace ? ' · RACE' : ''}
            </Text>
          ) : null}
          <View style={s.bars}>
            <MetricBar
              label="Distance"
              oldV={oldDistance}
              newV={newDistance}
              format={formatKm}
            />
            <MetricBar
              label="Duration"
              oldV={oldDuration}
              newV={newDuration}
              format={formatDuration}
            />
          </View>
          {status === 'failed' && errorText ? (
            <Text style={s.rowError} numberOfLines={2}>
              {errorText}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {expanded ? (
        <View style={s.expanded}>
          {before?.name && pld.name && before.name !== pld.name ? (
            <Text style={s.nameDiff} numberOfLines={2}>
              {before.name} → {pld.name}
            </Text>
          ) : null}
          {pld.category ? (
            <View style={s.chipRow}>
              <Text style={s.fieldLabel}>Category</Text>
              <Badge label={pld.category} tone={isRace ? 'race' : 'accent'} icon={isRace ? 'flag' : undefined} />
            </View>
          ) : null}
          {pld.type ? (
            <View style={s.chipRow}>
              <Text style={s.fieldLabel}>Sport</Text>
              <Text style={s.fieldValue}>{pld.type}</Text>
            </View>
          ) : null}
          {pld.start_date_local ? (
            <View style={s.chipRow}>
              <Text style={s.fieldLabel}>When</Text>
              <Text style={s.fieldValue}>{pld.start_date_local.replace('T', ' · ')}</Text>
            </View>
          ) : null}
          {before?.description ? (
            <View style={s.workoutSide}>
              <Text style={s.sideLabel}>Current</Text>
              <Text style={s.workoutSummary}>{workoutSummaryLine(before.description)}</Text>
              <WorkoutTimeline description={before.description} compact />
            </View>
          ) : null}
          {pld.description ? (
            <View style={s.workoutSide}>
              <Text style={s.sideLabelAccent}>{p.kind === 'delete_event' ? 'Removed' : 'Proposed'}</Text>
              <Text style={s.workoutSummary}>{workoutSummaryLine(pld.description)}</Text>
              <WorkoutTimeline description={pld.description} compact />
              <Text style={s.workoutRaw}>{normalizeDescription(pld.description)}</Text>
            </View>
          ) : null}
          {p.rationale && p.rationale.trim() !== (shared ?? '').trim() ? (
            <Text style={s.itemRationale}>“{p.rationale}”</Text>
          ) : null}
          {p.kind === 'delete_event' ? (
            <Text style={s.deleteNote}>Approving removes this session from your intervals.icu calendar.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RowStatusChip({ status }: { status?: RowStatus }) {
  const { colors } = useTheme();
  const s = styles(colors);
  if (!status) return null;
  if (status === 'applying') {
    return (
      <View style={s.applyingChip}>
        <ActivityIndicator size="small" color={colors.muted} />
        <Text style={s.applyingText}>applying…</Text>
      </View>
    );
  }
  if (status === 'applied') return <Badge label="applied" tone="success" />;
  if (status === 'failed') return <Badge label="failed" tone="danger" />;
  return <Badge label="dismissed" tone="muted" />;
}

// ---------------------------------------------------------------------------
// compact inline metric bar (diffBar model from @intervals/core — no
// dependency on the single modal's DiffBar primitive)
// ---------------------------------------------------------------------------

function MetricBar({
  label,
  oldV,
  newV,
  format,
}: {
  label: string;
  oldV: number | null | undefined;
  newV: number | null | undefined;
  format: (v: number) => string;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const model = diffBar(oldV, newV);
  if (!model || model.direction === 0) return null; // unset both sides / unchanged

  const pct = (frac: number): `${number}%` =>
    `${Math.round(Math.max(0, Math.min(1, frac)) * 1000) / 10}%`;
  const deltaAbs = Math.abs((newV ?? 0) - (oldV ?? 0));
  const deltaText =
    model.direction === 1 ? `+${format(deltaAbs)}` : `−${format(deltaAbs || (oldV ?? 0))}`;
  const chipColor = model.direction === 1 ? colors.success : colors.danger;

  return (
    <View style={s.metricRow}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={s.track} accessibilityLabel={`${label}: ${oldV ? format(oldV) : '—'} to ${newV ? format(newV) : '—'}`}>
        {model.oldFrac > 0 ? <View style={[s.trackSeg, { width: pct(model.oldFrac), backgroundColor: colors.muted }]} /> : null}
        {model.deltaFrac !== 0 ? (
          <View
            style={[
              s.trackSeg,
              {
                width: pct(Math.abs(model.deltaFrac)),
                backgroundColor: model.direction === 1 ? colors.success : colors.danger,
                opacity: model.direction === 1 ? 1 : 0.55,
              },
            ]}
          />
        ) : null}
      </View>
      <Text style={[s.metricChip, { color: chipColor }]}>
        {deltaText}
        {model.deltaPct != null ? ` · ${model.deltaPct > 0 ? '+' : ''}${model.deltaPct}%` : ''}
      </Text>
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: p.overlay,
      justifyContent: 'flex-end',
      alignItems: 'center',
    },
    sheet: {
      width: '100%',
      maxWidth: layout.maxW,
      maxHeight: '88%',
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    // userSelect:'none' is web-only: a mouse drag on the head must not start a
    // text selection — it would fire selectionchange and kill the pan gesture
    handleRow: { alignItems: 'center', userSelect: 'none' },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: p.borderStrong,
      marginTop: spacing.xs,
      marginBottom: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
    bundleBadge: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accent,
    },
    headTitles: { flexShrink: 1, flexGrow: 1, gap: 3 },
    title: { color: p.text, fontSize: fontSize.h, fontWeight: '700' },
    headMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    clauses: { color: p.muted, fontSize: fontSize.tiny, flexShrink: 1 },
    rationaleStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: p.accentSoft,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
    },
    rationaleText: { color: p.text, fontSize: fontSize.small, lineHeight: 19, flexShrink: 1 },
    scroll: { flexShrink: 1 },
    scrollContent: { paddingBottom: spacing.md },
    row: { paddingTop: spacing.xs },
    rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.border },
    rowHead: { flexDirection: 'row', alignItems: 'flex-start' },
    checkbox: {
      width: layout.minTouch,
      height: layout.minTouch,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowIcon: {
      width: 24,
      height: 24,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xs + 2,
      backgroundColor: p.accent,
    },
    rowMain: { flexShrink: 1, flexGrow: 1, paddingVertical: spacing.xs, gap: 2 },
    rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowTitle: { color: p.text, fontSize: fontSize.body, fontWeight: '600', flexShrink: 1, flexGrow: 1 },
    rowTitleResolved: { color: p.muted },
    rowWhen: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    bars: { gap: 3, marginTop: spacing.xs },
    applyingChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    applyingText: { color: p.muted, fontSize: fontSize.tiny },
    rowError: { color: p.danger, fontSize: fontSize.tiny, marginTop: 2 },
    expanded: { gap: spacing.sm, paddingTop: spacing.xs, paddingLeft: layout.minTouch, paddingBottom: spacing.md },
    nameDiff: { color: p.mutedStrong, fontSize: fontSize.small },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    fieldLabel: { color: p.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 64 },
    fieldValue: { color: p.text, fontSize: fontSize.small },
    workoutSide: { gap: spacing.xs },
    sideLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sideLabelAccent: {
      color: p.accentText,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    workoutSummary: { color: p.text, fontSize: fontSize.small },
    workoutRaw: {
      color: p.muted,
      fontSize: fontSize.tiny,
      lineHeight: 16,
      fontVariant: ['tabular-nums'],
    },
    itemRationale: { color: p.muted, fontSize: fontSize.small, fontStyle: 'italic', lineHeight: 19 },
    deleteNote: { color: p.danger, fontSize: fontSize.small },
    footer: { gap: spacing.sm },
    error: { color: p.danger, fontSize: fontSize.small },
    actions: { flexDirection: 'row', gap: spacing.sm },
    hint: { color: p.muted, fontSize: fontSize.tiny, textAlign: 'center' },
    metricRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    metricLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      width: 64,
    },
    track: {
      flexGrow: 1,
      flexShrink: 1,
      flexDirection: 'row',
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: p.border,
    },
    trackSeg: { height: '100%' },
    metricChip: {
      fontSize: fontSize.tiny,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      minWidth: 72,
      textAlign: 'right',
    },
  });
