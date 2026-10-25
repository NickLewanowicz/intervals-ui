/**
 * Coach chat. Single rolling session per visit: created on the first message,
 * reset by "New chat". Deltas stream in via SSE; while the first tokens are
 * in flight the coach "breathes" (typing dots); failures render a retryable
 * error row (FIX-9) — never a "(no reply)" bubble. Input dock is glass; the
 * educational footer (FIX-10) sits above it.
 */
import { DEFAULT_MODEL_ID, resolveModel } from '@intervals/core';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassBar } from '@/components/glass';
import { PressableScale, TypingDots } from '@/components/motion';
import { Button, Icon, IconButton } from '@/components/ui';
import { streamChat } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getLocalOrKey } from '@/lib/keystore';
import { streamChatDirect, type DirectChatDone, type DirectChatError } from '@/lib/local-chat';
import { parseCoachMarkdown } from '@/lib/markdown';
import { useChatMessages, useInvalidateMirrors, usePendingProposals } from '@/lib/queries';
import type { Proposal } from '@/lib/records';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import ProposalModal from '@/components/ProposalModal';

const COACH_AVATAR = require('@/assets/coach-avatar.png');

/**
 * Coach replies arrive as light markdown (**bold**, "- " bullets). Round-5
 * persona finding #5: render them instead of shipping literal asterisks.
 * Minimal transform (src/lib/markdown.ts) — no markdown library.
 */
