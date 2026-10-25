/**
 * chat-sessions (multi-session list logic, pure): activity sort, time
 * grouping, relative labels, word-boundary title truncation, proposal→turn
 * attribution for the inline cards.
 */
import { describe, expect, it } from 'vitest';
import {
  activityKey,
  attachProposals,
  groupSessions,
  relativeActivityLabel,
  sortSessions,
  titleFromMessage,
  type ChatSessionMeta,
} from '../chat-sessions';

const NOW = new Date('2026-10-24T15:00:00'); // local Saturday afternoon

const mk = (over: Partial<ChatSessionMeta> & { id: string }): ChatSessionMeta => ({
  title: over.id,
  pinned: false,
  lastActivity: '',
  created: '',
  ...over,
});

const iso = (dayTime: string) => `2026-10-${dayTime}`;

describe('sortSessions', () => {
  it('pins first, then orders by last activity (newest first)', () => {
    const rows = [
      mk({ id: 'a', lastActivity: iso('24T09:00:00.000') }),
      mk({ id: 'b', lastActivity: iso('20T09:00:00.000'), pinned: true }),
      mk({ id: 'c', lastActivity: iso('23T09:00:00.000') }),
      mk({ id: 'd', created: iso('01T09:00:00.000') }), // no activity → falls back to created
    ];
    expect(sortSessions(rows).map((s) => s.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('does not mutate the input', () => {
    const rows = [mk({ id: 'a', created: '2026-01-02T00:00:00Z' }), mk({ id: 'b', created: '2026-01-03T00:00:00Z' })];
    sortSessions(rows);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('activityKey falls back from lastActivity to created', () => {
    expect(activityKey(mk({ id: 'x', created: 'c', lastActivity: 'l' }))).toBe('l');
    expect(activityKey(mk({ id: 'x', created: 'c', lastActivity: '' }))).toBe('c');
  });
});

describe('groupSessions', () => {
  const rows = [
    mk({ id: 'pinned-old', pinned: true, lastActivity: iso('02T10:00:00.000') }),
    mk({ id: 'today', lastActivity: iso('24T09:14:00.000') }),
    mk({ id: 'today-2', lastActivity: iso('24T00:30:00.000') }),
    mk({ id: 'yesterday', lastActivity: iso('23T22:00:00.000') }),
    mk({ id: 'within7', lastActivity: iso('20T12:00:00.000') }),
    mk({ id: 'day8', lastActivity: iso('16T12:00:00.000') }),
    mk({ id: 'ancient', created: iso('01T12:00:00.000') }),
  ];

  it('emits PINNED / TODAY / YESTERDAY / PREVIOUS 7 DAYS / OLDER in order', () => {
    const groups = groupSessions(rows, NOW);
    expect(groups.map((g) => g.key)).toEqual(['pinned', 'today', 'yesterday', 'previous7', 'older']);
    expect(groups[0]!.label).toBe('PINNED');
    expect(groups[0]!.sessions.map((s) => s.id)).toEqual(['pinned-old']);
    expect(groups[1]!.sessions.map((s) => s.id)).toEqual(['today', 'today-2']);
    expect(groups[2]!.sessions.map((s) => s.id)).toEqual(['yesterday']);
    expect(groups[3]!.sessions.map((s) => s.id)).toEqual(['within7']);
    expect(groups[4]!.sessions.map((s) => s.id)).toEqual(['day8', 'ancient']);
  });

  it('omits empty groups', () => {
    const groups = groupSessions([mk({ id: 'a', lastActivity: iso('24T08:00:00.000') })], NOW);
    expect(groups.map((g) => g.key)).toEqual(['today']);
  });

  it('a pinned session never also appears in a time group', () => {
    const groups = groupSessions(
      [mk({ id: 'p', pinned: true, lastActivity: iso('24T08:00:00.000') })],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('pinned');
  });

  it('unparsable activity stamps land in OLDER instead of throwing', () => {
    const groups = groupSessions([mk({ id: 'x', lastActivity: 'not-a-date' })], NOW);
    expect(groups[0]!.key).toBe('older');
  });
});

describe('relativeActivityLabel', () => {
  it('shows "now" under a minute and HH:MM within today', () => {
    expect(relativeActivityLabel('2026-10-24T14:59:30Z', new Date('2026-10-24T15:00:00Z'))).toBe('now');
    const label = relativeActivityLabel('2026-10-24T09:14:00', NOW);
    expect(label).toMatch(/^\d{2}:\d{2}$/);
  });

  it('compact day/week labels, then a month-day fallback', () => {
    expect(relativeActivityLabel('2026-10-23T12:00:00', NOW)).toBe('1d');
    expect(relativeActivityLabel('2026-10-20T12:00:00', NOW)).toBe('4d');
    expect(relativeActivityLabel('2026-10-08T12:00:00', NOW)).toBe('2w');
    expect(relativeActivityLabel('2026-05-14T12:00:00', NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });

  it('blank or unparsable stamps yield an empty label', () => {
    expect(relativeActivityLabel('', NOW)).toBe('');
    expect(relativeActivityLabel('nope', NOW)).toBe('');
  });
});

describe('titleFromMessage', () => {
  it('keeps short messages verbatim', () => {
    expect(titleFromMessage('What does my week look like?')).toBe('What does my week look like?');
  });

  it('truncates at a word boundary near the limit with an ellipsis', () => {
    const t = titleFromMessage('Tell me about my long run paces for the marathon block please coach');
    expect(t.length).toBeLessThanOrEqual(49);
    expect(t.endsWith('…')).toBe(true);
    expect(t.endsWith(' …')).toBe(false);
    expect(/[\w)]…$/.test(t)).toBe(true); // cut after a word character, not mid-word
  });

  it('collapses whitespace and trims', () => {
    expect(titleFromMessage('  hi   there   \n')).toBe('hi there');
    expect(titleFromMessage('')).toBe('');
  });
});

describe('attachProposals (inline transcript cards)', () => {
  const turns = [
    { id: 'u1', role: 'user' as const, created: '2026-10-24T09:00:00Z' },
    { id: 'a1', role: 'assistant' as const, created: '2026-10-24T09:00:05Z' },
    { id: 'u2', role: 'user' as const, created: '2026-10-24T09:05:00Z' },
    { id: 'a2', role: 'assistant' as const, created: '2026-10-24T09:05:05Z' },
  ];

  it('stamped proposals attach to the latest assistant turn persisted before them', () => {
    const map = attachProposals(turns, [
      { id: 'p1', created: '2026-10-24T09:00:06Z' },
      { id: 'p2', created: '2026-10-24T09:05:06Z' },
    ]);
    expect(map).toEqual({ a1: ['p1'], a2: ['p2'] });
  });

  it('an unstamped (in-flight) proposal attaches to the last assistant turn', () => {
    const map = attachProposals(turns, [{ id: 'live' }]);
    expect(map).toEqual({ a2: ['live'] });
  });

  it('unstamped proposals prefer the streaming bubble over stamped history', () => {
    const streaming = [...turns, { id: 'a3', role: 'assistant' as const }];
    const map = attachProposals(streaming, [{ id: 'p1', created: '2026-10-24T09:00:06Z' }, { id: 'live' }]);
    expect(map).toEqual({ a1: ['p1'], a3: ['live'] });
  });

  it('a stamped proposal newer than every stamped turn attaches to the live bubble', () => {
    const streaming = [...turns, { id: 'a3', role: 'assistant' as const }];
    const map = attachProposals(streaming, [{ id: 'fresh', created: '2026-10-24T09:30:00Z' }]);
    expect(map).toEqual({ a3: ['fresh'] });
  });

  it('with no live bubble, a proposal newer than all stamps lands on the last turn', () => {
    const map = attachProposals(turns, [{ id: 'tail', created: '2026-10-24T09:30:00Z' }]);
    expect(map).toEqual({ a2: ['tail'] });
  });

  it('no assistant turns → nothing attaches', () => {
    expect(attachProposals([{ id: 'u1', role: 'user' }], [{ id: 'p' }])).toEqual({});
  });
});
