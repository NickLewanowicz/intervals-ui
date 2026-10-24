import { describe, expect, it } from 'vitest';
import { ProposalValidationError, coachUid, validateEventEx, validateProposal } from '../src/proposal';

describe('validateEventEx', () => {
  it('accepts the minimal coach payload', () => {
    const e = validateEventEx({
      start_date_local: '2026-11-03T06:00',
      category: 'WORKOUT',
      type: 'Run',
      name: 'Tempo run',
      description: 'Warmup\n- 3km Z2 Pace',
      moving_time: 3600,
    });
    expect(e.start_date_local).toBe('2026-11-03T06:00');
  });

  it('accepts seconds and full timestamps', () => {
    expect(() => validateEventEx({ start_date_local: '2026-11-03T06:00:30' })).not.toThrow();
  });

  it('rejects timezone offsets', () => {
    expect(() => validateEventEx({ start_date_local: '2026-11-03T06:00:00Z' })).toThrow(ProposalValidationError);
    expect(() => validateEventEx({ start_date_local: '2026-11-03T06:00+02:00' })).toThrow(ProposalValidationError);
  });

  it('rejects date-only and garbage', () => {
    expect(() => validateEventEx({ start_date_local: '2026-11-03' })).toThrow();
    expect(() => validateEventEx({ start_date_local: 'tomorrow' })).toThrow();
    expect(() => validateEventEx('nope')).toThrow();
  });

  it('rejects bad category/type', () => {
    expect(() => validateEventEx({ start_date_local: '2026-11-03T06:00', category: 'RACE' })).toThrow(/category/);
    expect(() => validateEventEx({ start_date_local: '2026-11-03T06:00', type: 'Sprint' })).toThrow(/type/);
  });

  it('rejects negative distance', () => {
    expect(() => validateEventEx({ start_date_local: '2026-11-03T06:00', distance: -5 })).toThrow(/distance/);
  });

  it('rejects malformed uid', () => {
    expect(() => validateEventEx({ start_date_local: '2026-11-03T06:00', uid: 'not-a-uuid' })).toThrow(/uid/);
  });
});

describe('validateProposal', () => {
  it('maps propose_event (bare) to create_event', () => {
    const p = validateProposal('propose_event', {
      start_date_local: '2026-11-03T06:00',
      name: 'Long run',
      category: 'RACE_A',
      rationale: 'goal race',
    });
    expect(p.kind).toBe('create_event');
    expect(p.payload.category).toBe('RACE_A');
    expect(p.rationale).toBe('goal race');
  });

  it('maps propose_event with {event} wrapper', () => {
    const p = validateProposal('propose_event', {
      event: { start_date_local: '2026-11-03T06:00', name: 'Long run' },
    });
    expect(p.kind).toBe('create_event');
  });

  it('update_event requires id or uid', () => {
    expect(() => validateProposal('update_event', { name: 'x' })).toThrow(/id/);
    const p = validateProposal('update_event', { id: 145969946, name: 'x' });
    expect(p.kind).toBe('update_event');
    expect(p.payload.id).toBe(145969946);
  });

  it('delete_event requires id', () => {
    expect(() => validateProposal('delete_event', {})).toThrow(/id/);
    expect(validateProposal('delete_event', { id: 1 }).kind).toBe('delete_event');
  });

  it('unknown tools throw', () => {
    expect(() => validateProposal('create_workout', {})).toThrow(/unknown proposal tool/);
  });
});

describe('coachUid', () => {
  it('is deterministic and uuid-shaped', () => {
    const a = coachUid('session-1', '2026-11-03T06:00');
    const b = coachUid('session-1', '2026-11-03T06:00');
    const c = coachUid('session-1', '2026-11-04T06:00');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
