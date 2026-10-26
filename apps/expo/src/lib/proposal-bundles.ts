/**
 * Client-side bundle grouping (proposal-approval v2 §2): pending proposals
 * that share a bundle_key were proposed for ONE holistic reason and must be
 * reviewed TOGETHER with multi-select — not N accept rounds with the same
 * reason repeated. Pure + unit tested; both transports normalize rows into
 * the same Proposal shape (records.ts), so grouping is transport-agnostic.
 */
import type { Proposal } from './records';

export type ProposalGroup =
  | { kind: 'single'; proposal: Proposal }
  | { kind: 'bundle'; key: string; summary: string; proposals: Proposal[] };

/** The multi-select review sheet's input: a bundle group of 2+. */
export type BundleGroup = Extract<ProposalGroup, { kind: 'bundle' }>;

const byCreated = (a: Proposal, b: Proposal): number => {
  const ka = a.created ?? '';
  const kb = b.created ?? '';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // stable tiebreak
};

const groupAnchor = (g: ProposalGroup): Proposal =>
  g.kind === 'bundle' ? g.proposals[0]! : g.proposal;

const bundleGroup = (key: string, members: Proposal[]): BundleGroup => ({
  kind: 'bundle',
  key,
  summary: members.find((m) => m.bundleSummary)?.bundleSummary ?? key,
  proposals: members,
});

/**
 * Group pending proposals by bundle_key. 2+ members sharing a key form one
 * bundle group; a LONE proposal carrying a bundle key stays single (a bundle
 * of one is just a proposal). Ungrouped proposals stay single. Result is
 * ordered oldest-first (each group's oldest member decides), and bundle
 * members are oldest-first inside their group too.
 */
export function groupProposals(pending: Proposal[]): ProposalGroup[] {
  const byKey = new Map<string, Proposal[]>();
  const groups: ProposalGroup[] = [];

  for (const p of pending) {
    if (!p.bundleKey) {
      groups.push({ kind: 'single', proposal: p });
      continue;
    }
    const list = byKey.get(p.bundleKey) ?? [];
    list.push(p);
    byKey.set(p.bundleKey, list);
  }
  for (const [key, members] of byKey) {
    const ordered = [...members].sort(byCreated);
    groups.push(
      ordered.length >= 2 ? bundleGroup(key, ordered) : { kind: 'single', proposal: ordered[0]! },
    );
  }
  return groups.sort((a, b) => byCreated(groupAnchor(a), groupAnchor(b)));
}

/** The group containing `proposalId`, or null (nothing groups a missing id). */
export function groupContaining(groups: ProposalGroup[], proposalId: string): ProposalGroup | null {
  for (const g of groups) {
    if (g.kind === 'bundle' ? g.proposals.some((p) => p.id === proposalId) : g.proposal.id === proposalId) {
      return g;
    }
  }
  return null;
}

/**
 * The bundle's shared rationale — rendered ONCE under the coach avatar. Most
 * frequent item rationale wins (the coach repeats the shared reason per
 * call); ties and no-rationale cases fall back to the oldest item's, and to
 * null when no item has one.
 */
export function sharedRationale(proposals: Proposal[]): string | null {
  const counts = new Map<string, { n: number; first: Proposal }>();
  for (const p of proposals) {
    const r = (p.rationale ?? '').trim();
    if (!r) continue;
    const cur = counts.get(r);
    if (cur) cur.n += 1;
    else counts.set(r, { n: 1, first: p });
  }
  let best: { n: number; first: Proposal } | null = null;
  for (const v of counts.values()) {
    if (!best || v.n > best.n || (v.n === best.n && byCreated(v.first, best.first) < 0)) best = v;
  }
  return best ? best.first.rationale : null;
}
