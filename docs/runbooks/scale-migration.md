# Runbook: coach API migration paths at scale

Decision context: docs/adr/0006 (hybrid chat transport). As of 2026-10-25,
chat runs client-side (direct → OpenRouter, BYO key); the Worker serves only
proposal applies, manual sync, `/api/cron` fallback, and health. Expected
Worker load ≈ 1–5 requests/active-user/day + cron ticks.

## Tier 0 — today (free)

- Cloudflare Workers free: 100k req/day, 10ms CPU. Applies/sync are
  single-digit-subrequest, well under CPU limits.
- Watch: Cloudflare dashboard → Workers → intervals-coach → metrics. Alert
  threshold: sustained >40k req/day (40% of free) or any 1102/1042 spikes.

## Tier 1 — Cloudflare Paid ($5/mo)

When: sustained approach to limits, or a background-planning feature needs
>10ms CPU (e.g. multi-week plan generation with many tool calls).
Nothing to migrate. Enable in dashboard; wrangler config unchanged.
Optional: raise cron frequency, move `/api/cron` to native-only.

## Tier 2 — fly.io (or any container host)

When: cost/control favors a container (long CPU, durable queues, SQLite,
many concurrent streaming fallbacks, or Workers policy risk).
The coach API is dependency-free fetch-based code — portable with a shim:

1. `apps/worker/src/index.ts` exports `fetch(request, env, ctx)` +
   `scheduled(...)` (Workers shape). Wrap for Node: map `Request`/`Response`
   (node's undici provides them), `ASSETS` binding → static dir server or
   drop it (Pages keeps static), `ctx.waitUntil` → fire-and-forget.
2. Secrets → fly secrets (`fly secrets set PB_URL=... PB_EMAIL=...
   PB_PASSWORD=... CRON_SECRET=...`).
3. Cron: fly.toml `[processes]` + a scheduler process calling the sync loop
   (or fly machines scheduled stops/starts). Native CF cron dies with the
   Worker — this is the main migration cost.
4. DNS: either keep intervals.imnick.dev on Pages and point
   api.intervals.imnick.dev at fly (add to ALLOWED_ORIGINS), or full move.
5. Keep the Worker deployed as a dormant fallback (zero traffic) — it costs
   nothing and is the instant rollback.
6. CI: add a deploy job (`fly deploy`) gated behind a repo secret FLY_API_TOKEN.

Estimated effort: a day including verification; the heavy logic
(packages/core) is platform-agnostic already.

## Rollback (any tier)

Chat is client-side — users are unaffected by coach-API moves. Worst case,
applies/sync pause; mirrors go stale; nothing is lost (intervals.icu is
canonical). Redeploy the Worker (`pnpm worker:deploy`) to restore.
