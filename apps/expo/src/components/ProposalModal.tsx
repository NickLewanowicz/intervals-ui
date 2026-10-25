/**
 * The steering flow: nothing the coach proposes touches intervals.icu until
 * the athlete taps Approve here (POST /api/proposals/:id/apply via the worker).
 * Bottom sheet on mobile widths, centered card on desktop; slides up with a
 * spring (motion spec); action verb + icon + category chip so the change
 * reads unambiguously (V-04).
 *
 * Round-5 (persona finding #1): updates render a before→after diff against
 * the PB mirror (old → new rows, only what changes), titles are human
 * ("Update Recovery jog", never "Update calendar entry #147702969" — the raw
 * id stays as tiny muted metadata), and deletes name their target.
 */
import { formatDuration, formatKm } from '@intervals/core';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Badge, Button } from '@/components/ui';
import WorkoutTimeline from '@/components/WorkoutTimeline';
import { applyProposal, dismissProposal } from '@/lib/api';
import { useMirroredEvent } from '@/lib/queries';
import { diffEvent, proposalTitle, type DiffRow } from '@/lib/proposal-diff';
import { workoutSummaryLine, normalizeDescription } from '@/lib/workout-view';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { EventEx } from '@intervals/core';
import type { Proposal } from '@/lib/records';

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

  // Human title: intent + current name. For updates/deletes prefer the
  // mirror's name (the payload's name may be missing or already rewritten).
  const titleName = proposal.kind === 'create_event' ? p.name : (before?.name ?? p.name);
  const title = proposalTitle(proposal.kind, titleName);

  const act = async (action: 'apply' | 'dismiss') => {
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
              {p.id != null && proposal.kind !== 'create_event' ? (
                <Text style={s.idMeta}>event #{p.id}</Text>
              ) : null}
              <Text style={s.clauses}>You approve every change — this is a proposal, not a write.</Text>
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
              />
            ) : proposal.kind === 'delete_event' ? (
              <DeleteView before={before} payload={p} loading={mirrored.isLoading} />
            ) : (
              <PayloadFields payload={p} isRace={isRace} />
            )}
          </ScrollView>

          {proposal.rationale ? <Text style={s.rationale}>“{proposal.rationale}”</Text> : null}

          {error ? <Text style={s.error}>{error}</Text> : null}

          <View style={s.actions}>
            <Button
              title={busy === 'apply' ? 'Applying…' : 'Approve'}
              icon="checkmark"
              onPress={() => void act('apply')}
              loading={busy === 'apply'}
              disabled={busy !== null}
              style={{ flex: 1 }}
            />
            <Button
              title={busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
              variant="ghost"
              icon="close"
              onPress={() => void act('dismiss')}
              loading={busy === 'dismiss'}
              disabled={busy !== null}
              style={{ flex: 1 }}
            />
          </View>
          <Text style={s.hint}>Not sure? Keep chatting to adjust it — nothing is written yet.</Text>
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
      {/* V-05: the brief blurb + the visual — the athlete should SEE the
          session, not read a monospace text block. Raw text stays on the
          day detail (runners copy it into intervals.icu). */}
      {p.description ? (
        <View style={s.workoutBlock}>
          <Text style={s.fieldLabel}>Workout</Text>
          <Text style={s.workoutSummary}>{workoutSummaryLine(p.description)}</Text>
          <WorkoutTimeline description={p.description} />
        </View>
      ) : null}
    </>
  );
}

/**
 * FIX-1a: before→after for an update. Only changed fields render, as
 * `old → new` rows; unchanged fields collapse into a muted context line.
 * Mirror miss/failure shows the proposed state alone — approval never blocks.
 */
function UpdateDiff({
  diff,
  loading,
  notFound,
  failed,
  payload,
  isRace,
}: {
  diff: ReturnType<typeof diffEvent> | null;
  loading: boolean;
  notFound: boolean;
  failed: boolean;
  payload: EventEx;
  isRace: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  if (loading) return <Text style={s.diffNote}>Checking the current entry…</Text>;
  if (diff && diff.changed.length > 0) {
    return (
      <View style={s.diffBlock}>
        <Text style={s.diffTitle}>Changes</Text>
        {diff.changed.map((row) =>
          row.isWorkout ? (
            <WorkoutDiffRow key={row.key} before={row.before} after={row.after} />
          ) : (
            <DiffLineRow key={row.key} row={row} />
          ),
        )}
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

/** Description diff: old + new timeline compact, plus the full new text. */
function WorkoutDiffRow({ before, after }: { before: string | null; after: string | null }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>Workout</Text>
      {before ? (
        <View style={s.workoutSide}>
          <Text style={s.workoutSideLabel}>Current</Text>
          <Text style={s.workoutSummary}>{workoutSummaryLine(before)}</Text>
          <WorkoutTimeline description={before} compact />
        </View>
      ) : null}
      <View style={s.workoutSide}>
        <Text style={s.workoutSideLabelAccent}>Proposed</Text>
        {after ? (
          <>
            <Text style={s.workoutSummary}>{workoutSummaryLine(after)}</Text>
            <WorkoutTimeline description={after} compact />
            <Text style={s.workoutRaw}>{normalizeDescription(after)}</Text>
          </>
        ) : (
          <Text style={s.diffNote}>Workout description removed.</Text>
        )}
      </View>
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
          <Text style={s.workoutSummary}>{workoutSummaryLine(e.description)}</Text>
          <WorkoutTimeline description={e.description} />
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
    idMeta: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    clauses: { color: p.muted, fontSize: fontSize.tiny, marginTop: 1 },
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
    workoutSide: { gap: spacing.xs, marginTop: spacing.xs },
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
    workoutBlock: { gap: spacing.xs, marginTop: spacing.xs },
    workoutSummary: { color: p.text, fontSize: fontSize.body },
    workoutRaw: {
      color: p.muted,
      fontSize: fontSize.small,
      lineHeight: 18,
      fontVariant: ['tabular-nums'],
    },
    deleteNote: { color: p.danger, fontSize: fontSize.small, marginTop: spacing.xs },
    rationale: { color: p.muted, fontSize: fontSize.small, fontStyle: 'italic', lineHeight: 19 },
    error: { color: p.danger, fontSize: fontSize.small },
    actions: { flexDirection: 'row', gap: spacing.sm },
    hint: { color: p.muted, fontSize: fontSize.tiny, textAlign: 'center' },
  });
