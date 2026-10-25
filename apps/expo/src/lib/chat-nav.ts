/**
 * In-memory bridge between /coach/sessions and the coach chat screen. Expo
 * Router can't pass params on `router.back()`, so a selection is stashed here
 * and consumed by the coach screen on focus. Module state is per-app-launch —
 * exactly right for a UI gesture.
 *
 * The demo-session type import is type-only (erased at build), so production
 * bundles never pull the dev mock data in via this module.
 */
import type { ChatSessionMeta } from '@/lib/chat-sessions';
import type { MockChatSession } from '@/dev/mock-chat';

export type SessionSelection = { sessionId: string } | { demoSessionId: string };

let pending: SessionSelection | null = null;

export function setPendingSelection(sel: SessionSelection): void {
  pending = sel;
}

/** Consume the stashed selection (null when there is none). */
export function takePendingSelection(): SessionSelection | null {
  const p = pending;
  pending = null;
  return p;
}

/**
 * Loaded demo chats survive screen remounts (open one → back to the list →
 * they are still there). Module state — DEV ONLY, never persisted.
 */
let demoSessions: ChatSessionMeta[] | null = null;

export function setLoadedDemoSessions(rows: ChatSessionMeta[]): void {
  demoSessions = rows;
}

export function takeLoadedDemoSessions(): ChatSessionMeta[] | null {
  return demoSessions;
}

/** The shape the coach screen needs to render a demo (local-only) session. */
export type DemoChatSession = MockChatSession;
