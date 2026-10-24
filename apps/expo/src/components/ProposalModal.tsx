/**
 * The steering flow: nothing the coach proposes touches intervals.icu until
 * the athlete taps Approve here (POST /api/proposals/:id/apply via the worker).
 */
import { formatDuration, formatKm } from '@intervals/core';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { applyProposal, dismissProposal } from '@/lib/api';
import type { Proposal } from '@/lib/records';
import { colors, fontSize, radius, spacing } from '@/theme';

const KIND_LABEL: Record<Proposal['kind'], { icon: string; title: string }> = {
  create_event: { icon: '＋', title: 'New calendar entry' },
  update_event: { icon: '✎', title: 'Update calendar entry' },
  delete_event: { icon: '✕', title: 'Delete calendar entry' },
};

export default function ProposalModal({
  proposal,
  onResolved,
}: {
  proposal: Proposal;
  /** called after apply/dismiss (or on close) so the parent can refresh */
  onResolved: (outcome: 'applied' | 'dismissed' | 'closed') => void;
}) {
  const [busy, setBusy] = useState<'apply' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = KIND_LABEL[proposal.kind];
  const p = proposal.payload;

  const act = async (action: 'apply' | 'dismiss') => {
    setBusy(action);
    setError(null);
    try {
      if (action === 'apply') await applyProposal(proposal.id);
      else await dismissProposal(proposal.id);
      onResolved(action === 'apply' ? 'applied' : 'dismissed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => onResolved('closed')}>
      <Pressable style={styles.overlay} onPress={() => onResolved('closed')}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessibilityLabel="Proposal review">
          <View style={styles.headRow}>
            <Text style={styles.kindIcon}>{kind.icon}</Text>
            <Text style={styles.kindTitle}>{kind.title}</Text>
          </View>
          <Text style={styles.clauses}>You approve every change — this is a proposal, not a write.</Text>

          <View style={styles.fields}>
            {p.start_date_local ? (
              <Field label="When" value={p.start_date_local.replace('T', ' · ')} />
            ) : null}
            {proposal.kind === 'update_event' && p.id != null ? (
              <Field label="Event" value={`#${p.id}${p.name ? ` — ${p.name}` : ''}`} />
            ) : null}
            {p.name && proposal.kind !== 'update_event' ? <Field label="Name" value={p.name} /> : null}
            {p.category ? <Field label="Category" value={p.category} /> : null}
            {p.distance ? <Field label="Distance" value={formatKm(p.distance)} /> : null}
            {p.moving_time ? <Field label="Duration" value={formatDuration(p.moving_time)} /> : null}
            {p.type ? <Field label="Sport" value={p.type} /> : null}
            {p.description ? (
              <Field label="Workout" value={p.description} pre />
            ) : null}
          </View>

          {proposal.rationale ? (
            <Text style={styles.rationale}>“{proposal.rationale}”</Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button
              title={busy === 'apply' ? 'Applying…' : 'Approve'}
              onPress={() => void act('apply')}
              loading={busy === 'apply'}
              disabled={busy !== null}
              style={{ flex: 1 }}
            />
            <Button
              title={busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
              variant="ghost"
              onPress={() => void act('dismiss')}
              loading={busy === 'dismiss'}
              disabled={busy !== null}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, pre && styles.pre]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kindIcon: { color: colors.accent, fontSize: fontSize.title, fontWeight: '700' },
  kindTitle: { color: colors.text, fontSize: fontSize.h, fontWeight: '700', flexShrink: 1 },
  clauses: { color: colors.muted, fontSize: fontSize.small },
  fields: { gap: spacing.sm },
  field: { gap: 1 },
  fieldLabel: { color: colors.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { color: colors.text, fontSize: fontSize.body },
  pre: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    lineHeight: 20,
    fontSize: fontSize.small + 1,
  },
  rationale: { color: colors.muted, fontSize: fontSize.small, fontStyle: 'italic' },
  error: { color: colors.danger, fontSize: fontSize.small },
  actions: { flexDirection: 'row', gap: spacing.sm },
});
