/**
 * Settings: account, intervals.icu connection, AI preferences, appearance
 * (theme override), units — and the sync status readout (relative time).
 * Secret fields are write-only (PB hidden fields); blank means "keep
 * current", with a hold-to-reveal eye (FIX-8). The model picker shows the
 * saved/default selection and tags the roster default (FIX-7).
 */
import { DEFAULT_MODEL_ID, MODEL_ROSTER } from '@intervals/core';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Field, Icon, Loading, Screen, SectionTitle } from '@/components/ui';
import { triggerSync } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { setLocalOrKey } from '@/lib/keystore';
import { clearKeyMissingFlag, markSettingsVisited } from '@/lib/onboarding';
import { pb } from '@/lib/pb';
import { useInvalidateMirrors, useSyncState } from '@/lib/queries';
import { fontSize, layout, radius, spacing, type Palette, type ThemePreference } from '@/theme';
import { useTheme } from '@/theme-context';
import { relativeTime } from '@/lib/format';

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = [
  { value: 'system', label: 'System', icon: 'contrast-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

/** Profile editor floor — ~6 rows at fontSize.body before it auto-grows. */
const PROFILE_MIN_HEIGHT = 150;
const PROFILE_MAX_CHARS = 4000;

export default function SettingsScreen() {
  const { user, signOut, refreshUser } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const s = styles(colors);
  const syncState = useSyncState();
  const invalidateMirrors = useInvalidateMirrors();

  const [athleteId, setAthleteId] = useState('');
  const [intervalsKey, setIntervalsKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [llmBase, setLlmBase] = useState('');
  const [model, setModel] = useState('');
  const [profile, setProfile] = useState('');
  const [profileHeight, setProfileHeight] = useState(PROFILE_MIN_HEIGHT);
  const [units, setUnits] = useState<'km' | 'mi'>('km');

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setAthleteId(user.intervalsAthleteId);
    setModel(user.preferredModel);
    setProfile(user.athleteProfile);
    setUnits(user.units);
    setLlmBase(user.llmBaseUrl);
  }, [user]);

  // Round 23: a visit here is the local "this athlete knows their way around"
  // fallback for the onboarding gate (lib/onboarding.ts).
  useEffect(() => {
    void markSettingsVisited();
  }, []);

  if (!user) return <Loading label="Loading settings…" />;

  // FIX-7: an empty saved model MEANS the roster default — show it selected
  const effectiveModel = model || DEFAULT_MODEL_ID;

  // persona finding #2: unsaved profile edits are visible, never silent
  const profileDirty = profile !== (user.athleteProfile ?? '');

  const saveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg(null);
    setProfileError(null);
    try {
      // profile only — the page-bottom Save owns the other fields
      await pb.collection('users').update(user.id, { athlete_profile: profile });
      await refreshUser(); // reload the auth record → dirty dot clears
      setProfileMsg('Profile saved.');
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  };

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
        // round 23: optional OpenAI-compatible base (empty clears → OpenRouter)
        llm_base_url: llmBase.trim(),
      };
      // hidden fields are write-only: only send when the athlete typed one
      if (intervalsKey.trim()) patch.intervals_api_key = intervalsKey.trim();
      if (orKey.trim()) {
        patch.openrouter_api_key = orKey.trim();
        // ADR-0006: also keep this device's copy so chat runs on-device;
        // the PB hidden field stays for the worker fallback
        await setLocalOrKey(orKey.trim());
        // the coach's "add your key" banner is obsolete the moment a key lands
        void clearKeyMissingFlag();
      }
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
      <Text style={s.title}>Settings</Text>

      {/* Account */}
      <SectionTitle>Account</SectionTitle>
      <Card style={s.accountRow}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.userName}>{user.name || 'Athlete'}</Text>
          <Text style={s.userEmail}>{user.email}</Text>
          {/* transparency: when this record last changed (any settings save).
              Background profile updates don't exist — this is purely a record
              timestamp, no sync implied. */}
          <Text style={s.userMeta}>Updated {relativeTime(user.updated)}</Text>
        </View>
        <Button
          title="Sign out"
          variant="danger"
          icon="log-out-outline"
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
          hint="Write-only: hold the eye to check what you typed."
        />
        <Button
          title={testing ? 'Testing…' : 'Test connection'}
          variant="ghost"
          icon="pulse-outline"
          onPress={() => void testConnection()}
          loading={testing}
        />
        {testMsg ? <Text style={s.testMsg}>{testMsg}</Text> : null}
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
          hint="BYO key — openrouter.ai/keys. Saving also stores it on this device: chat runs on this device when the key is saved locally."
        />
        <Field
          label="API base URL"
          value={llmBase}
          onChangeText={setLlmBase}
          placeholder="OpenRouter default — leave blank"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="OpenAI-compatible (OpenRouter default · LM Studio · Ollama · OpenAI…). Custom endpoints are used by the direct on-device chat path; the server fallback stays OpenRouter-only."
        />
        <View style={s.modelList} accessibilityLabel="Model picker">
          <Text style={s.fieldLabel}>Model</Text>
          {MODEL_ROSTER.map((m) => {
            const selected = m.id === effectiveModel;
            const isDefault = m.id === DEFAULT_MODEL_ID;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={selected ? { selected: true } : {}}
                accessibilityLabel={`Model ${m.label}`}
                onPress={() => setModel(m.id)}
                style={[s.modelRow, selected && s.modelRowSelected]}
              >
                <View style={[s.radio, selected && { borderColor: colors.accent }]}>
                  {selected ? <View style={[s.radioFill, { backgroundColor: colors.accent }]} /> : null}
                </View>
                <Text style={[s.modelLabel, selected && { color: colors.text }]} numberOfLines={2}>
                  {m.label.split(' (')[0]}
                </Text>
                {isDefault ? (
                  <View style={s.defaultChip}>
                    <Text style={s.defaultChipText}>default</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* Athlete profile — first-class editor card (persona finding #2): the
          coach's system prompt deserves more than a clipped textarea with a
          bottom-only Save. Auto-grows, counts chars, Save sits right here. */}
      <SectionTitle>Athlete profile</SectionTitle>
      <Card>
        <View style={s.profileHead}>
          <Text style={s.fieldLabel}>Given to the coach with every conversation</Text>
          {profileDirty ? (
            <View style={s.dirtyRow}>
              <View style={s.dirtyDot} />
              <Text style={s.dirtyText}>Edited — save to apply</Text>
            </View>
          ) : null}
        </View>
        <TextInput
          accessibilityLabel="Athlete profile"
          style={[s.profileInput, { height: Math.max(PROFILE_MIN_HEIGHT, profileHeight) }]}
          value={profile}
          onChangeText={setProfile}
          onContentSizeChange={(e) => setProfileHeight(e.nativeEvent.contentSize.height)}
          placeholder={
            'Goals, current fitness, constraints…\ne.g. Marathon in 12 weeks; current fitness ~55; every Tuesday is run club.'
          }
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
          maxLength={PROFILE_MAX_CHARS}
        />
        <View style={s.profileMetaRow}>
          <Text style={s.profileHint}>
            Goals, goal times, preferences, constraints (physio protocols). The coach reads this every
            conversation.
          </Text>
          <Text style={[s.charCount, profile.length >= PROFILE_MAX_CHARS - 100 && s.charCountWarn]}>
            {profile.length} / {PROFILE_MAX_CHARS}
          </Text>
        </View>
        <Button
          title={savingProfile ? 'Saving…' : 'Save profile'}
          icon="checkmark-outline"
          onPress={() => void saveProfile()}
          loading={savingProfile}
          disabled={!profileDirty || savingProfile}
        />
        {profileMsg ? <Text style={s.saved}>{profileMsg}</Text> : null}
        {profileError ? <Text style={s.error}>{profileError}</Text> : null}
      </Card>

      {/* Preferences */}
      <SectionTitle>Preferences</SectionTitle>
      <Card>
        <Text style={s.fieldLabel}>Appearance</Text>
        <View style={s.unitsRow}>
          {THEME_OPTIONS.map((opt) => {
            const selected = preference === opt.value;
            return (
              <Pressable
                key={opt.value}
                accessibilityRole="radio"
                accessibilityState={selected ? { selected: true } : {}}
                accessibilityLabel={`Theme ${opt.label}`}
                onPress={() => setPreference(opt.value)}
                style={[s.choiceBtn, selected && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
              >
                <Icon
                  name={opt.icon}
                  size={15}
                  color={selected ? colors.accentText : colors.muted}
                />
                <Text style={[s.choiceText, selected && { color: colors.accentText }]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.fieldLabel}>Units</Text>
        <View style={s.unitsRow}>
          {(['km', 'mi'] as const).map((u) => (
            <Pressable
              key={u}
              accessibilityRole="radio"
              accessibilityState={units === u ? { selected: true } : {}}
              accessibilityLabel={`Units ${u}`}
              onPress={() => setUnits(u)}
              style={[s.choiceBtn, units === u && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}
            >
              <Text style={[s.choiceText, units === u && { color: colors.accentText }]}>
                {u === 'km' ? 'Kilometres (km)' : 'Miles (mi)'}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {savedMsg ? <Text style={s.saved}>{savedMsg}</Text> : null}
      {saveError ? <Text style={s.error}>{saveError}</Text> : null}
      <Button title={saving ? 'Saving…' : 'Save changes'} icon="checkmark-outline" onPress={() => void save()} loading={saving} />
    </Screen>
  );
}

function SyncStatusCard({ state }: { state: ReturnType<typeof useSyncState> }) {
  const { colors } = useTheme();
  if (state.isLoading) return <Text style={styles(colors).syncLine}>Sync status: loading…</Text>;
  if (state.isError) return <Text style={styles(colors).syncLine}>Sync status: unavailable</Text>;
  const row = state.data;
  if (!row) return <Text style={styles(colors).syncLine}>Sync status: never synced</Text>;
  // relative ("2h ago") so sync freshness reads at a glance
  const when = row.lastSync ? relativeTime(row.lastSync) : 'unknown';
  return (
    <Text style={styles(colors).syncLine}>
      Sync status: {row.status}
      {row.status === 'error' && row.error ? ` (${row.error.slice(0, 120)})` : ''} · synced {when}
    </Text>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    title: { color: p.text, fontSize: fontSize.title, fontWeight: '700' },
    accountRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: p.accentSoft,
      borderWidth: 1,
      borderColor: p.borderGlass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: p.accentText, fontSize: fontSize.h, fontWeight: '700' },
    userName: { color: p.text, fontSize: fontSize.body, fontWeight: '600' },
    userEmail: { color: p.muted, fontSize: fontSize.small },
    userMeta: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    testMsg: { color: p.muted, fontSize: fontSize.small },
    syncLine: { color: p.muted, fontSize: fontSize.tiny },
    fieldLabel: { color: p.muted, fontSize: fontSize.small },
    modelList: { gap: spacing.xs },
    modelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      minHeight: layout.minTouch,
    },
    modelRowSelected: { borderColor: p.accent, backgroundColor: p.accentSoft },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioFill: { width: 10, height: 10, borderRadius: 5 },
    modelLabel: { color: p.muted, fontSize: fontSize.small, flexShrink: 1 },
    defaultChip: {
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      paddingHorizontal: 7,
      paddingVertical: 2,
      backgroundColor: p.bg,
    },
    defaultChipText: { color: p.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    unitsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    choiceBtn: {
      flex: 1,
      padding: spacing.sm + 2,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs + 2,
      minHeight: layout.minTouch,
    },
    choiceText: { color: p.muted, fontSize: fontSize.small, fontWeight: '600' },
    saved: { color: p.success, fontSize: fontSize.small, textAlign: 'center' },
    error: { color: p.danger, fontSize: fontSize.small, textAlign: 'center' },
    // athlete profile editor card (persona finding #2)
    profileHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    dirtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
    dirtyDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: p.accent,
    },
    dirtyText: { color: p.accentText, fontSize: fontSize.tiny, fontWeight: '600' },
    profileInput: {
      backgroundColor: p.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      color: p.text,
      fontSize: fontSize.body,
      lineHeight: 21,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      minHeight: PROFILE_MIN_HEIGHT,
    },
    profileMetaRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.md,
    },
    profileHint: { color: p.muted, fontSize: fontSize.tiny, flex: 1, lineHeight: 16 },
    charCount: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontVariant: ['tabular-nums'],
    },
    charCountWarn: { color: p.danger, fontWeight: '700' },
  });
