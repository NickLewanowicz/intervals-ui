/**
 * OnboardingSheet (round 23) — a 2-step first-run guide shown right after the
 * first sign-in, when the athlete has not connected their keys yet (PB
 * `onboarded` bool + the local settings-visited fallback, lib/onboarding.ts).
 *
 * Step 1 "Connect intervals.icu" — athlete ID + API key from
 * intervals.icu → Settings → Developer (skippable).
 * Step 2 "Add your OpenRouter key" — powers the AI coach,
 * openrouter.ai/keys (skippable).
 *
 * Finishing (either path) PATCHes `onboarded: true` and lands the athlete on
 * Calendar (the sheet mounts over the (app) shell, so closing IS landing).
 * Skipping the key step sets the local key-missing flag → the coach screen
 * shows the friendly "add your key" banner instead of raw transport errors.
 * Chassis: the standard slide-up Modal + grabber + scrim (ProposalBundleSheet
 * pattern, minus drag-to-close — onboarding closes only via its buttons).
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Icon } from '@/components/ui';
import { setLocalOrKey } from '@/lib/keystore';
import { clearKeyMissingFlag, markKeyMissing, markSettingsVisited } from '@/lib/onboarding';
import { pb } from '@/lib/pb';
import { fontSize, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

export default function OnboardingSheet({
  userId,
  onFinished,
}: {
  userId: string;
  /** Fires after `onboarded` is persisted (or failed — never blocks forever). */
  onFinished: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2>(1);
  const [athleteId, setAthleteId] = useState('');
  const [intervalsKey, setIntervalsKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = async (keySkipped: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await pb.collection('users').update(userId, { onboarded: true });
      if (keySkipped) await markKeyMissing();
    } catch {
      // PB write failed — fall through: the local visited flag below still
      // gates the sheet, so an outage never traps the athlete inside it.
    }
    await markSettingsVisited();
    setBusy(false);
    onFinished();
  };

  const saveStep1 = async () => {
    if (!athleteId.trim() || !intervalsKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await pb.collection('users').update(userId, {
        intervals_athlete_id: athleteId.trim(),
        intervals_api_key: intervalsKey.trim(),
      });
      setIntervalsKey('');
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveStep2 = async () => {
    if (!orKey.trim()) return;
    setBusy(true);
    setError(null);
    try {
      // PB hidden field (worker fallback) + this device's copy (direct path)
      await pb.collection('users').update(userId, { openrouter_api_key: orKey.trim() });
      await setLocalOrKey(orKey.trim());
      await clearKeyMissingFlag();
      await finish(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save — try again.');
      setBusy(false);
    }
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={() => {}}>
      <View style={s.scrim}>
        <Pressable style={s.scrimHit} accessibilityLabel="Onboarding — use the buttons to continue" />
        <View style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={s.grabber} />
          <View style={s.headRow}>
            <View style={s.stepIcon}>
              <Icon
                name={step === 1 ? 'link-outline' : 'sparkles-outline'}
                size={18}
                color={colors.accentText}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>Welcome — 2 quick steps</Text>
              <Text style={s.title}>
                {step === 1 ? 'Connect intervals.icu' : 'Add your OpenRouter key'}
              </Text>
            </View>
            <View style={s.dots}>
              <View style={[s.dot, step === 1 && s.dotOn]} />
              <View style={[s.dot, step === 2 && s.dotOn]} />
            </View>
          </View>

          {step === 1 ? (
            <>
              <Text style={s.body}>
                Your training lives on intervals.icu. Paste your athlete ID and API key from
                intervals.icu → Settings → Developer — the coach reads your calendar and activities
                through them.
              </Text>
              <Field
                label="Athlete ID"
                value={athleteId}
                onChangeText={setAthleteId}
                placeholder="e.g. i123456"
                autoCapitalize="none"
              />
              <Field
                label="API key"
                value={intervalsKey}
                onChangeText={setIntervalsKey}
                placeholder="Paste your intervals.icu API key"
                autoCapitalize="none"
                secureTextEntry
              />
              {error ? <Text style={s.error}>{error}</Text> : null}
              <Button
                title="Save & continue"
                icon="arrow-forward"
                onPress={() => void saveStep1()}
                loading={busy}
                disabled={!athleteId.trim() || !intervalsKey.trim()}
              />
              <Button title="Skip for now" variant="ghost" onPress={() => setStep(2)} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={s.body}>
                Your own OpenRouter key powers the AI coach — create one at openrouter.ai/keys. It
                stays on your account: chat runs on this device when the key is saved locally.
              </Text>
              <Field
                label="OpenRouter API key"
                value={orKey}
                onChangeText={setOrKey}
                placeholder="sk-or-v1-…"
                autoCapitalize="none"
                secureTextEntry
              />
              {error ? <Text style={s.error}>{error}</Text> : null}
              <Button
                title="Save & finish"
                icon="checkmark"
                onPress={() => void saveStep2()}
                loading={busy}
                disabled={!orKey.trim()}
              />
              <Button
                title="Skip for now"
                variant="ghost"
                onPress={() => void finish(true)}
                disabled={busy}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: p.overlay, justifyContent: 'flex-end' },
    scrimHit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    sheet: {
      backgroundColor: p.card,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: 0,
      borderColor: p.border,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.md,
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: p.borderStrong,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
    stepIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: p.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kicker: { color: p.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.6 },
    title: { color: p.text, fontSize: fontSize.h, fontWeight: '700' },
    dots: { flexDirection: 'row', gap: spacing.xs + 2 },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: p.borderStrong,
    },
    dotOn: { backgroundColor: p.accent },
    body: { color: p.muted, fontSize: fontSize.small, lineHeight: 19 },
    error: { color: p.danger, fontSize: fontSize.small },
  });