function MarkdownBubble({
  text,
  style,
  streaming,
}: {
  text: string;
  style: TextStyle;
  streaming?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const lines = useMemo(() => parseCoachMarkdown(text), [text]);
  // the streaming caret rides on the last rendered segment
  let caretLine = -1;
  lines.forEach((l, i) => {
    if (l.segs.length > 0) caretLine = i;
  });
  return (
    <View>
      {lines.map((line, i) => {
        if (line.kind === 'gap') return <View key={i} style={s.mdGap} />;
        const caret = streaming && i === caretLine ? '▌' : '';
        if (line.kind === 'bullet') {
          return (
            <View key={i} style={s.mdBulletRow}>
              <Text style={[style, s.mdBulletGlyph]}>•</Text>
              <Text style={[style, s.mdBulletText]}>
                {line.segs.map((seg, j) => (
                  <Text key={j} style={seg.bold ? s.mdBold : undefined}>
                    {j === line.segs.length - 1 ? `${seg.text}${caret}` : seg.text}
                  </Text>
                ))}
              </Text>
            </View>
          );
        }
        return (
          <Text key={i} style={style}>
            {line.segs.map((seg, j) => (
              <Text key={j} style={seg.bold ? s.mdBold : undefined}>
                {j === line.segs.length - 1 ? `${seg.text}${caret}` : seg.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

/** Where chat turns run (ADR-0006): local key → on-device, else via server. */
type Transport = 'device' | 'server';

/**
 * Muted transport chip for the header. Pressing re-checks the local key —
 * the one user-visible trace of the hybrid transport (44px target).
 */
function TransportChip({ transport, onRecheck }: { transport: Transport; onRecheck: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const label = transport === 'device' ? 'on-device' : 'via server';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Chat transport: ${label}. Tap to re-check.`}
      onPress={onRecheck}
      style={s.transportChip}
    >
      <Icon
        name={transport === 'device' ? 'phone-portrait-outline' : 'cloud-outline'}
        size={11}
        color={colors.muted}
      />
      <Text style={s.transportText}>{label}</Text>
    </Pressable>
  );
}

let nextId = 0;
const bubbleId = () => `b${nextId++}`;

export default function CoachScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const pending = usePendingProposals();
  const invalidateMirrors = useInvalidateMirrors();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Proposal | null>(null);
  const [transport, setTransport] = useState<Transport>('server');
  const lastSent = useRef<string | null>(null);

  const history = useChatMessages(sessionId);
  const historyLoadedFor = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const model = resolveModel(user?.preferredModel || undefined);
  // short name only — the full roster label truncates at 375px
  const modelName = model.label.split(' (')[0] ?? model.label;

  // hydrate bubbles from the session history (when a session exists)
  useEffect(() => {
    if (!sessionId || historyLoadedFor.current === sessionId) return;
    if (history.isLoading || !history.data) return;
    historyLoadedFor.current = sessionId;
    setMessages(history.data.map((m) => ({ id: m.id, role: m.role, content: m.content })));
  }, [sessionId, history.isLoading, history.data]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd?.({ animated: false });
  }, [messages]);

  // initial transport guess from the local key; every send re-decides
  useEffect(() => {
    let cancelled = false;
    void getLocalOrKey().then((k) => {
      if (!cancelled) setTransport(k ? 'device' : 'server');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recheckTransport = () => {
    void getLocalOrKey().then((k) => setTransport(k ? 'device' : 'server'));
  };

  const send = async (text: string) => {
    if (!text || sending) return;
    lastSent.current = text;
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

    // ADR-0006: local key → direct client→OpenRouter turn (which may still
    // fall back to the worker pre-stream); no key → worker path, unchanged.
    const localKey = await getLocalOrKey();
    setTransport(localKey ? 'device' : 'server');

    const onDelta = (t: string) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + t } : m)),
      );
    const onProposal = (p: Proposal) => {
      setModal(p);
      void pending.refetch();
    };
    const handleDone = (d: { session_id?: string; proposal_errors?: Array<{ error: string }> } & Partial<DirectChatDone>) => {
      if (d.usedFallback) setTransport('server');
      if (d.session_id) setSessionId(d.session_id);
      if (d.proposal_errors?.length) {
        setError(`Coach proposed an invalid change: ${d.proposal_errors[0]!.error}`);
      }
    };
    const handleError = (e: string | DirectChatError) => {
      if (typeof e !== 'string' && e.usedFallback) setTransport('server');
      setError(typeof e === 'string' ? e : e.message);
    };

    try {
      if (localKey) {
        await streamChatDirect({
          sessionId: sessionId ?? undefined,
          message: text,
          model: user?.preferredModel || DEFAULT_MODEL_ID,
          onDelta,
          onProposal,
          onDone: handleDone as (d: DirectChatDone) => void,
          onError: handleError,
        });
      } else {
        await streamChat({
          sessionId: sessionId ?? undefined,
          message: text,
          model: user?.preferredModel || DEFAULT_MODEL_ID,
          onDelta,
          onProposal,
          onDone: handleDone,
          onError: handleError as (msg: string) => void,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setSending(false);
      // FIX-9: drop the empty assistant shell — the error row replaces it
      setMessages((prev) => prev.filter((m) => !(m.id === assistantId && !m.content)));
      void pending.refetch();
    }
  };

  const retry = () => {
    if (lastSent.current) void send(lastSent.current);
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
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* glass header: coach avatar + model chip (name only — no 375px truncation) */}
      <GlassBar edge="bottom" style={s.headerBar}>
        <View style={s.headerInner}>
          <Image source={COACH_AVATAR} style={s.avatar} accessibilityIgnoresInvertColors />
          <View style={s.headerTitle}>
            <Text style={s.title}>Coach</Text>
            <View style={s.headerMeta}>
              <Text style={s.model} numberOfLines={1}>
                {modelName}
              </Text>
              <TransportChip transport={transport} onRecheck={recheckTransport} />
            </View>
          </View>
          <Button title="New chat" variant="ghost" icon="add" onPress={newChat} />
        </View>
      </GlassBar>
      {pendingError ? (
        <Text style={s.pendingNote}>Proposals unavailable: {pendingError}</Text>
      ) : pendingItems.length > 0 ? (
        <PressableScale
          accessibilityRole="button"
          style={s.pendingBar}
          onPress={() => setModal(pendingItems[0]!)}
        >
          <Icon name="file-tray-full" size={16} color={colors.accentText} />
          <Text style={s.pendingText} numberOfLines={1}>
            {pendingItems.length} pending proposal{pendingItems.length > 1 ? 's' : ''} to review — tap to
            open
          </Text>
        </PressableScale>
      ) : null}

      <ScrollView ref={scrollRef} style={s.list} contentContainerStyle={s.listContent}>
        {messages.length === 0 ? (
          <View style={s.empty}>
            <Image source={COACH_AVATAR} style={s.emptyAvatar} accessibilityIgnoresInvertColors />
            <Text style={s.emptyTitle}>Ask your coach anything.</Text>
            <Text style={s.emptyBody}>
              “Plan my race week.” · “I felt flat on Tuesday — why?” · “Build me back after 2 weeks off.”
            </Text>
            <Text style={s.emptyBody}>
              The coach sees your calendar, recent activities and fatigue. Changes it proposes show up as
              approvals — you decide.
            </Text>
          </View>
        ) : (
          messages.map((m) => (
            <View
              key={m.id}
              style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}
            >
              {m.streaming && !m.content ? (
                <TypingDots color={colors.muted} />
              ) : m.role === 'assistant' ? (
                <MarkdownBubble text={m.content} style={s.bubbleText} streaming={m.streaming} />
              ) : (
                // FIX-2: onAccent (near-white) on the accent fill passes AA in
                // BOTH themes — p.text was 3.1:1 in light. Assistant untouched.
                <Text style={s.bubbleTextUser}>{m.content}</Text>
              )}
            </View>
          ))
        )}
        {error ? (
          <View style={s.errorRow}>
            <Text style={s.errorText} numberOfLines={2}>
              {error}
            </Text>
            <Button title="Retry" variant="danger" icon="refresh" onPress={retry} />
          </View>
        ) : null}
      </ScrollView>

      {/* FIX-10 footer + glass input dock */}
      <View style={{ paddingBottom: insets.bottom + layout.tabBarBottom + layout.tabBarHeight }}>
        <Text style={s.footer}>Educational — not medical advice.</Text>
        <GlassBar edge="none" floating style={s.inputDock}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder={sending ? 'Coach is thinking…' : 'Message your coach…'}
            placeholderTextColor={colors.muted}
            editable={!sending}
            returnKeyType="send"
            onSubmitEditing={() => void send(input.trim())}
          />
          <IconButton
            icon="arrow-up"
            label="Send message"
            tone="accent"
            onPress={() => void send(input.trim())}
            disabled={sending || !input.trim()}
          />
        </GlassBar>
      </View>

      {modal ? <ProposalModal proposal={modal} onResolved={onProposalResolved} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg },
    headerBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
    headerInner: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    headerTitle: { flex: 1, justifyContent: 'center' },
    headerMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      minHeight: layout.minTouch, // the transport chip is a 44px target
    },
    avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: p.borderGlass },
    title: { color: p.text, fontSize: fontSize.body, fontWeight: '700' },
    model: { color: p.muted, fontSize: fontSize.tiny, marginTop: 1, flexShrink: 1 },
    transportChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.card,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    transportText: { color: p.muted, fontSize: fontSize.tiny, fontWeight: '600', letterSpacing: 0.3 },
    pendingNote: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.maxW,
      marginTop: spacing.sm,
      marginHorizontal: spacing.lg,
      color: p.muted,
      fontSize: fontSize.small,
    },
    pendingBar: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.maxW,
      marginTop: spacing.sm,
      marginHorizontal: spacing.lg,
      backgroundColor: p.accentSoft,
      borderColor: p.accent,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      minHeight: layout.minTouch,
    },
    pendingText: { color: p.accentText, fontSize: fontSize.small, fontWeight: '600', flexShrink: 1 },
    list: { flex: 1 },
    listContent: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      padding: spacing.lg,
      gap: spacing.sm,
    },
    empty: { padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
    emptyAvatar: { width: 64, height: 64, borderRadius: 32, marginBottom: spacing.xs },
    emptyTitle: { color: p.text, fontSize: fontSize.h, fontWeight: '600' },
    emptyBody: { color: p.muted, fontSize: fontSize.small, textAlign: 'center', lineHeight: 19 },
    bubble: {
      maxWidth: '84%',
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    bubbleUser: { alignSelf: 'flex-end', backgroundColor: p.accent },
    bubbleAssistant: {
      alignSelf: 'flex-start',
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    bubbleText: { color: p.text, fontSize: fontSize.body, lineHeight: 21 },
    // round-8 FIX-2: user bubbles sit on the accent fill — ink must be the
    // inverted onAccent (5.5:1 light / 5.1:1 dark), not p.text (3.1:1 light).
    bubbleTextUser: { color: p.onAccent, fontSize: fontSize.body, lineHeight: 21 },
    mdGap: { height: spacing.xs },
    mdBulletRow: { flexDirection: 'row', gap: spacing.sm },
    mdBulletGlyph: { color: p.muted },
    mdBulletText: { flexShrink: 1 },
    mdBold: { fontWeight: '700' },
    errorRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: p.card,
      borderColor: p.danger,
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
    },
    errorText: { color: p.danger, fontSize: fontSize.small, flexShrink: 1 },
    footer: {
      color: p.muted,
      fontSize: fontSize.tiny,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    inputDock: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      marginHorizontal: spacing.lg,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
      padding: spacing.sm + 2,
    },
    input: {
      flex: 1,
      flexGrow: 1,
      backgroundColor: p.bg,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.md,
      color: p.text,
      fontSize: fontSize.body,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 3,
      minHeight: layout.minTouch,
    },
  });
