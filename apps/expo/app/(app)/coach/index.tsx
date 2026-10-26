/**
 * Coach chat (round-10): multi-session via /coach/sessions (the history icon
 * in the header — "New chat" now creates a FRESH session while previous chats
 * stay in the list), a stop button that persists the partial reply, markdown
 * v2 (headers / pipe tables / numbered lists / inline code / dividers),
 * inline proposal cards under the turns that produced them, suggested-reply
 * chips, and copy-on-long-press (hover action on web).
 *
 * Transports (ADR-0006): local key → direct client→OpenRouter, else the
 * Worker; both bump the session's last_message_at, both report the session id
 * the moment it exists (worker `start` event / direct create) so a mid-stream
 * stop still lands the transcript in the right session.
 *
 * DEV ONLY: demo sessions (src/dev/mock-chat) render from local state —
 * nothing is written to PocketBase and no model is called.
 */
import { DEFAULT_MODEL_ID, resolveModel } from '@intervals/core';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Badge, Button, Icon, IconButton } from '@/components/ui';
import { streamChat } from '@/lib/api';
import { attachProposals } from '@/lib/chat-sessions';
import { takePendingSelection } from '@/lib/chat-nav';
import { useAuth } from '@/lib/auth';
import { getLocalOrKey } from '@/lib/keystore';
import { streamChatDirect, type DirectChatDone, type DirectChatError } from '@/lib/local-chat';
import { parseCoachMarkdown, type InlineSeg, type MdBlock, type MdTable } from '@/lib/markdown';
import {
  useChatMessages,
  useInvalidateChatData,
  useInvalidateMirrors,
  usePendingProposals,
  useSessionProposals,
} from '@/lib/queries';
import { proposalTitle } from '@/lib/proposal-diff';
import type { Proposal, ProposalKind } from '@/lib/records';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import ProposalModal from '@/components/ProposalModal';
import ProposalBundleSheet from '@/components/ProposalBundleSheet';
import { groupContaining, groupProposals, type BundleGroup } from '@/lib/proposal-bundles';

const COACH_AVATAR = require('@/assets/coach-avatar.png');

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

/** Min gap between streaming auto-scrolls — batch deltas, no per-token storm. */
const FOLLOW_MS = 120;

/** Static suggested replies (vercel suggested-actions pattern — zero tokens). */
const SUGGESTIONS = [
  'What should I adjust this week?',
  'Build my plan for next week',
  'How’s my fueling?',
] as const;

const PROPOSAL_ICON: Record<ProposalKind, React.ComponentProps<typeof Icon>['name']> = {
  create_event: 'add-circle-outline',
  update_event: 'create-outline',
  delete_event: 'trash-outline',
};

// ---------------------------------------------------------------------------
// Markdown v2 rendering (parse in src/lib/markdown.ts — pure, unit tested)
// ---------------------------------------------------------------------------

/**
 * Renders the parsed blocks; memoized per message so streaming re-parses only
 * the growing bubble. The caret rides the last text-bearing block.
 */
const MarkdownBubble = React.memo(function MarkdownBubble({
  text,
  style,
  streaming,
}: {
  text: string;
  style: TextStyle;
  streaming?: boolean;
}) {
  const { colors } = useTheme();
  const s = mdStyles(colors);
  const blocks = useMemo(() => parseCoachMarkdown(text), [text]);
  const caretIdx = useMemo(() => {
    let idx = -1;
    blocks.forEach((b, i) => {
      if (b.kind !== 'table' && b.kind !== 'gap' && b.segs.length > 0) idx = i;
    });
    return idx;
  }, [blocks]);

  return (
    <View>
      {blocks.map((b: MdBlock, i: number) => {
        if (b.kind === 'gap') return <View key={i} style={s.mdGap} />;
        if (b.kind === 'hr') return <View key={i} style={s.mdHr} />;
        if (b.kind === 'table') return <MdTableView key={i} table={b} bodyStyle={style} />;
        const caret = streaming && i === caretIdx ? '▌' : '';
        if (b.kind === 'header') {
          return (
            <Text key={i} style={b.level === 3 ? s.mdH3 : s.mdH2}>
              {renderSegs(b.segs, s, caret)}
            </Text>
          );
        }
        if (b.kind === 'bullet' || b.kind === 'number') {
          return (
            <View key={i} style={s.mdBulletRow}>
              <Text style={[style, s.mdBulletGlyph]}>{b.kind === 'number' ? (b.marker ?? '•') : '•'}</Text>
              <Text style={[style, s.mdBulletText]}>{renderSegs(b.segs, s, caret)}</Text>
            </View>
          );
        }
        return (
          <Text key={i} style={style}>
            {renderSegs(b.segs, s, caret)}
          </Text>
        );
      })}
    </View>
  );
});

