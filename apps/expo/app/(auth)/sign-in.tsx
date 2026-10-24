/**
 * Email + password sign-in (PocketBase). Google OAuth is pending a consent
 * screen — the button ships disabled.
 */
import { Link, router } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, fontSize, spacing } from '@/theme';

export default function SignInPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.wrap}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Your training, coached.</Text>

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
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={onSubmit} loading={busy} />
          <Button title="Google — coming soon" variant="ghost" disabled />
        </Card>

        <Link href="/" replace>
          <Text style={styles.back}>← Back</Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center' },
  wrap: { maxWidth: 420, width: '100%', alignSelf: 'center', padding: spacing.lg, gap: spacing.lg },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: fontSize.body, marginTop: -spacing.sm },
  error: { color: colors.danger, fontSize: fontSize.small },
  back: { color: colors.muted, fontSize: fontSize.small, textAlign: 'center', padding: spacing.sm },
});
