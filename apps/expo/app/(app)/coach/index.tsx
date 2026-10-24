/**
 * Coach chat. Single rolling session per visit: created on the first message,
 * reset by "New chat". Deltas stream in via SSE; proposals open the modal.
 */
import { DEFAULT_MODEL_ID, resolveModel } from '@intervals/core';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '@/components/ui';
import { streamChat } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useChatMessages, useInvalidateMirrors, usePendingProposals } from '@/lib/queries';
import type { Proposal } from '@/lib/records';
import { colors, fontSize, radius, spacing } from '@/theme';
import ProposalModal from '@/components/ProposalModal';

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

let nextId = 0;
const bubbleId = () => `b${nextId++}`;

export default function CoachScreen() {
  const { user } = useAuth();
  const pending = usePendingProposals();
  const invalidateMirrors = useInvalidateMirrors();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Proposal | null>(null);

  const history = useChatMessages(sessionId);
  const historyLoadedFor = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const model = resolveModel(user?.preferredModel || undefined);

  // hydrate bubbles from the session history (when a session exists)
  useEffect(() => {
    if (!sessionId || historyLoadedFor.current === sessionId) return;
    if (history.isLoading || !history.data) return;
    historyLoadedFor.current = sessionId;
    setMessages(
      history.data.map((m) => ({ id: m.id, role: m.role, content: m.content })),
    );
  }, [sessionId, history.isLoading, history.data]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd?.({ animated: false });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    const userBubble: Bubble = { id: bubbleId(), role: 'user', content: text };
    const assistantId = bubbleId();
    setMessages((prev) => [
      ...prev,
      userBubble,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);

    try {
      await streamChat({
        sessionId: sessionId ?? undefined,
        message: text,
        model: user?.preferredModel || DEFAULT_MODEL_ID,
        onDelta: (t) =>
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + t } : m)),
          ),
        onProposal: (p) => {
          setModal(p);
          void pending.refetch();
        },
        onDone: (d) => {
          if (d.session_id) setSessionId(d.session_id);
          if (d.proposal_errors?.length) {
            setError(`Coach proposed an invalid change: ${d.proposal_errors[0]!.error}`);
          }
        },
        onError: (msg) => setError(msg),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setSending(false);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, content: m.content || '(no reply)' } : m)),
      );
      void pending.refetch();
    }
  };

  const newChat = () => {
    setSessionId(null);
    historyLoadedFor.current = null;
    setMessages([]);
    setError(null);
  };

  const onProposalResolved = (outcome: 'applied' | 'dismissed' | 'closed') => {
    setModal(null);
    if (outcome !== 'closed') invalidateMirrors();
    void pending.refetch();
  };

  const pendingItems = pending.data ?? [];
  const pendingError = pending.isError ? (pending.error as Error)?.message : null;

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' && typeof document === 'undefined' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Coach</Text>
          <Text style={styles.model} numberOfLines={1}>
            Model: {model.label}
          </Text>
        </View>
        <Button title="New chat" variant="ghost" onPress={newChat} disabled={sending && !sessionId} />
      </View>

      {pendingError ? (
        <Text style={styles.pendingNote}>Proposals unavailable: {pendingError}</Text>
      ) : pendingItems.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          style={styles.pendingBar}
          onPress={() => setModal(pendingItems[0]!)}
        >
          <Text style={styles.pendingText}>
            {pendingItems.length} pending proposal{pendingItems.length > 1 ? 's' : ''} to review —
            tap to open
          </Text>
        </Pressable>
      ) : null}

      <ScrollView ref={scrollRef} style={styles.list} contentContainerStyle={styles.listContent}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask your coach anything.</Text>
            <Text style={styles.emptyBody}>
              “Plan my race week.” · “I felt flat on Tuesday — why?” · “Build me back after 2 weeks
              off.”
            </Text>
            <Text style={styles.emptyBody}>
              The coach sees your calendar, recent activities and fatigue. Changes it proposes show
              up as approvals — you decide.
            </Text>
          </View>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}
            >
              <Text style={styles.bubbleText}>
                {m.content}
                {m.streaming ? '▌' : ''}
              </Text>
            </View>
          ))
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={sending ? 'Coach is thinking…' : 'Message your coach…'}
          placeholderTextColor={colors.muted}
          editable={!sending}
          returnKeyType="send"
          onSubmitEditing={() => void send()}
        />
        <Button
          title={sending ? '…' : 'Send'}
          onPress={() => void send()}
          disabled={sending || !input.trim()}
        />
      </View>

      {modal ? <ProposalModal proposal={modal} onResolved={onProposalResolved} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { color: colors.text, fontSize: fontSize.title, fontWeight: '700' },
  model: { color: colors.muted, fontSize: fontSize.small, marginTop: 2 },
  pendingNote: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.muted,
    fontSize: fontSize.small,
  },
  pendingBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  pendingText: { color: colors.accent, fontSize: fontSize.small, fontWeight: '600' },
  list: { flex: 1 },
  listContent: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  empty: { padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  emptyTitle: { color: colors.text, fontSize: fontSize.h, fontWeight: '600' },
  emptyBody: { color: colors.muted, fontSize: fontSize.small, textAlign: 'center', lineHeight: 19 },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  bubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: fontSize.body, lineHeight: 21 },
  error: { color: colors.danger, fontSize: fontSize.small, padding: spacing.sm },
  inputRow: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: fontSize.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
  },
});
