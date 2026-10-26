/**
 * Email + password sign-in (PocketBase). Google OAuth is pending a consent
 * screen — the button ships disabled. The marketing splash is web-only, so
 * the "Back" link is web-only too (native opens here).
 */
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

export default function SignInPage() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const { signIn, ready, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A persisted session restored by AuthProvider lands here (hydration
  // completes after the guard redirect) — walk the athlete into the app.
  useEffect(() => {
    if (ready && user) router.replace('/(app)/calendar');
  }, [ready, user]);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/calendar');
    } catch (e) {
      setError(
        e instanceof Error && /invalid|credentials/i.test(e.message)
          ? 'Invalid email or password.'
          : 'Could not sign in — check your connection and try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[s.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.wrap}>
        <View style={s.brandRow}>
          <View style={s.brandMark}>
            <Ionicons name="flash" size={20} color={colors.onAccent} />
          </View>
          <Text style={s.title}>Sign in</Text>
        </View>
        <Text style={s.subtitle}>Your training, coached.</Text>

        <Card>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            textContentType="password"
          />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Button title={busy ? 'Signing in…' : 'Sign in'} icon="arrow-forward" onPress={onSubmit} loading={busy} />
          <Button title="Google — coming soon" variant="ghost" icon="logo-google" disabled />
        </Card>

        {Platform.OS === 'web' ? (
          <Link href="/" replace>
            <View style={s.backHit}>
              <Text style={s.back}>← Back</Text>
            </View>
          </Link>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg, justifyContent: 'center' },
    wrap: {
      maxWidth: 420,
      width: '100%',
      alignSelf: 'center',
      padding: spacing.lg,
      gap: spacing.lg,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    brandMark: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: p.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: p.text, fontSize: fontSize.title, fontWeight: '700' },
    subtitle: { color: p.muted, fontSize: fontSize.body, marginTop: -spacing.sm },
    error: { color: p.danger, fontSize: fontSize.small },
    // F17: the link's hit area is a real padded box (was padding on the Text,
    // leaving a 343x16.5 anchor underfilling its own visual)
    backHit: {
      alignSelf: 'center',
      minHeight: layout.minTouch,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    back: { color: p.muted, fontSize: fontSize.small, textAlign: 'center' },
  });
