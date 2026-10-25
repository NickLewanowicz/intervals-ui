/**
 * DEV-ONLY demo chats (round-10): rich FAKE sessions the owner can load from
 * the sessions sheet to design against — a fueling-planning chat with headers
 * + a markdown table, a daily-training chat with a proposal flow, and a short
 * Q&A. Demo sessions live purely in local state; NOTHING here is written to
 * PocketBase, and no transport is invoked for them.
 *
 * Tree-shaking: the coach screens only `require()` this module behind
 * `isMockChatEnabled()` (__DEV__ / EXPO_PUBLIC_MOCK_CHAT=1), so production
 * builds drop it in dead-code elimination. Keep this file import-free
 * (data + pure shaping only) so it stays cheap and testable.
 */

export interface MockChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MockChatProposal {
  id: string;
  kind: 'create_event' | 'update_event' | 'delete_event';
  payload: {
    id?: number;
    start_date_local?: string;
    name?: string;
    category?: string;
    type?: string;
    distance?: number;
    moving_time?: number;
    description?: string;
  };
  rationale: string | null;
  status: 'pending' | 'applied' | 'dismissed' | 'failed';
}

export interface MockChatSession {
  id: string;
  title: string;
  pinned: boolean;
  /** ISO last-activity stamp (relative to module load). */
  lastActivity: string;
  messages: MockChatMessage[];
  proposals: MockChatProposal[];
}

export const DEMO_ID_PREFIX = 'demo-';

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

/** A Friday long-run the daily-training chat proposes (Saturday long run follows). */
const proposedLongRun: MockChatProposal = {
  id: `${DEMO_ID_PREFIX}prop-1`,
  kind: 'create_event',
  payload: {
    start_date_local: '2026-10-25T08:00',
    name: 'Long run 28km',
    category: 'WORKOUT',
    type: 'Run',
    distance: 28000,
    moving_time: 9000,
    description: 'Warmup 3km easy\n- 28km @ easy 5:35-5:50 /km, last 4km @ marathon effort\nCooldown 2km walk',
  },
  rationale: 'Build week peaks here — 28km keeps you inside the 30-35% weekly-volume rule.',
  status: 'pending',
};

/** An already-dismissed tweak, so the card row shows more than one status. */
const dismissedTempoMove: MockChatProposal = {
  id: `${DEMO_ID_PREFIX}prop-2`,
  kind: 'update_event',
  payload: {
    id: 147702969,
    start_date_local: '2026-10-23T07:00',
    name: 'Tempo 2x10min',
  },
  rationale: 'Shift around the work trip Thursday.',
  status: 'dismissed',
};

export const MOCK_CHAT_SESSIONS: MockChatSession[] = [
  {
    id: `${DEMO_ID_PREFIX}fueling`,
    title: 'Fueling for the 3-hour long runs',
    pinned: true,
    lastActivity: daysAgo(2),
    messages: [
      { role: 'user', content: 'How should I fuel a 3-hour training run?' },
      {
        role: 'assistant',
        content:
          '## Fueling plan — 3h long run\n\nYour gut is trainable: practice the race plan now, never improvise on race day.\n\n### Carbs\n- **60-90g per hour**, starting at minute 45\n- Alternate gel + drink mix to avoid sweetness fatigue\n\n### Fluid & sodium\n- 500-750ml/hour, more above 20°C\n- **500-1000mg sodium/hour** (you are a salty sweater per your last two hot sessions)\n\n### Schedule\n\n| Time | Carbs | Fluid | Notes |\n|---|---|---|---|\n| 0:00 | — | 250ml | start hydrated |\n| 0:45 | 30g gel | 250ml | `5:45 /km` effort stays aerobic |\n| 1:30 | 30g gel | 250ml | + pinch of salt |\n| 2:15 | 30g gel | 250ml | cola flat works if you fancy it |\n\n---\n\n**Race-day rule**: nothing new inside 6 weeks of the marathon. We rehearse this exact table on the next two long runs.',
      },
      { role: 'user', content: 'What if it is much colder?' },
      {
        role: 'assistant',
        content:
          'Below ~8°C thirst drops ~20% while sweat losses still run. Set a **drink timer**, not a thirst rule, and keep carbs at 60g/hour — cold changes fluid, not fuel.',
      },
    ],
    proposals: [],
  },
  {
    id: `${DEMO_ID_PREFIX}daily`,
    title: 'This week — build to the 28km long run',
    pinned: false,
    lastActivity: hoursAgo(3),
    messages: [
      { role: 'user', content: 'What does my week look like?' },
      {
        role: 'assistant',
        content:
          '## Week at a glance\n\n- **Volume**: 68km planned, your biggest week since September\n- **Load**: ▲ 8% — inside the 10% guardrail, just\n- Fatigue (ATL) is trending up, form (CTL−ATL) is `-12` and falling as designed\n\n### Sessions that matter\n1. **Tue** — Tempo `2x10min` @ 4:55 /km\n2. **Thu** — Easy 10km + 6 strides\n3. **Sat** — Long run, the peak: I propose it below\n\nEverything else is recovery — protect the sleep.',
      },
      { role: 'user', content: 'Add the long run for Saturday then' },
      {
        role: 'assistant',
        content:
          'Here is the Saturday session — 28km with the last 4km at marathon effort, on the rail trail for the closing stretch.',
      },
    ],
    proposals: [proposedLongRun, dismissedTempoMove],
  },
  {
    id: `${DEMO_ID_PREFIX}qa`,
    title: 'Do I need a down week?',
    pinned: false,
    lastActivity: hoursAgo(26),
    messages: [
      { role: 'user', content: 'How is my fueling trending on hard days?' },
      {
        role: 'assistant',
        content:
          'Hard-day intake averages `41g` carbs/hour against the `60g` target — the gap is mostly the Tuesday sessions where you run fasted. A banana before the gun closes half of it.',
      },
    ],
    proposals: [],
  },
];

/** Dev gate: explicit env flag wins; `__DEV__` covers dev servers/sims. */
export function isMockChatEnabled(): boolean {
  return __DEV__ || process.env.EXPO_PUBLIC_MOCK_CHAT === '1';
}

/**
 * Load the demo sessions (call ONLY behind isMockChatEnabled). Returns
 * view-model sessions for the sessions list plus the full map for the coach
 * screen; ids carry the `demo-` prefix so they can never collide with PB ids.
 */
export function loadDemoSessions(): {
  sessions: Array<{
    id: string;
    title: string;
    pinned: boolean;
    lastActivity: string;
    created: string;
    demo: true;
  }>;
  byId: Map<string, MockChatSession>;
} {
  return {
    sessions: MOCK_CHAT_SESSIONS.map((s) => ({
      id: s.id,
      title: s.title,
      pinned: s.pinned,
      lastActivity: s.lastActivity,
      created: s.lastActivity,
      demo: true as const,
    })),
    byId: new Map(MOCK_CHAT_SESSIONS.map((s) => [s.id, s])),
  };
}
