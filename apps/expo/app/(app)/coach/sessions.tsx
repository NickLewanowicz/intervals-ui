/**
 * /coach/sessions — the chat history list (round-10 multi-session). Pinned
 * chats group on top, then Today / Yesterday / Previous 7 / Older by LAST
 * ACTIVITY (docs/research/chat-ui-patterns.md §1). Rows: title, relative
 * last-activity, pin star; long-press or the ⋯ button opens the action menu
 * (Pin / Rename / Delete-with-confirm). Tap switches the chat: the selection
 * rides chat-nav (router.back() can't carry params) and the coach screen
 * hydrates via its session-id guard.
 *
 * DEV ONLY: "Load demo chats" merges the local mock sessions (src/dev/mock-chat)
 * into the list as LOCAL state — never written to PocketBase.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassBar } from '@/components/glass';
import { PressableScale, TypingDots } from '@/components/motion';
import { Button, ErrorBox, Icon, IconButton } from '@/components/ui';
import {
  activityKey,
  groupSessions,
  relativeActivityLabel,
  sortSessions,
  type ChatSessionMeta,
} from '@/lib/chat-sessions';
import { setLoadedDemoSessions, setPendingSelection, takeLoadedDemoSessions } from '@/lib/chat-nav';
import {
  deleteChatSession,
  renameChatSession,
  setChatSessionPinned,
  useChatSessions,
  useInvalidateChatData,
} from '@/lib/queries';
import { fontSize, layout, pageSpacing, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/** A list row: a real PB session, or a loaded demo session. */
interface SessionRow extends ChatSessionMeta {
  demo?: boolean;
}

