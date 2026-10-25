/**
 * The steering flow: nothing the coach proposes touches intervals.icu until
 * the athlete taps Approve here (POST /api/proposals/:id/apply via the worker).
 * Bottom sheet on mobile widths, centered card on desktop; slides up with a
 * spring (motion spec); action verb + icon + category chip so the change
 * reads unambiguously (V-04).
 */
import { formatDuration, formatKm } from '@intervals/core';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Badge, Button } from '@/components/ui';
import { applyProposal, dismissProposal } from '@/lib/api';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { Proposal } from '@/lib/records';

const KIND_LABEL: Record<
  Proposal['kind'],
  { icon: React.ComponentProps<typeof Ionicons>['name']; verb: string }
> = {
  create_event: { icon: 'add-circle-outline', verb: 'Add to calendar' },
  update_event: { icon: 'create-outline', verb: 'Update calendar entry' },
  delete_event: { icon: 'trash-outline', verb: 'Delete calendar entry' },
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
  const kind = KIND_LABEL[proposal.kind];
  const p = proposal.payload;
  const isRace = (p.category ?? '').startsWith('RACE');

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
              <Ionicons name={kind.icon} size={18} color={colors.onAccent} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={s.verb}>{kind.verb}</Text>
              <Text style={s.clauses}>You approve every change — this is a proposal, not a write.</Text>
            </View>
          </View>

          <View style={s.fields}>
            {p.start_date_local ? (
              <Field label="When" value={p.start_date_local.replace('T', ' · ')} />
            ) : null}
            {proposal.kind === 'update_event' && p.id != null ? (
              <Field label="Event" value={`#${p.id}${p.name ? ` — ${p.name}` : ''}`} />
            ) : null}
            {p.name && proposal.kind !== 'update_event' ? <Field label="Name" value={p.name} /> : null}
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
            {p.description ? <Field label="Workout" value={p.description} pre /> : null}
          </View>

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

function Field({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={[s.fieldValue, pre && s.pre]}>{value}</Text>
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
    clauses: { color: p.muted, fontSize: fontSize.tiny, marginTop: 1 },
    fields: { gap: spacing.sm },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    field: { gap: 1 },
    fieldLabel: { color: p.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
    fieldValue: { color: p.text, fontSize: fontSize.body },
    pre: {
      backgroundColor: p.bg,
      borderRadius: radius.sm,
      padding: spacing.sm,
      lineHeight: 20,
      fontSize: fontSize.small + 1,
      fontFamily: 'Menlo, monospace',
    },
    rationale: { color: p.muted, fontSize: fontSize.small, fontStyle: 'italic', lineHeight: 19 },
    error: { color: p.danger, fontSize: fontSize.small },
    actions: { flexDirection: 'row', gap: spacing.sm },
    hint: { color: p.muted, fontSize: fontSize.tiny, textAlign: 'center' },
  });
