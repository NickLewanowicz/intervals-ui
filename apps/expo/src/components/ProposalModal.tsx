/**
 * The steering flow: nothing the coach proposes touches intervals.icu until
 * the athlete taps Approve here (POST /api/proposals/:id/apply via the worker).
 * Bottom sheet on mobile widths, centered card on desktop; slides up with a
 * spring (motion spec); action verb + icon + category chip so the change
 * reads unambiguously (V-04).
 *
 * Round-14 (proposal-approval-v2 spec §1, modal v3): the coach's rationale is
 * the FIRST thing — avatar + the readable "why" sentence; distance/duration
 * changes render as visual DiffBars (shared scale, hatched removed / solid
 * added); CURRENT and PROPOSED timeline bars compare zones on one width; the
 * raw description never shows by default (collapsed "View workout text"
 * disclosure); the name diff stays small under the title; the approve-clause
 * merges into a single footer sentence and the event id demotes to tiny
 * bottom metadata.
 */
import { formatDuration, formatKm } from '@intervals/core';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Badge, Button } from '@/components/ui';
import DiffBar from '@/components/DiffBar';
import WorkoutTimeline from '@/components/WorkoutTimeline';
import { PressableScale } from '@/components/motion';
import { applyProposal, dismissProposal } from '@/lib/api';
import { useMirroredEvent } from '@/lib/queries';
import { isProposable } from '@/lib/proposal-hydration';
import { diffEvent, proposalTitle, type DiffRow } from '@/lib/proposal-diff';
import { diffBarRow, type DiffBarRowModel } from '@/lib/diff-bar-view';
import { normalizeDescription, planTimeline } from '@/lib/workout-view';
import { fontSize, layout, lineHeight, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { EventEx } from '@intervals/core';
import type { Proposal } from '@/lib/records';

const COACH_AVATAR = require('@/assets/coach-avatar.png');

const KIND_ICON: Record<Proposal['kind'], React.ComponentProps<typeof Ionicons>['name']> = {
  create_event: 'add-circle-outline',
  update_event: 'create-outline',
  delete_event: 'trash-outline',
};

export default function ProposalModal({
  proposal,
  onResolved,
}: {
  proposal: Proposal;
  /** called after apply/dismiss (or on close) so the parent can refresh */
  onResolved: (outcome: 'applied' | 'dismissed' | 'closed') => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { width } = useWindowDimensions();
  const compact = width < 720; // bottom sheet on phone widths, centered on desktop
  const [busy, setBusy] = useState<'apply' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = KIND_ICON[proposal.kind];
  const p = proposal.payload;
  const isRace = (p.category ?? '').startsWith('RACE');

  // BUG #17 (parity-2): the modal NEVER renders enabled actions from a stub —
  // an empty id POSTs `/api/proposals//apply` (404) and an empty payload is
  // the hollow "Add to calendar" shell. A stub with an id renders a "syncing
  // details" state (the coach screen hydrates it from the pending row); an
  // id-less one is a dead end and says so honestly. Closing always works.
  const actionable = isProposable(proposal);

  // FIX-1a/c: the mirror's current state — the "before" of the diff, and the
  // human name for a delete. Load failure or miss never blocks approval.
  const needsMirror =
    (proposal.kind === 'update_event' || proposal.kind === 'delete_event') && p.id != null;
  const mirrored = useMirroredEvent(needsMirror ? p.id : null);
  const before = mirrored.data ?? null;

  const diff = useMemo(
    () => (proposal.kind === 'update_event' && before ? diffEvent(before, p) : null),
    [proposal.kind, before, p],
  );

  // v3 §1.2: DiffBar rows for the numeric metric diffs (only what changed).
  const barRows = useMemo(() => {
    if (!diff) return [] as DiffBarRowModel[];
    const rows: DiffBarRowModel[] = [];
    if (diff.changed.some((r) => r.key === 'distance')) {
      const row = diffBarRow('distance', before?.distance, p.distance);
      if (row) rows.push(row);
    }
    if (diff.changed.some((r) => r.key === 'duration')) {
      const row = diffBarRow('duration', before?.moving_time, p.moving_time);
      if (row) rows.push(row);
    }
    return rows;
  }, [diff, before, p.distance, p.moving_time]);

  // v3 §1.4: the name diff lives small under the title, not in the body.
  const nameRow = diff?.changed.find((r) => r.key === 'name') ?? null;

  // Human title: intent + current name. For updates/deletes prefer the
  // mirror's name (the payload's name may be missing or already rewritten).
  const titleName = proposal.kind === 'create_event' ? p.name : (before?.name ?? p.name);
  const title = proposalTitle(proposal.kind, titleName);

  const act = async (action: 'apply' | 'dismiss') => {
    if (!actionable) return; // stub state — buttons are disabled anyway
    setBusy(action);
    setError(null);
    try {
      if (action === 'apply') await applyProposal(proposal.id);
      else await dismissProposal(proposal.id);
      onResolved(action === 'apply' ? 'applied' : 'dismissed');
    } catch (e) {
      // failed state stays open: the error shows and Approve can be retried
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      transparent
      animationType={compact ? 'slide' : 'fade'}
      visible
      onRequestClose={() => onResolved('closed')}
      accessibilityLabel="Proposal review"
    >
      <Pressable
        style={[s.overlay, compact ? { justifyContent: 'flex-end' } : null]}
        onPress={() => onResolved('closed')}
      >
        <Pressable
          style={[s.sheet, compact ? s.sheetBottom : s.sheetCenter]}
          onPress={(e) => e.stopPropagation()}
          accessibilityLabel="Proposal details"
        >
          {/* grabber on the sheet form factor */}
          {compact ? <View style={s.grabber} /> : null}

          {/* v3 §1.1 — the coach's "why" is the first thing on the sheet */}
          {proposal.rationale ? (
            <View style={s.coachStrip}>
              <Image
                source={COACH_AVATAR}
                style={s.coachAvatar}
                accessibilityIgnoresInvertColors
              />
              <Text style={s.rationale}>{proposal.rationale}</Text>
            </View>
          ) : null}

          <View style={s.headRow}>
            <View
              style={[
                s.kindBadge,
                proposal.kind === 'delete_event' && { backgroundColor: colors.danger },
                proposal.kind === 'update_event' && { backgroundColor: colors.accentText },
                proposal.kind === 'create_event' && { backgroundColor: colors.accent },
              ]}
            >
              <Ionicons name={kind} size={18} color={colors.onAccent} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={s.verb}>{title}</Text>
              {nameRow ? (
                <Text style={s.nameDiff} numberOfLines={1}>
                  {nameRow.before ?? '—'} → {nameRow.after ?? '—'}
                </Text>
              ) : null}
            </View>
          </View>

          <ScrollView style={s.fieldsScroll} contentContainerStyle={s.fields}>
            {proposal.kind === 'update_event' ? (
              <UpdateDiff
                diff={diff}
                loading={mirrored.isLoading}
                notFound={mirrored.isSuccess && !mirrored.data}
                failed={mirrored.isError}
                payload={p}
                isRace={isRace}
                barRows={barRows}
              />
            ) : proposal.kind === 'delete_event' ? (
              <DeleteView before={before} payload={p} loading={mirrored.isLoading} />
            ) : (
              <PayloadFields payload={p} isRace={isRace} />
            )}
          </ScrollView>

          {error ? <Text style={s.error}>{error}</Text> : null}
          {!actionable ? (
            proposal.id ? (
              <Text style={s.syncNote}>Syncing proposal details…</Text>
            ) : (
              <Text style={s.error}>
                This change didn’t save properly, so it can’t be approved here — check pending
                proposals or ask the coach to propose it again.
              </Text>
            )
          ) : null}

          <View style={s.actions}>
            <Button
              title={busy === 'apply' ? 'Applying…' : 'Approve'}
              icon="checkmark"
              onPress={() => void act('apply')}
              loading={busy === 'apply'}
              disabled={busy !== null || !actionable}
              style={{ flex: 1 }}
            />
            <Button
              title={busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
              variant="ghost"
              icon="close"
              onPress={() => void act('dismiss')}
              loading={busy === 'dismiss'}
              disabled={busy !== null || !actionable}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={s.hint}>
            You approve every change — not sure? Keep chatting to adjust it; nothing is written
            yet.
          </Text>
          {p.id != null && proposal.kind !== 'create_event' ? (
            <Text style={s.idMeta}>event #{p.id}</Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** New-state fields (create_event, and the fallback views below). */
function PayloadFields({ payload: p, isRace }: { payload: EventEx; isRace: boolean }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <>
      {p.start_date_local ? (
        <Field label="When" value={p.start_date_local.replace('T', ' · ')} />
      ) : null}
      {p.name ? <Field label="Name" value={p.name} /> : null}
      {p.category ? (
        <View style={s.chipRow}>
          <Text style={s.fieldLabel}>Category</Text>
          <Badge
            label={p.category}
            tone={isRace ? 'race' : 'accent'}
            icon={isRace ? 'flag' : undefined}
          />
        </View>
      ) : null}
      {p.distance ? <Field label="Distance" value={formatKm(p.distance)} /> : null}
      {p.moving_time ? <Field label="Duration" value={formatDuration(p.moving_time)} /> : null}
      {p.type ? <Field label="Sport" value={p.type} /> : null}
      {/* V-05: the athlete SEES the session (zone bar), and the raw text
          stays one tap away — never an always-open "…" concat block. */}
      {p.description ? (
        <View style={s.workoutBlock}>
          <Text style={s.fieldLabel}>Workout</Text>
          <WorkoutTimeline description={p.description} />
          <WorkoutTextDisclosure after={p.description} />
        </View>
      ) : null}
    </>
  );
}

/**
 * FIX-1a + v3 §1: before→after for an update. Distance/duration render as
 * DiffBars, the workout as a CURRENT/PROPOSED timeline comparison, the name
 * diff moved under the title; scalar fields stay as old → new rows. Mirror
 * miss/failure shows the proposed state alone — approval never blocks.
 */
function UpdateDiff({
  diff,
  loading,
  notFound,
  failed,
  payload,
  isRace,
  barRows,
}: {
  diff: ReturnType<typeof diffEvent> | null;
  loading: boolean;
  notFound: boolean;
  failed: boolean;
  payload: EventEx;
  isRace: boolean;
  barRows: DiffBarRowModel[];
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  if (loading) return <Text style={s.diffNote}>Checking the current entry…</Text>;
  if (diff && diff.changed.length > 0) {
    // name → title area; distance/duration → DiffBars; description → compare
    const scalar = diff.changed.filter(
      (r) => !r.isWorkout && r.key !== 'name' && r.key !== 'distance' && r.key !== 'duration',
    );
    const workout = diff.changed.find((r) => r.isWorkout) ?? null;
    return (
      <View style={s.diffBlock}>
        <Text style={s.diffTitle}>Changes</Text>
        {barRows.map((row) => (
          <DiffBar key={row.key} row={row} />
        ))}
        {scalar.map((row) => (
          <DiffLineRow key={row.key} row={row} />
        ))}
        {workout ? <WorkoutCompare before={workout.before} after={workout.after} /> : null}
        {diff.unchangedLabels.length > 0 ? (
          <Text style={s.diffNote}>Unchanged: {diff.unchangedLabels.join(', ')}</Text>
        ) : null}
      </View>
    );
  }
  // mirror hit but nothing differs, or no mirror to diff against
  return (
    <>
      {diff ? (
        <Text style={s.diffNote}>No differences against the current entry.</Text>
      ) : notFound ? (
        <Text style={s.diffNote}>(original not found in mirror)</Text>
      ) : failed ? (
        <Text style={s.diffNote}>(couldn’t load the original — showing the proposed state)</Text>
      ) : null}
      <PayloadFields payload={payload} isRace={isRace} />
    </>
  );
}

/** One `old → new` row for scalar fields. */
function DiffLineRow({ row }: { row: DiffRow }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{row.label}</Text>
      <View style={s.diffLine}>
        <Text style={s.diffBefore}>{row.before ?? '—'}</Text>
        <Text style={s.diffArrow}>→</Text>
        <Text style={s.diffAfter}>{row.after ?? '—'}</Text>
      </View>
    </View>
  );
}

/**
 * v3 §1.3: the zone-over-time comparison — CURRENT compact timeline above,
 * PROPOSED below (same width, each labeled with its metric + totals so the
 * bars read against one another). A side whose text parses to nothing just
 * doesn't render a bar; the raw text of either side stays available behind
 * the collapsed "View workout text" disclosure (default closed — the "…"
 * concatenation never shows by default).
 */
function WorkoutCompare({ before, after }: { before: string | null; after: string | null }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const beforePlan = before ? planTimeline(before) : null;
  const afterPlan = after ? planTimeline(after) : null;
  return (
    <View style={s.workoutBlock}>
      {beforePlan ? (
        <View style={s.workoutSide}>
          <Text style={s.workoutSideLabel}>Current</Text>
          <WorkoutTimeline description={before!} compact />
        </View>
      ) : null}
      {afterPlan ? (
        <View style={s.workoutSide}>
          <Text style={s.workoutSideLabelAccent}>Proposed</Text>
          <WorkoutTimeline description={after!} compact />
        </View>
      ) : null}
      {!beforePlan && !afterPlan ? (
        <Text style={s.diffNote}>No structured workout to compare — read the raw text below.</Text>
      ) : null}
      <WorkoutTextDisclosure before={before} after={after} />
    </View>
  );
}

/** Collapsed raw-description disclosure (v3 §1.3): closed by default. */
function WorkoutTextDisclosure({
  before,
  after,
}: {
  before?: string | null;
  after: string | null;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [open, setOpen] = useState(false);
  if (!after && !before) return null;
  return (
    <View>
      <PressableScale
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Hide workout text' : 'View workout text'}
        style={s.disclosureRow}
      >
        <Text style={s.disclosureLabel}>{open ? 'Hide workout text' : 'View workout text'}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.muted}
        />
      </PressableScale>
      {open ? (
        <View style={s.rawBlock}>
          {before ? (
            <>
              <Text style={s.workoutSideLabel}>Current</Text>
              <Text style={s.workoutRaw}>{normalizeDescription(before)}</Text>
            </>
          ) : null}
          {after ? (
            <>
              <Text style={s.workoutSideLabelAccent}>Proposed</Text>
              <Text style={s.workoutRaw}>{normalizeDescription(after)}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** FIX-1c: a delete names + shows its target (mirror state when found). */
function DeleteView({
  before,
  payload,
  loading,
}: {
  before: EventEx | null;
  payload: EventEx;
  loading: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const e = before ?? payload;
  return (
    <>
      {loading ? <Text style={s.diffNote}>Checking the current entry…</Text> : null}
      {e.start_date_local ? (
        <Field label="When" value={e.start_date_local.replace('T', ' · ')} />
      ) : null}
      {e.distance ? <Field label="Distance" value={formatKm(e.distance)} /> : null}
      {e.moving_time ? <Field label="Duration" value={formatDuration(e.moving_time)} /> : null}
      {e.description ? (
        <View style={s.workoutBlock}>
          <Text style={s.fieldLabel}>Workout</Text>
          <WorkoutTimeline description={e.description} />
          <WorkoutTextDisclosure after={e.description} />
        </View>
      ) : null}
      <Text style={s.deleteNote}>Approving removes this session from your intervals.icu calendar.</Text>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: p.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    sheet: {
      width: '100%',
      maxHeight: '88%',
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
      padding: spacing.lg,
      gap: spacing.md,
    },
    sheetCenter: { maxWidth: 480, borderRadius: radius.xl },
    sheetBottom: { borderRadius: radius.xl, maxWidth: layout.maxW },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: p.borderStrong,
      marginBottom: -spacing.sm,
    },
    // v3 §1.1 coach summary strip
    coachStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    coachAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
    },
    rationale: {
      color: p.text,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
      flexShrink: 1,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    kindBadge: {
      width: 36,
      height: 36,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accent,
    },
    verb: { color: p.text, fontSize: fontSize.h, fontWeight: '700', flexShrink: 1 },
    nameDiff: {
      color: p.muted,
      fontSize: fontSize.small,
      marginTop: 1,
      flexShrink: 1,
    },
    idMeta: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    fields: { gap: spacing.sm },
    fieldsScroll: { flexShrink: 1 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    field: { gap: 1 },
    fieldLabel: { color: p.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
    fieldValue: { color: p.text, fontSize: fontSize.body },
    diffBlock: { gap: spacing.sm },
    diffTitle: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    diffLine: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
    diffBefore: { color: p.muted, fontSize: fontSize.body },
    diffArrow: { color: p.muted, fontSize: fontSize.body },
    diffAfter: { color: p.text, fontSize: fontSize.body, fontWeight: '600', flexShrink: 1 },
    diffNote: { color: p.muted, fontSize: fontSize.small, fontStyle: 'italic' },
    workoutSide: { gap: spacing.xs },
    workoutSideLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    workoutSideLabelAccent: {
      color: p.accentText,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    workoutBlock: { gap: spacing.xs },
    disclosureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 36,
      marginTop: spacing.xs,
      alignSelf: 'flex-start',
    },
    disclosureLabel: { color: p.muted, fontSize: fontSize.small, fontWeight: '600' },
    rawBlock: { gap: spacing.xs, marginTop: spacing.xs },
    workoutRaw: {
      color: p.mutedStrong,
      fontSize: fontSize.small,
      lineHeight: lineHeight.small,
      fontVariant: ['tabular-nums'],
    },
    deleteNote: { color: p.danger, fontSize: fontSize.small, marginTop: spacing.xs },
    error: { color: p.danger, fontSize: fontSize.small },
    syncNote: { color: p.muted, fontSize: fontSize.small, fontStyle: 'italic' },
    actions: { flexDirection: 'row', gap: spacing.sm },
    hint: { color: p.muted, fontSize: fontSize.tiny, textAlign: 'center' },
  });