export default function CoachSessionsScreen() {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const sessions = useChatSessions();
  const invalidate = useInvalidateChatData();

  const [filter, setFilter] = useState('');
  // initialized from the module store so loaded demos survive the round trip
  // (open a demo chat → back to the list → they are still there)
  const [demoSessions, setDemoSessions] = useState<SessionRow[] | null>(takeLoadedDemoSessions());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [menuFor, setMenuFor] = useState<SessionRow | null>(null);
  const [deleting, setDeleting] = useState<SessionRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const rows: SessionRow[] = useMemo(() => {
    const pbRows: SessionRow[] = (sessions.data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      pinned: r.pinned,
      lastActivity: r.lastMessageAt,
      created: r.created,
    }));
    const all = demoSessions ? [...demoSessions, ...pbRows] : pbRows;
    const q = filter.trim().toLowerCase();
    const filtered = q ? all.filter((r) => r.title.toLowerCase().includes(q)) : all;
    return sortSessions(filtered);
  }, [sessions.data, demoSessions, filter]);

  const groups = useMemo(() => groupSessions(rows), [rows]);

  const switchTo = (row: SessionRow) => {
    setPendingSelection(row.demo ? { demoSessionId: row.id } : { sessionId: row.id });
    router.back();
  };

  const newChat = () => {
    setPendingSelection({ sessionId: '' }); // '' = start fresh
    router.back();
  };

  const guard = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      invalidate();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
      setMenuFor(null);
      setDeleting(null);
    }
  };

  const startRename = (row: SessionRow) => {
    setMenuFor(null);
    setRenamingId(row.id);
    setRenameText(row.title);
  };

  const submitRename = () =>
    guard(renamingId ?? '', async () => {
      const title = renameText.trim();
      if (renamingId && title) await renameChatSession(renamingId, title.slice(0, 120));
      setRenamingId(null);
    });

  const demoAvailable = __DEV__ || process.env.EXPO_PUBLIC_MOCK_CHAT === '1';

  const loadDemo = async () => {
    // dynamic import behind the dev gate — Metro keeps the mock data in an
    // async chunk the production entry never fetches (demoAvailable folds to
    // false there and this branch is unreachable)
    if (!demoAvailable) return;
    const mod = await import('@/dev/mock-chat');
    const loaded = mod.loadDemoSessions();
    setLoadedDemoSessions(loaded.sessions);
    setDemoSessions(loaded.sessions.map((d) => ({ ...d })));
  };

  return (
    <KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GlassBar edge="bottom" style={s.headerBar}>
        <View style={s.headerInner}>
          <IconButton icon="chevron-back" label="Back to chat" onPress={() => router.back()} />
          <View style={s.headerTitle}>
            <Text style={s.title}>Chats</Text>
            <Text style={s.subtitle}>Switch, rename, pin or delete</Text>
          </View>
          <Button title="New chat" variant="ghost" icon="add" onPress={newChat} />
        </View>
      </GlassBar>

      <View style={s.searchWrap}>
        <View style={s.searchBox}>
          <Icon name="search-outline" size={15} color={colors.muted} />
          <TextInput
            style={s.searchInput}
            value={filter}
            onChangeText={setFilter}
            placeholder="Search chats…"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Search chats by title"
          />
          {filter ? <IconButton icon="close" label="Clear search" size={16} hitSlop={8} onPress={() => setFilter('')} style={s.searchClear} /> : null}
        </View>
      </View>

      {sessions.isError ? (
        <View style={s.bodyPad}>
          <ErrorBox
            message={(sessions.error as Error)?.message ?? 'Could not load chats'}
            onRetry={() => sessions.refetch()}
          />
        </View>
      ) : sessions.isLoading ? (
        <View style={s.loadingBox}>
          <TypingDots color={colors.muted} />
          <Text style={s.loadingText}>Loading chats…</Text>
        </View>
      ) : groups.length === 0 ? (
        <View style={s.bodyPad}>
          <View style={s.emptyBox}>
            <Icon name="chatbubbles-outline" size={28} color={colors.muted} />
            <Text style={s.emptyText}>
              {filter ? 'No chats match that search.' : 'No chats yet — start one with your coach.'}
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView style={s.list} contentContainerStyle={s.listContent}>
          {groups.map((g) => (
            <View key={g.key}>
              <Text style={s.groupLabel}>{g.label}</Text>
              <View style={s.groupCard}>
                {g.sessions.map((row, i) => (
                  <SessionRowView
                    key={row.id}
                    row={row}
                    first={i === 0}
                    busy={busyId === row.id}
                    renaming={renamingId === row.id}
                    renameText={renameText}
                    onRenameText={setRenameText}
                    onSubmitRename={submitRename}
                    onCancelRename={() => setRenamingId(null)}
                    onOpen={() => switchTo(row)}
                    onMenu={() => {
                      if (!row.demo) setMenuFor(row);
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
          {demoAvailable ? (
            <PressableScale style={s.demoBtn} onPress={demoSessions ? () => setDemoSessions(null) : () => void loadDemo()}>
              <Icon name={demoSessions ? 'close-circle-outline' : 'flask-outline'} size={16} color={colors.accentText} />
              <Text style={s.demoText}>{demoSessions ? 'Hide demo chats' : 'Load demo chats (dev)'}</Text>
            </PressableScale>
          ) : null}
        </ScrollView>
      )}

      {/* long-press action menu */}
      <Modal transparent visible={menuFor !== null} onRequestClose={() => setMenuFor(null)} accessibilityLabel="Chat actions">
        <Pressable style={s.overlay} onPress={() => setMenuFor(null)}>
          <Pressable style={s.menuSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.menuTitle} numberOfLines={1}>
              {menuFor?.title}
            </Text>
            <MenuAction
              icon={menuFor?.pinned ? 'star' : 'star-outline'}
              label={menuFor?.pinned ? 'Unpin' : 'Pin to top'}
              disabled={menuFor?.demo || busyId !== null}
              onPress={() =>
                menuFor &&
                guard(menuFor.id, async () => {
                  await setChatSessionPinned(menuFor.id, !menuFor.pinned);
                })
              }
            />
            <MenuAction
              icon="pencil-outline"
              label="Rename"
              disabled={menuFor?.demo || busyId !== null}
              onPress={() => menuFor && startRename(menuFor)}
            />
            <MenuAction
              icon="trash-outline"
              label="Delete…"
              danger
              disabled={menuFor?.demo || busyId !== null}
              onPress={() => {
                setDeleting(menuFor);
                setMenuFor(null);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* delete confirmation */}
      <Modal transparent visible={deleting !== null} onRequestClose={() => setDeleting(null)} accessibilityLabel="Confirm delete">
        <Pressable style={s.overlay} onPress={() => setDeleting(null)}>
          <Pressable style={s.menuSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.menuTitle} numberOfLines={2}>
              Delete “{deleting?.title}”?
            </Text>
            <Text style={s.menuBody}>The whole conversation is removed. This cannot be undone.</Text>
            {actionError ? <Text style={s.menuError}>{actionError}</Text> : null}
            <View style={s.menuActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setDeleting(null)} style={{ flex: 1 }} />
              <Button
                title="Delete"
                variant="danger"
                icon="trash-outline"
                loading={busyId !== null}
                onPress={() =>
                  deleting &&
                  guard(deleting.id, async () => {
                    await deleteChatSession(deleting.id);
                  })
                }
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

/** One chat row: 44px target, inline rename mode, ⋯ menu trigger. */
function SessionRowView({
  row,
  first,
  busy,
  renaming,
  renameText,
  onRenameText,
  onSubmitRename,
  onCancelRename,
  onOpen,
  onMenu,
}: {
  row: SessionRow;
  first: boolean;
  busy: boolean;
  renaming: boolean;
  renameText: string;
  onRenameText: (t: string) => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  // same fallback the sort uses — legacy rows have no last_message_at yet
  const when = relativeActivityLabel(activityKey(row));
  if (renaming) {
    return (
      <View style={[s.row, s.rowRename]}>
        <TextInput
          style={s.renameInput}
          value={renameText}
          onChangeText={onRenameText}
          autoFocus
          maxLength={120}
          onSubmitEditing={onSubmitRename}
          accessibilityLabel="Chat title"
        />
        <IconButton icon="checkmark" label="Save title" tone="accent" size={17} onPress={onSubmitRename} hitSlop={4} />
        <IconButton icon="close" label="Cancel rename" size={17} onPress={onCancelRename} hitSlop={4} />
      </View>
    );
  }
  return (
    <PressableScale
      onPress={onOpen}
      onLongPress={onMenu}
      accessibilityRole="button"
      accessibilityLabel={`Open chat: ${row.title}`}
      style={[s.row, !first && s.rowBorder, busy && s.rowBusy]}
    >
      <Icon
        name={row.pinned ? 'star' : row.demo ? 'flask-outline' : 'chatbubble-ellipses-outline'}
        size={16}
        color={row.pinned ? colors.accentText : row.demo ? colors.accentText : colors.muted}
      />
      <Text style={s.rowTitle} numberOfLines={1}>
        {row.title}
      </Text>
      {when ? <Text style={s.rowWhen}>{when}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chat actions"
        onPress={onMenu}
        hitSlop={10}
        style={s.rowMenuBtn}
      >
        <Icon name="ellipsis-horizontal" size={16} color={colors.muted} />
      </Pressable>
    </PressableScale>
  );
}

function MenuAction({
  icon,
  label,
  onPress,
  danger,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={s.menuAction}
    >
      <Icon name={icon} size={18} color={danger ? colors.danger : colors.text} />
      <Text style={[s.menuActionText, danger && { color: colors.danger }]}>{label}</Text>
    </PressableScale>
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
    title: { color: p.text, fontSize: fontSize.body, fontWeight: '700' },
    subtitle: { color: p.muted, fontSize: fontSize.tiny, marginTop: 1 },
    searchWrap: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: pageSpacing.navToContent,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      minHeight: layout.minTouch,
    },
    searchInput: { flex: 1, color: p.text, fontSize: fontSize.body, paddingVertical: spacing.sm + 3 },
    searchClear: { width: 32, height: 32, borderRadius: radius.sm },
    list: { flex: 1 },
    listContent: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      padding: spacing.lg,
      paddingBottom: spacing.xxxl + layout.tabBarHeight,
      gap: spacing.md,
    },
    groupLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      letterSpacing: 0.6,
      marginBottom: spacing.xs,
      marginTop: spacing.xs,
    },
    groupCard: {
      backgroundColor: p.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingHorizontal: pageSpacing.rowPadX,
      paddingVertical: pageSpacing.rowPadY,
      minHeight: layout.minTouch,
    },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border },
    rowBusy: { opacity: 0.5 },
    rowTitle: { color: p.text, fontSize: fontSize.body, flexShrink: 1, flexGrow: 1 },
    rowWhen: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontVariant: ['tabular-nums'],
    },
    rowMenuBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    rowRename: { gap: spacing.xs },
    renameInput: {
      flex: 1,
      color: p.text,
      fontSize: fontSize.body,
      backgroundColor: p.bg,
      borderWidth: 1,
      borderColor: p.borderStrong,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
      minHeight: 36,
    },
    loadingBox: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
    loadingText: { color: p.muted, fontSize: fontSize.small },
    bodyPad: { padding: spacing.lg },
    emptyBox: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
      backgroundColor: p.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    emptyText: { color: p.muted, fontSize: fontSize.body, textAlign: 'center' },
    demoBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      alignSelf: 'center',
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      paddingHorizontal: spacing.md,
      minHeight: layout.minTouch,
      backgroundColor: p.card,
    },
    demoText: { color: p.accentText, fontSize: fontSize.small, fontWeight: '600' },
    overlay: {
      flex: 1,
      backgroundColor: p.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    menuSheet: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: p.card,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    menuTitle: { color: p.text, fontSize: fontSize.body, fontWeight: '700', marginBottom: spacing.xs },
    menuBody: { color: p.muted, fontSize: fontSize.small },
    menuError: { color: p.danger, fontSize: fontSize.small },
    menuAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      minHeight: layout.minTouch,
    },
    menuActionText: { color: p.text, fontSize: fontSize.body },
    menuActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  });
