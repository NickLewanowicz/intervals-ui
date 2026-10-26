/**
 * proposal-bundles (proposal-approval v2 §2) — client-side grouping of pending
 * proposals by bundle_key: 2+ members form one reviewable bundle, a lone
 * carrier stays single, ordering is oldest-first throughout, and the shared
 * rationale is the most frequent item rationale.
 */
import { describe, expect, it } from 'vitest';
import {
  groupContaining,
  groupProposals,
  sharedRationale,
  type ProposalGroup,
} from '../proposal-bundles';
import type { Proposal } from '../records';

let seq = 0;
const prop = (over: Partial<Proposal> = {}): Proposal => {
  const id = over.id ?? `p${seq++}`;
  return {
    id,
    kind: 'update_event',
    payload: { id: 100 + Number(id.slice(1) || '0'), start_date_local: '2026-10-28T07:00' },
    rationale: 'cut easy volume',
    status: 'pending',
    ...over,
  };
};

const kindOf = (g: ProposalGroup) => g.kind;

describe('groupProposals', () => {
  it('groups 2+ proposals sharing a bundle_key into one ordered bundle', () => {
    const a = prop({ id: 'a', created: '2026-10-24T09:00:00Z', bundleKey: 'rebuild-week', bundleSummary: 'Rebuild week — cutting easy volume' });
    const b = prop({ id: 'b', created: '2026-10-24T09:00:05Z', bundleKey: 'rebuild-week', bundleSummary: 'Rebuild week — cutting easy volume' });
    const groups = groupProposals([b, a]); // input order must not matter
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(kindOf(g)).toBe('bundle');
    if (g.kind !== 'bundle') return;
    expect(g.key).toBe('rebuild-week');
    expect(g.summary).toBe('Rebuild week — cutting easy volume');
    expect(g.proposals.map((p) => p.id)).toEqual(['a', 'b']); // oldest-first inside
  });

  it('keeps a LONE bundle-key carrier single (a bundle of one is a proposal)', () => {
    const lone = prop({ id: 'lone', bundleKey: 'rebuild-week', bundleSummary: 'Rebuild week' });
    const groups = groupProposals([lone]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual({ kind: 'single', proposal: lone });
  });

  it('keeps ungrouped proposals single and orders groups oldest-first', () => {
    const old = prop({ id: 'old', created: '2026-10-23T08:00:00Z' });
    const midA = prop({ id: 'mid-a', created: '2026-10-24T08:00:00Z', bundleKey: 'k' });
    const midB = prop({ id: 'mid-b', created: '2026-10-24T08:00:10Z', bundleKey: 'k' });
    const fresh = prop({ id: 'fresh', created: '2026-10-24T10:00:00Z' });
    const groups = groupProposals([fresh, midB, midA, old]); // newest-first input
    expect(groups.map(kindOf)).toEqual(['single', 'bundle', 'single']);
    expect(groups[0]).toMatchObject({ kind: 'single', proposal: { id: 'old' } });
    expect(groups[2]).toMatchObject({ kind: 'single', proposal: { id: 'fresh' } });
    if (groups[1]!.kind !== 'bundle') return expect.fail('expected bundle in the middle');
    expect(groups[1].proposals.map((p) => p.id)).toEqual(['mid-a', 'mid-b']);
  });

  it('separates distinct bundle keys and falls back to id order without created', () => {
    const a1 = prop({ id: 'a1', bundleKey: 'k1' });
    const a2 = prop({ id: 'a2', bundleKey: 'k1' });
    const b1 = prop({ id: 'b1', bundleKey: 'k2' });
    const b2 = prop({ id: 'b2', bundleKey: 'k2' });
    const groups = groupProposals([b2, a2, b1, a1]);
    expect(groups.map(kindOf)).toEqual(['bundle', 'bundle']);
    if (groups[0]!.kind !== 'bundle' || groups[1]!.kind !== 'bundle') return;
    expect(groups[0].key).toBe('k1');
    expect(groups[1].key).toBe('k2');
  });

  it('orders by id when created stamps are missing (stable, no throws)', () => {
    const x = prop({ id: 'x', bundleKey: 'k' });
    const y = prop({ id: 'y', bundleKey: 'k' });
    const groups = groupProposals([y, x]);
    if (groups[0]!.kind !== 'bundle') return expect.fail('expected bundle');
    expect(groups[0].proposals.map((p) => p.id)).toEqual(['x', 'y']);
  });

  it('returns [] for an empty pending set', () => {
    expect(groupProposals([])).toEqual([]);
  });
});

describe('groupContaining', () => {
  it('finds the bundle group by member id and null for unknown ids', () => {
    const a = prop({ id: 'a', bundleKey: 'k', bundleSummary: 'S' });
    const b = prop({ id: 'b', bundleKey: 'k', bundleSummary: 'S' });
    const solo = prop({ id: 'solo' });
    const groups = groupProposals([b, a, solo]);
    expect(groupContaining(groups, 'b')).toMatchObject({ kind: 'bundle', key: 'k' });
    expect(groupContaining(groups, 'solo')).toMatchObject({ kind: 'single' });
    expect(groupContaining(groups, 'nope')).toBeNull();
  });
});

describe('sharedRationale', () => {
  it('returns the most frequent item rationale', () => {
    const g = [
      prop({ id: 'a', rationale: 'cut from 9km to 6km' }),
      prop({ id: 'b', rationale: 'cut from 9km to 6km' }),
      prop({ id: 'c', rationale: 'something else' }),
    ];
    expect(sharedRationale(g)).toBe('cut from 9km to 6km');
  });

  it('breaks frequency ties toward the oldest item', () => {
    const g = [
      prop({ id: 'late', created: '2026-10-24T10:00:00Z', rationale: 'second reason' }),
      prop({ id: 'early', created: '2026-10-24T09:00:00Z', rationale: 'first reason' }),
    ];
    expect(sharedRationale(g)).toBe('first reason');
  });

  it('skips empty rationales and returns null when none exist', () => {
    expect(sharedRationale([prop({ id: 'a', rationale: null }), prop({ id: 'b', rationale: '  ' })])).toBeNull();
    expect(sharedRationale([])).toBeNull();
  });
});
