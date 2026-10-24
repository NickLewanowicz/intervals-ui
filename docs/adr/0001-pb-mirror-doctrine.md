# ADR-0001 — PocketBase is a rebuildable mirror; intervals.icu is canonical

Date: 2026-10-24 · Status: Accepted

## Context

The app needs fast, filterable calendar/stats data and a place for app state
(chats, proposals, user keys). intervals.icu is rate-limited (5k/day) and its
API shape is read-optimized for windows, not for app queries. pockethost is
free, hibernates, and has no durability guarantee.

## Decision

- **intervals.icu is the only source of training truth.** The app never
  computes "real" fitness; it reads intervals.icu's computed fields
  (icu_training_load, icu_ctl/icu_atl, zone times) — with one derived
  exception: `form = ctl − atl` (intervals.icu's own convention; not returned
  as a field).
- **PocketBase stores mirrors + app state.** Mirrors are disposable: the sync
  (`apps/worker/src/sync.ts`, cron every 6h) rebuilds them from intervals.icu
  in minutes. Non-rebuildable data (chat history, proposals) is accepted-loss
  on a PocketBase wipe.
- **Sync is one-way** (intervals.icu → PB). Writes go the other path only:
  user-approved proposals applied by the Worker, then re-synced back.
- **The PB batch API is disabled on pockethost** and `/api` is rate-limited:
  upserts are sequential, fingerprint-skipped, retry-with-backoff.

## Consequences

- First sync of a user is seeded via `tools/pb_sync.mjs` (no Worker subrequest
  cap); steady-state cron syncs are tiny.
- PocketBase schema changes go through `tools/pb_setup.mjs` (the schema of
  record) and re-run idempotently.
- If intervals.icu changes field semantics, mirrors carry the raw `data` JSON
  too, so the app can re-derive without a re-fetch.