/** Inline segments — bold + `code` chips; the caret rides the last segment. */
function renderSegs(segs: InlineSeg[], s: MdS, caret?: string): React.ReactNode[] {
  return segs.map((seg, j) => (
    <Text key={j} style={[seg.bold ? s.mdBold : null, seg.code ? s.mdCode : null]}>
      {j === segs.length - 1 ? `${seg.text}${caret ?? ''}` : seg.text}
    </Text>
  ));
}

/** Pipe table: emphasized header row, hairline-divided rows, horizontally
 *  scrollable when wide (pacing schedules on phone widths). */
function MdTableView({ table, bodyStyle }: { table: MdTable; bodyStyle: TextStyle }) {
  const { colors } = useTheme();
  const s = mdStyles(colors);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.mdTableScroll}>
      <View style={s.mdTable}>
        <View style={[s.mdTableRow, s.mdTableHead]}>
          {table.header.map((cell, i) => (
            <Text key={i} style={[bodyStyle, s.mdTableCell, s.mdTableHeadCell]}>
              {renderSegs(cell, s)}
            </Text>
          ))}
        </View>
        {table.rows.map((row, r) => (
          <View key={r} style={s.mdTableRow}>
            {row.map((cell, c) => (
              <Text key={c} style={[bodyStyle, s.mdTableCell]}>
                {renderSegs(cell, s)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

type MdS = ReturnType<typeof mdStyles>;

// ---------------------------------------------------------------------------
// Inline proposal cards (LobeChat plugin-card pattern)
// ---------------------------------------------------------------------------

function ProposalCard({ proposal, onPress }: { proposal: Proposal; onPress: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const status = proposal.status ?? 'pending';
  const tone = status === 'applied' ? 'success' : status === 'failed' ? 'danger' : status === 'pending' ? 'accent' : 'muted';
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Proposal: ${proposalTitle(proposal.kind, proposal.payload.name)} — ${status}`}
      style={s.card}
    >
      <View style={s.cardIcon}>
        <Icon name={PROPOSAL_ICON[proposal.kind]} size={15} color={colors.accentText} />
      </View>
      <Text style={s.cardTitle} numberOfLines={1}>
        {proposalTitle(proposal.kind, proposal.payload.name)}
      </Text>
      <Badge label={status} tone={tone} />
    </PressableScale>
  );
}

interface Bubble {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  created?: string;
  /** turn produced proposals but no text — keeps the card row anchored */
  toolOnly?: boolean;
}

/** Where chat turns run (ADR-0006): local key → on-device, else via server. */
type Transport = 'device' | 'server';

/** DEV ONLY: a demo session loaded into local state (never persisted). */
interface DemoState {
  id: string;
  title: string;
  messages: Bubble[];
  proposals: Proposal[];
}

const DEMO_REPLY =
  'Demo mode — this chat lives **only on this device**; the coach isn’t behind it. Every render surface still works here: `paced` tokens, tables, cards and chips.';

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
  const invalidateChatData = useInvalidateChatData();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [liveProposals, setLiveProposals] = useState<Proposal[]>([]);
  const [demo, setDemo] = useState<DemoState | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Proposal | null>(null);
  const [bundle, setBundle] = useState<BundleGroup | null>(null);
  const [transport, setTransport] = useState<Transport>('server');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const lastSent = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followLastAt = useRef(0);
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const history = useChatMessages(demo ? null : sessionId);
  const sessionProposals = useSessionProposals(demo ? null : sessionId);
  const historyLoadedFor = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const model = resolveModel(user?.preferredModel || undefined);
  // short name only — the full roster label truncates at 375px
  const modelName = model.label.split(' (')[0] ?? model.label;

  // hydrate bubbles from the session history (when a session exists). A live
  // turn owns the transcript: while sending, adopting the new session id must
  // NOT clobber the in-flight bubbles (it just marks the guard).
  useEffect(() => {
    if (!sessionId || historyLoadedFor.current === sessionId) return;
    if (sending) {
      historyLoadedFor.current = sessionId;
      return;
    }
    if (history.isLoading || !history.data) return;
    historyLoadedFor.current = sessionId;
    setMessages(
      history.data.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        created: m.created,
        toolOnly: m.toolOnly,
      })),
    );
  }, [sessionId, sending, history.isLoading, history.data]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd?.({ animated: false });
  }, [messages]);

  // BUG-2 (parity-1): the [messages] effect fires per array change, but the
  // assistant bubble keeps growing during streaming and RN lays the grown
  // content out AFTER the effect runs — the final scroll landed ~2 lines
  // short until a manual swipe. Follow both geometry events AFTER layout:
  // onContentSizeChange (streamed growth) and onLayout (the chips row that
  // appears when the stream ends shrinks this ScrollView's viewport WITHOUT
  // changing content size — the second half of the same bug). The
  // trailing-edge throttle keeps it cheap (≤1 scroll per FOLLOW_MS, and the
  // final change always lands).
  const scrollTail = useCallback(() => {
    scrollRef.current?.scrollToEnd?.({ animated: false });
    followLastAt.current = Date.now();
  }, []);
  const followTail = useCallback(() => {
    if (followTimer.current) return;
    const wait = Math.max(0, FOLLOW_MS - (Date.now() - followLastAt.current));
    followTimer.current = setTimeout(() => {
      followTimer.current = null;
      scrollTail();
    }, wait);
  }, [scrollTail]);

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

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (followTimer.current) clearTimeout(followTimer.current);
    };
  }, []);

  // web copy affordance: RNW fires the bubble's hover-out when the pointer
  // moves onto the child button, so the hide is DELAYED and cancelled by the
  // button's own hover-in (classic menu pattern) — otherwise it flaps away
  const showCopy = useCallback((id: string) => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHoveredId(id);
  }, []);
  const scheduleCopyHide = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHoveredId(null), 250);
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setSessionId(null);
    historyLoadedFor.current = null;
    setMessages([]);
    setLiveProposals([]);
    setDemo(null);
    setError(null);
  }, []);

  const switchSession = useCallback((id: string) => {
    if (id === sessionId && !demo) return;
    abortRef.current?.abort();
    setDemo(null);
    setSessionId(id);
    historyLoadedFor.current = null;
    setMessages([]);
    setLiveProposals([]);
    setError(null);
  }, [sessionId, demo]);

  const loadDemoSession = useCallback(async (demoId: string) => {
    // dynamic import: the mock data ships as an async chunk the production
    // entry never fetches (demo sessions are only reachable behind the dev
    // gate in the sessions screen)
    const mod = await import('@/dev/mock-chat');
    const ms = mod.loadDemoSessions().byId.get(demoId);
    if (!ms) return;
    abortRef.current?.abort();
    historyLoadedFor.current = null;
    setSessionId(null);
    setDemo({
      id: ms.id,
      title: ms.title,
      messages: ms.messages.map((m, i) => ({ id: `${ms.id}-m${i}`, role: m.role, content: m.content })),
      proposals: ms.proposals as Proposal[],
    });
    setMessages(ms.messages.map((m, i) => ({ id: `${ms.id}-m${i}`, role: m.role, content: m.content })));
    setLiveProposals(ms.proposals as Proposal[]);
    setError(null);
  }, []);

  // sessions-list selection rides chat-nav (router.back() can't carry params)
  useFocusEffect(
    useCallback(() => {
      const sel = takePendingSelection();
      if (!sel) return;
      if ('demoSessionId' in sel) void loadDemoSession(sel.demoSessionId);
      else if (sel.sessionId === '') newChat();
      else switchSession(sel.sessionId);
    }, [loadDemoSession, newChat, switchSession]),
  );

  const send = async (text: string) => {
    if (!text || sending) return;
    lastSent.current = text;
    setInput('');
    setError(null);
    setSending(true);

    // demo sessions never leave local state
    if (demo) {
      const assistantId = bubbleId();
      setMessages((prev) => [
        ...prev,
        { id: bubbleId(), role: 'user', content: text },
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ]);
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: DEMO_REPLY, streaming: false } : m)),
        );
        setSending(false);
      }, 900);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;

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
    let turnHadProposal = false;
    const turnProposals: Proposal[] = [];
    let openedSingle = false;
    const onProposal = (p: Proposal) => {
      turnHadProposal = true;
      turnProposals.push(p);
      setLiveProposals((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
      void pending.refetch();
      // Singles open mid-stream exactly as before. Bundled items wait for
      // `done`: the group must be complete before the multi-select sheet
      // opens (the first of 3 bundle events must not pop a single modal).
      if (!p.bundleKey) {
        openedSingle = true;
        setModal(p);
      }
    };
    const handleSession = (id: string) => {
      historyLoadedFor.current = id; // the live turn owns the transcript
      setSessionId(id);
    };
    const handleDone = (d: { session_id?: string; proposal_errors?: Array<{ error: string }> } & Partial<DirectChatDone>) => {
      if (d.usedFallback) setTransport('server');
      if (d.session_id) handleSession(d.session_id);
      if (d.proposal_errors?.length) {
        setError(`Coach proposed an invalid change: ${d.proposal_errors[0]!.error}`);
      }
      void openTurnBundle();
    };
    // v2: a turn that bundled 2+ related changes opens the grouped review
    // sheet instead of last-one-wins single modals. Members = the turn's
    // proposals sharing the key, unioned with anything else still pending
    // under it; a LONE bundled change falls back to the single modal.
    const openTurnBundle = async () => {
      const first = turnProposals.find((p) => p.bundleKey);
      if (!first?.bundleKey) return;
      const key = first.bundleKey;
      const seen = new Set<string>();
      const candidates: Proposal[] = [];
      let pendingRows: Proposal[] = [];
      try {
        const res = await pending.refetch();
        pendingRows = res.data ?? [];
      } catch {
        // pending refresh failed — the turn's own members still group
      }
      for (const row of [...turnProposals, ...pendingRows]) {
        if (row.bundleKey === key && !seen.has(row.id)) {
          seen.add(row.id);
          candidates.push(row);
        }
      }
      const group = groupContaining(groupProposals(candidates), first.id);
      if (group?.kind === 'bundle') {
        setModal(null); // the bundle review supersedes any single modal
        setBundle(group);
      } else if (!openedSingle && candidates[0]) {
        setModal(candidates[0]);
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
          signal: ac.signal,
          onDelta,
          onProposal,
          onSession: handleSession,
          onDone: handleDone as (d: DirectChatDone) => void,
          onError: handleError,
        });
      } else {
        await streamChat({
          sessionId: sessionId ?? undefined,
          message: text,
          model: user?.preferredModel || DEFAULT_MODEL_ID,
          signal: ac.signal,
          onDelta,
          onProposal,
          onSession: handleSession,
          onDone: handleDone,
          onError: handleError as (msg: string) => void,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setSending(false);
      abortRef.current = null;
      // stop drops the partial's streaming caret; FIX-9: drop empty shells —
      // EXCEPT a tool-call-only turn, which keeps a muted anchor bubble so the
      // proposal cards have a transcript home
      setMessages((prev) =>
        prev
          .map((m) => (m.id === assistantId && m.streaming ? { ...m, streaming: false } : m))
          .map((m) =>
            m.id === assistantId && !m.content && turnHadProposal ? { ...m, toolOnly: true } : m,
          )
          .filter((m) => !(m.id === assistantId && !m.content && !m.toolOnly)),
      );
      invalidateChatData(); // fresh statuses for the inline cards + list stamps
      void pending.refetch();
    }
  };

  const stop = () => {
    // the transport persists the partial client-side (direct) or server-side
    // (worker `request.signal`); the finally block above settles the UI
    abortRef.current?.abort();
  };

  const retry = () => {
    if (lastSent.current) void send(lastSent.current);
  };

  const copyMessage = async (m: Bubble) => {
    try {
      await Clipboard.setStringAsync(m.content);
      setCopiedId(m.id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1400);
    } catch {
      // clipboard unavailable — silent (dev web http has no clipboard perms)
    }
  };

  const onProposalResolved = (outcome: 'applied' | 'dismissed' | 'closed') => {
    setModal(null);
    if (outcome !== 'closed') invalidateMirrors();
    invalidateChatData(); // card chips live-update after a resolution
    void pending.refetch();
  };

  const onBundleResolved = (outcome: 'applied' | 'dismissed' | 'closed') => {
    setBundle(null);
    if (outcome !== 'closed') invalidateMirrors();
    invalidateChatData();
    void pending.refetch(); // fresh pending count + card statuses
  };

  const pendingItems = pending.data ?? [];
  const pendingError = pending.isError ? (pending.error as Error)?.message : null;

  // the pending bar opens whatever the athlete is most likely reacting to —
  // the NEWEST pending item's review: its bundle sheet when that item belongs
  // to a bundle group (2+ sharing the key), else today's single modal
  const openPendingReview = () => {
    const newest = pendingItems[0];
    if (!newest) return;
    const group = groupContaining(groupProposals(pendingItems), newest.id);
    if (group?.kind === 'bundle') setBundle(group);
    else setModal(newest);
  };

  // a transcript card for a bundled proposal opens the whole group (pending
  // rows only — resolved cards keep the single modal for their status view)
  const openProposal = (p: Proposal) => {
    if (p.bundleKey) {
      const members = pendingItems.filter((x) => x.bundleKey === p.bundleKey);
      if (members.length >= 2) {
        const group = groupContaining(groupProposals(members), p.id);
        if (group?.kind === 'bundle') {
          setBundle(group);
          return;
        }
      }
    }
    setModal(p);
  };

  // transcript cards: query proposals (fresh statuses) + in-flight ones, deduped
  const allProps = useMemo(() => {
    const fromQuery = sessionProposals.data ?? [];
    const ids = new Set(fromQuery.map((p) => p.id));
    return [...fromQuery, ...liveProposals.filter((p) => !ids.has(p.id))];
  }, [sessionProposals.data, liveProposals]);
  const propById = useMemo(() => new Map(allProps.map((p) => [p.id, p])), [allProps]);
  const cards = useMemo(() => attachProposals(messages, allProps), [messages, allProps]);
  // safety net: a proposal whose turn bubble was lost (rare attribution race)
  // still renders — never let a proposal vanish from the transcript
  const orphanCards = useMemo(() => {
    if (messages.length === 0) return [];
    const attached = new Set(Object.values(cards).flat());
    return allProps.filter((p) => !attached.has(p.id));
  }, [messages, cards, allProps]);

  const lastMsg = messages[messages.length - 1];
  const showChips =
    !sending &&
    !error &&
    (messages.length === 0 ||
      (lastMsg?.role === 'assistant' && !lastMsg.streaming));

  const recheckTransport = () => {
    void getLocalOrKey().then((k) => setTransport(k ? 'device' : 'server'));
  };

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* glass header: coach avatar + model chip (name only — no 375px truncation).
          BUG-1 (parity-1): the bar ran under the status bar — pad the top inset
          inline (calendar/index.tsx pattern; web insets are 0 → unchanged). */}
      <GlassBar edge="bottom" style={[s.headerBar, { paddingTop: insets.top + spacing.sm + 2 }]}>
        <View style={s.headerInner}>
          <Image source={COACH_AVATAR} style={s.avatar} accessibilityIgnoresInvertColors />
          <View style={s.headerTitle}>
            <Text style={s.title} numberOfLines={1}>
              {demo ? 'Demo chat' : 'Coach'}
            </Text>
            <View style={s.headerMeta}>
              <Text style={s.model} numberOfLines={1}>
                {demo ? demo.title : modelName}
              </Text>
              <TransportChip transport={transport} onRecheck={recheckTransport} />
            </View>
          </View>
          <View style={s.headerActions}>
            <IconButton icon="time-outline" label="Chat history" onPress={() => router.push('/coach/sessions')} />
            <IconButton icon="add" label="New chat" onPress={newChat} />
          </View>
        </View>
      </GlassBar>
      {pendingError ? (
        <Text style={s.pendingNote}>Proposals unavailable: {pendingError}</Text>
      ) : pendingItems.length > 0 ? (
        <PressableScale
          accessibilityRole="button"
          style={s.pendingBar}
          onPress={openPendingReview}
        >
          <Icon name="file-tray-full" size={16} color={colors.accentText} />
          <Text style={s.pendingText} numberOfLines={1}>
            {pendingItems.length} pending proposal{pendingItems.length > 1 ? 's' : ''} to review — tap to
            open
          </Text>
        </PressableScale>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={s.list}
        contentContainerStyle={s.listContent}
        onContentSizeChange={followTail}
        onLayout={followTail}
      >
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
          messages.map((m) => {
            const turnCards = (cards[m.id] ?? [])
              .map((pid) => propById.get(pid))
              .filter((p): p is Proposal => Boolean(p));
            return (
              <View key={m.id}>
                {m.role === 'assistant' ? (
                  <Pressable
                    onLongPress={() => void copyMessage(m)}
                    onHoverIn={() => showCopy(m.id)}
                    onHoverOut={scheduleCopyHide}
                    accessibilityLabel="Assistant reply — long-press to copy"
                    style={[s.bubble, s.bubbleAssistant]}
                  >
                    {m.streaming && !m.content ? (
                      <TypingDots color={colors.muted} />
                    ) : m.toolOnly && !m.content ? (
                      <View style={s.toolOnlyRow}>
                        <Icon name="file-tray-full" size={13} color={colors.muted} />
                        <Text style={s.toolOnlyText}>Proposed a calendar change — review the card below.</Text>
                      </View>
                    ) : (
                      <MarkdownBubble text={m.content} style={s.bubbleText} streaming={m.streaming} />
                    )}
                    {hoveredId === m.id && Platform.OS === 'web' ? (
                      <View style={s.copyWrap}>
                        <Pressable
                          onHoverIn={() => showCopy(m.id)}
                          onHoverOut={scheduleCopyHide}
                          onPress={() => void copyMessage(m)}
                          accessibilityRole="button"
                          accessibilityLabel="Copy message"
                          style={s.copyBtn}
                        >
                          <Icon
                            name={copiedId === m.id ? 'checkmark' : 'copy-outline'}
                            size={14}
                            color={copiedId === m.id ? colors.success : colors.mutedStrong}
                          />
                        </Pressable>
                      </View>
                    ) : null}
                  </Pressable>
                ) : (
                  <View style={[s.bubble, s.bubbleUser]}>
                    <Text style={s.bubbleTextUser}>{m.content}</Text>
                  </View>
                )}
                {copiedId === m.id ? <Text style={s.copiedNote}>Copied</Text> : null}
                {turnCards.length > 0 ? (
                  <View style={s.cardRow}>
                    {turnCards.map((p) => (
                      <ProposalCard key={p.id} proposal={p} onPress={() => openProposal(p)} />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        {orphanCards.length > 0 ? (
          <View style={s.cardRow}>
            {orphanCards.map((p) => (
              <ProposalCard key={p.id} proposal={p} onPress={() => openProposal(p)} />
            ))}
          </View>
        ) : null}
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
        {showChips ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipsRow}
            style={s.chipsScroll}
          >
            {SUGGESTIONS.map((chip) => (
              <PressableScale
                key={chip}
                onPress={() => void send(chip)}
                accessibilityRole="button"
                accessibilityLabel={`Suggested reply: ${chip}`}
                style={s.chip}
              >
                <Text style={s.chipText} numberOfLines={1}>
                  {chip}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}
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
          {sending ? (
            <IconButton icon="stop" label="Stop generating" tone="accent" onPress={stop} />
          ) : (
            <IconButton
              icon="arrow-up"
              label="Send message"
              tone="accent"
              onPress={() => void send(input.trim())}
              disabled={!input.trim()}
            />
          )}
        </GlassBar>
      </View>

      {modal ? <ProposalModal proposal={modal} onResolved={onProposalResolved} /> : null}
      {bundle ? (
        <ProposalBundleSheet key={bundle.key} group={bundle} onResolved={onBundleResolved} />
      ) : null}
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------

const mdStyles = (p: Palette) =>
  StyleSheet.create({
    mdGap: { height: spacing.xs },
    mdHr: { height: 1, backgroundColor: p.border, marginVertical: spacing.xs + 2 },
    mdH2: {
      color: p.mutedStrong,
      fontSize: fontSize.small,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginTop: spacing.xs,
    },
    mdH3: {
      color: p.muted,
      fontSize: fontSize.small,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 2,
    },
    mdBulletRow: { flexDirection: 'row', gap: spacing.sm },
    mdBulletGlyph: { color: p.muted, fontVariant: ['tabular-nums'] },
    mdBulletText: { flexShrink: 1, flexGrow: 1 },
    mdBold: { fontWeight: '700' },
    mdCode: {
      fontFamily: MONO,
      fontSize: fontSize.small,
      color: p.mutedStrong,
      backgroundColor: p.bg,
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    mdTableScroll: { alignSelf: 'flex-start', maxWidth: '100%', marginVertical: 2 },
    mdTable: {
      borderRadius: radius.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      overflow: 'hidden',
    },
    mdTableRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: p.border,
    },
    mdTableHead: { backgroundColor: p.accentSoft, borderBottomColor: p.borderStrong },
    mdTableCell: { flexShrink: 1, minWidth: 76, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2 },
    mdTableHeadCell: { fontWeight: '700' },
  });

const styles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg },
    // vertical rhythm lives in paddingBottom + the inline insets.top paddingTop
    headerBar: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm + 2 },
    headerInner: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    headerTitle: { flex: 1, justifyContent: 'center' },
    headerActions: { flexDirection: 'row', gap: spacing.xs },
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
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    // assistant replies go full-width so tables/bullets stop wrapping early
    // (research §2); user bubbles stay right-aligned and bubbled
    bubbleUser: { maxWidth: '84%', alignSelf: 'flex-end', backgroundColor: p.accent },
    bubbleAssistant: {
      alignSelf: 'stretch',
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    bubbleText: { color: p.text, fontSize: fontSize.body, lineHeight: 21 },
    toolOnlyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
    toolOnlyText: { color: p.muted, fontSize: fontSize.small, flexShrink: 1 },
    // round-8 FIX-2: user bubbles sit on the accent fill — ink must be the
    // inverted onAccent (5.5:1 light / 5.1:1 dark), not p.text (3.1:1 light).
    bubbleTextUser: { color: p.onAccent, fontSize: fontSize.body, lineHeight: 21 },
    copyWrap: { position: 'absolute', top: 2, right: 2 },
    copyBtn: {
      width: 30,
      height: 30,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    copiedNote: { color: p.muted, fontSize: fontSize.tiny, marginTop: 2 },
    cardRow: { gap: spacing.xs },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      minHeight: layout.minTouch - 4,
    },
    cardIcon: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accentSoft,
    },
    cardTitle: { color: p.text, fontSize: fontSize.small, fontWeight: '600', flexShrink: 1, flexGrow: 1 },
    chipsScroll: { flexGrow: 0 },
    chipsRow: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.lg,
      gap: spacing.sm,
      paddingBottom: spacing.xs,
    },
    chip: {
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.card,
      paddingHorizontal: spacing.md,
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: { color: p.text, fontSize: fontSize.small },
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
