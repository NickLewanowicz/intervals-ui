# ADR-0006 — Hybrid chat transport: client-first, Worker for what must be server-side

Date: 2026-10-25 · Status: Accepted (implementation this round)

## Context

All coach chat currently flows through the Cloudflare Worker (`/api/chat`).
The free tier allows 100k requests/day — generous, but every chat turn is a
Worker request, streaming turns hold connections, and the design couples the
product's most-used feature to our only piece of metered infra. Meanwhile
the app is BYO-key: the OpenRouter credential belongs to the user, so there
is no server-side secret required for chat itself. intervals.icu, however,
must never be called from a browser (its API is Cloudflare-fronted, no CORS
for third-party origins, and the athlete's intervals key is stored hidden —
server-side only). The Worker also gives us the one thing a client can't:
**work that happens while the user is offline** (6-hourly sync cron, future
scheduled planning/re-plan jobs).

Empirical check (2026-10-25, from the production origin via a real browser):
OpenRouter **allows direct browser calls** — preflight 204, authenticated
POST readable by JS (a `x/not-a-model` probe returned a readable 400; a CORS
block would have thrown). Their API is explicitly browser-friendly (same
reason LibreChat-class clients call it directly). Native apps have no origin
enforcement at all.

## Decision

**Split chat transport by what each side is uniquely good at:**

| Concern | Where | Why |
|---|---|---|
| Chat turn (streaming, tools) | **Client → OpenRouter direct** when a local key exists | removes Worker quota/latency/cost per turn; CORS verified; BYO key is the user's own |
| Chat turn fallback | **Worker `/api/chat`** (unchanged) | new device before key re-entry; native webviews with odd fetch behavior; explicit preference |
| Tool-call → proposal rows | **Client**, via `@intervals/core` validators, written to PB with owner-create rules | validators are isomorphic; proposals are owner-scoped data |
| Proposal apply / dismiss | **Worker only** | the intervals.icu key lives server-side; writes to the real calendar must never need the client |
| Sync (manual + cron) | **Worker only** | intervals.icu reads are server-side; cron must run without the user |
| Context digests | **shared code in `@intervals/core`** (moved from the Worker) | client and Worker build identical prompts from the PB mirrors |

Rules changes (schema of record: `tools/pb_setup.mjs`): `chat_messages` and
`proposals` gain **owner-create** rules (`user = @request.auth.id &&
@request.body.user = @request.auth.id`); their update/delete stay locked
(superuser/Worker) — the apply path and status transitions remain Worker-only.
A client-crafted proposal row can only ever be applied with the owner's own
intervals key — self-scoped, no cross-user risk.

Key storage: the OpenRouter key is saved in Settings to BOTH local secure
storage (localStorage on web, SecureStore on native — the chat path reads
this) and the PB hidden field (the Worker fallback + future background
features read that). The intervals.icu key remains PB-hidden-only.

## What this buys

- Worker requests per active user drop from ~20-100/day (chats) to ~1-5/day
  (applies + manual syncs + cron coverage). 100k/day covers thousands of
  daily-active users instead of dozens.
- Chat latency loses a proxy hop; failures decouple from Worker deploys.
- The client chat path is exactly the path L-01 (local-only native mode,
  Gitea #14) needs — same code, keys already on-device.

## Migration path at scale (deliberately deferred)

If we outgrow CF free (or want longer CPU for background planning):
1. Cloudflare Paid ($5/mo) — nothing to migrate; removes request/CPU ceilings.
2. Coach API → fly.io (or any container host), keeping Cloudflare Pages for
   static + a thin reverse proxy/route; crons become container cron or
   Fly Machines schedules. The Worker's code is dependency-free fetch —
   portable to any runtime (including bare Node) with a small shim.
3. The Pages-Function `_worker.js` fallback (ADR-0003) remains a third home.
The architecture stays the same in all three: chat client-side, writes
server-side, crons server-side.
