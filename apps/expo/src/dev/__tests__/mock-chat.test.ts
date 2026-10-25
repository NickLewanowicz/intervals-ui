/**
 * Demo-chat dev harness shaping: the FAKE sessions must exercise every render
 * surface (markdown v2 table/headers, proposal cards, chips) and stay
 * structurally valid, or the dev toggle shows a broken transcript.
 */
import { describe, expect, it } from 'vitest';
import { DEMO_ID_PREFIX, MOCK_CHAT_SESSIONS, loadDemoSessions } from '../mock-chat';

describe('MOCK_CHAT_SESSIONS', () => {
  it('contains the three demo scenarios with prefixed ids', () => {
    expect(MOCK_CHAT_SESSIONS).toHaveLength(3);
    for (const s of MOCK_CHAT_SESSIONS) {
      expect(s.id.startsWith(DEMO_ID_PREFIX)).toBe(true);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.messages.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('the fueling chat carries headers + a markdown table (the pacing-schedule win)', () => {
    const fueling = MOCK_CHAT_SESSIONS.find((s) => s.id.endsWith('fueling'))!;
    const longReply = fueling.messages.find((m) => m.role === 'assistant' && m.content.includes('##'))!;
    expect(longReply.content).toContain('| Time | Carbs | Fluid | Notes |');
    expect(longReply.content).toMatch(/^### /m);
    expect(longReply.content).toContain('`5:45 /km`');
  });

  it('the daily-training chat carries a proposal flow with mixed statuses', () => {
    const daily = MOCK_CHAT_SESSIONS.find((s) => s.id.endsWith('daily'))!;
    expect(daily.proposals).toHaveLength(2);
    expect(daily.proposals.map((p) => p.status)).toEqual(['pending', 'dismissed']);
    for (const p of daily.proposals) {
      expect(['create_event', 'update_event', 'delete_event']).toContain(p.kind);
      expect(p.payload.start_date_local ?? p.payload.id).toBeTruthy();
    }
  });

  it('all messages have a clean role/content shape', () => {
    for (const s of MOCK_CHAT_SESSIONS) {
      for (const m of s.messages) {
        expect(['user', 'assistant']).toContain(m.role);
        expect(typeof m.content).toBe('string');
        expect(m.content.length).toBeGreaterThan(0);
      }
      // a turn always starts with the user
      expect(s.messages[0]!.role).toBe('user');
    }
  });
});

describe('loadDemoSessions', () => {
  it('maps sessions to list view-models keyed by id', () => {
    const { sessions, byId } = loadDemoSessions();
    expect(sessions).toHaveLength(MOCK_CHAT_SESSIONS.length);
    expect(sessions.every((s) => s.demo === true)).toBe(true);
    expect(sessions.find((s) => s.id.endsWith('fueling'))?.pinned).toBe(true);
    expect(byId.get(`${DEMO_ID_PREFIX}qa`)?.messages.length).toBe(2);
  });
});
