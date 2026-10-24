/**
 * Settings: account, intervals.icu connection, AI preferences, units — and
 * the sync status readout. Secret fields are write-only (PB hidden fields);
 * blank means "keep current".
 */
import { MODEL_ROSTER } from '@intervals/core';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Loading, Screen, SectionTitle } from '@/components/ui';
import { triggerSync } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { pb } from '@/lib/pb';
import { useInvalidateMirrors, useSyncState } from '@/lib/queries';
import { colors, fontSize, radius, spacing } from '@/theme';

export default function SettingsScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const syncState = useSyncState();
  const invalidateMirrors = useInvalidateMirrors();

  const [athleteId, setAthleteId] = useState('');
  const [intervalsKey, setIntervalsKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [model, setModel] = useState('');
  const [profile, setProfile] = useState('');
  const [units, setUnits] = useState<'km' | 'mi'>('km');

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setAthleteId(user.intervalsAthleteId);
    setModel(user.preferredModel);
    setProfile(user.athleteProfile);
    setUnits(user.units);
  }, [user]);

  if (!user) return <Loading label="Loading settings…" />;

  const save = async () => {
    setSaving(true);
    setSavedMsg(null);
    setSaveError(null);
    try {
      const patch: Record<string, string> = {
        intervals_athlete_id: athleteId.trim(),
        preferred_model: model,
        athlete_profile: profile,
        units,
      };
      // hidden fields are write-only: only send when the athlete typed one
      if (intervalsKey.trim()) patch.intervals_api_key = intervalsKey.trim();
      if (orKey.trim()) patch.openrouter_api_key = orKey.trim();
      await pb.collection('users').update(user.id, patch);
      await refreshUser(); // reload the auth record into context
      setIntervalsKey('');
      setOrKey('');
      setSavedMsg('Saved.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await triggerSync();
      invalidateMirrors(r);
      setTestMsg(`OK — synced ${r.events ?? 0} events, ${r.activities ?? 0} activities.`);
    } catch (e) {
      setTestMsg(e instanceof Error ? `Failed: ${e.message}` : 'Failed');
    } finally {
      setTesting(false);
    }
  };

  const initial = (user.name || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <Screen>
      <Text style={styles.title}>Settings</Text>

      {/* Account */}
      <SectionTitle>Account</SectionTitle>
      <Card style={styles.accountRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user.name || 'Athlete'}</Text>
          <Text style={styles.userEmail}>{user.email}</Text>
        </View>
        <Button
          title="Sign out"
          variant="danger"
          onPress={() => {
            signOut();
            router.replace('/sign-in');
          }}
        />
      </Card>

      {/* Intervals connection */}
      <SectionTitle>intervals.icu connection</SectionTitle>
      <Card>
        <Field
          label="Athlete ID"
          value={athleteId}
          onChangeText={setAthleteId}
          placeholder="i167187"
          autoCapitalize="none"
          hint="On intervals.icu: Settings → Developer shows both your athlete ID and API key."
        />
        <Field
          label="API key"
          value={intervalsKey}
          onChangeText={setIntervalsKey}
          placeholder="Leave blank to keep the saved key"
          autoCapitalize="none"
          secureTextEntry
          hint="Write-only: the app stores it but never shows it again."
        />
        <Button title={testing ? 'Testing…' : 'Test connection'} variant="ghost" onPress={() => void testConnection()} loading={testing} />
        {testMsg ? <Text style={styles.testMsg}>{testMsg}</Text> : null}
        <SyncStatusCard state={syncState} />
      </Card>

      {/* AI */}
      <SectionTitle>AI coach</SectionTitle>
      <Card>
        <Field
          label="OpenRouter API key"
          value={orKey}
          onChangeText={setOrKey}
          placeholder="Leave blank to keep the saved key"
          autoCapitalize="none"
          secureTextEntry
          hint="BYO key — openrouter.ai/keys. The app never sees the key the worker uses."
        />
        <View style={styles.modelList} accessibilityLabel="Model picker">
          <Text style={styles.fieldLabel}>Model</Text>
          {MODEL_ROSTER.map((m) => {
            const selected = m.id === model;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityLabel={`Model ${m.label}`}
                onPress={() => setModel(m.id)}
                style={[styles.modelRow, selected && styles.modelRowSelected]}
              >
                <Text style={styles.modelRadio}>{selected ? '●' : '○'}</Text>
                <Text style={[styles.modelLabel, selected && { color: colors.text }]}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Field
          label="Athlete profile (given to the coach)"
          value={profile}
          onChangeText={setProfile}
          placeholder={'Goals, current fitness, constraints…\ne.g. Marathon in 12 weeks; current fitness ~55; every Tuesday is run club.'}
          multiline
        />
      </Card>

      {/* Preferences */}
      <SectionTitle>Preferences</SectionTitle>
      <Card>
        <Text style={styles.fieldLabel}>Units</Text>
        <View style={styles.unitsRow}>
          {(['km', 'mi'] as const).map((u) => (
            <Pressable
              key={u}
              accessibilityRole="button"
              accessibilityLabel={`Units ${u}`}
              onPress={() => setUnits(u)}
              style={[styles.unitsBtn, units === u && styles.unitsBtnSelected]}
            >
              <Text style={[styles.unitsText, units === u && { color: colors.text }]}>
                {u === 'km' ? 'Kilometres (km)' : 'Miles (mi)'}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {savedMsg ? <Text style={styles.saved}>{savedMsg}</Text> : null}
      {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      <Button title={saving ? 'Saving…' : 'Save changes'} onPress={() => void save()} loading={saving} />
    </Screen>
  );
}

function SyncStatusCard({ state }: { state: ReturnType<typeof useSyncState> }) {
  if (state.isLoading) return <Text style={styles.syncLine}>Sync status: loading…</Text>;
  if (state.isError) return <Text style={styles.syncLine}>Sync status: unavailable</Text>;
  const row = state.data;
  if (!row) return <Text style={styles.syncLine}>Sync status: never synced</Text>;
  const when = row.lastSync ? new Date(row.lastSync).toLocaleString() : 'unknown';
  return (
    <Text style={styles.syncLine}>
      Sync status: {row.status}
      {row.status === 'error' && row.error ? ` (${row.error.slice(0, 120)})` : ''} · last sync {when}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: '700' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.accent, fontSize: fontSize.h, fontWeight: '700' },
  userName: { color: colors.text, fontSize: fontSize.body, fontWeight: '600' },
  userEmail: { color: colors.muted, fontSize: fontSize.small },
  testMsg: { color: colors.muted, fontSize: fontSize.small },
  syncLine: { color: colors.muted, fontSize: fontSize.tiny },
  fieldLabel: { color: colors.muted, fontSize: fontSize.small },
  modelList: { gap: spacing.xs },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modelRowSelected: { borderColor: colors.accent },
  modelRadio: { color: colors.accent, fontSize: fontSize.small },
  modelLabel: { color: colors.muted, fontSize: fontSize.small, flexShrink: 1 },
  unitsRow: { flexDirection: 'row', gap: spacing.sm },
  unitsBtn: {
    flex: 1,
    padding: spacing.sm + 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
  },
  unitsBtnSelected: { borderColor: colors.accent },
  unitsText: { color: colors.muted, fontSize: fontSize.small, fontWeight: '600' },
  saved: { color: colors.accent, fontSize: fontSize.small, textAlign: 'center' },
  error: { color: colors.danger, fontSize: fontSize.small, textAlign: 'center' },
});
