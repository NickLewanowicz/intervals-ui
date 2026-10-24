/**
 * Create the vision-session issues on Gitea (mirror of docs/ISSUES-VISION.md).
 * Usage: node tools/create_issues.mjs   (Gitea token from keychain via env GITEA_TOKEN)
 */
import { readFileSync } from 'node:fs';

const GT = process.env.GITEA_TOKEN || readFileSync(new URL('../.scratch/gitea-token', import.meta.url), 'utf8').trim();
const API = 'https://git.imnick.dev/api/v1';

const issues = [
  ['V-06', 'Design language + theme system (foundational for all visual work)', 'v0.1', 'Extend apps/expo/src/theme.ts into a full token set (colors incl. race/highlight, spacing, type scale, radii, elevation); dark-first; document in docs/design/DESIGN-LANGUAGE.md. All screens consume tokens only. See docs/ISSUES-VISION.md V-06.'],
  ['V-01', 'Splash page: the 80/20 product story', 'v0.1', 'Hero + heavily-weighted 80/20 section, coaching-sources (80/20 Running; Run Like a Pro — distilled), how-it-works steps, disclaimer footer (educational, not medical advice). See docs/ISSUES-VISION.md V-01.'],
  ['V-02', 'Calendar week view + day detail polish', 'v0.1', 'Race entries distinct; completed-vs-planned obvious; today marker; empty states; sync button + last-sync; zone-times stacked bar. See docs/ISSUES-VISION.md V-02.'],
  ['V-03', 'Coach chat screen polish', 'v0.1', 'Streaming render, model chip, inline proposal cards with status, input states, readable errors, educational-use footer. See docs/ISSUES-VISION.md V-03.'],
  ['V-04', 'Proposal modal / steering sheet — core differentiator', 'v0.1', 'Bottom sheet (mobile) / modal (desktop); action verb, date/time, name, category chip, description block, distance/duration, rationale; Approve/Dismiss; applied + failed states; idempotent buttons. See docs/ISSUES-VISION.md V-04.'],
  ['V-05', 'Settings + onboarding polish', 'v0.1', 'Masked key inputs with show-toggle, test-connection, model picker, units, athlete profile, sync status card, sign-out; first-run connect flow. See docs/ISSUES-VISION.md V-05.'],
  ['V-07', 'Weekly/monthly stats presentation', 'v0.1', 'Planned-vs-actual km/time/load, time-in-zone distribution, longest run, form trend sparkline, month aggregates. See docs/ISSUES-VISION.md V-07.'],
  ['V-08', 'Google OAuth end-to-end (blocked on Nick: consent screen)', 'v0.1', 'After docs/AUTH.md Part A: enable provider (Part B), flip sign-in button, verify popup + native, consider disabling password auth. See docs/ISSUES-VISION.md V-08.'],
  ['V-09', 'Prompt + model quality round 1 (coach-tuner)', 'v0.1', 'Expand eval fixtures to >=8; A/B prompt with knowledge-base integration; verify 80/20 distribution in proposed plans; log evals; ship winner; bump COACH_PROMPT_VERSION. See docs/ISSUES-VISION.md V-09.'],
  ['V-10', 'Native app build + emulator QA (iOS sim + Android emu available)', 'v0.1', 'expo prebuild / run:ios / run:android on local emulators; verify login, calendar, chat SSE streaming on RN, proposal sheet, settings; Platform-gate web-only assumptions. See docs/ISSUES-VISION.md V-10.'],
  ['V-11', 'Landing → app funnel + shareability', 'v0.2', 'OG tags, favicon/PWA manifest, icons, share-this-week export. See docs/ISSUES-VISION.md V-11.'],
  ['V-12', 'PocketBase backup runbook', 'v0.2', 'SFTP pb_data pull or superuser backup API on a Gitea schedule; verify restore once; document. See docs/ISSUES-VISION.md V-12.'],
  ['V-13', 'Race-countdown + goal-race features', 'v0.2', 'Next-race banner, days-to-go, taper status line. See docs/ISSUES-VISION.md V-13.'],
];

const labelRes = await fetch(`${API}/repos/nick/intervals/labels`, {
  headers: { Authorization: `token ${GT}` },
});
const labels = await labelRes.json();
const labelId = (name) => labels.find((l) => l.name === name)?.id;

for (const [id, title, milestone, body] of issues) {
  const res = await fetch(`${API}/repos/nick/intervals/issues`, {
    method: 'POST',
    headers: { Authorization: `token ${GT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `${id} · ${title}`,
      body: `${body}\n\n_Source: docs/ISSUES-VISION.md_`,
      labels: [labelId(id === 'V-08' || id === 'V-09' || id === 'V-10' || id === 'V-12' ? 'functional' : 'vision')].filter(Boolean),
    }),
  });
  const data = await res.json();
  console.log(res.ok ? `✓ #${data.number} ${id}` : `✗ ${id}: ${res.status} ${JSON.stringify(data).slice(0, 120)}`);
}
