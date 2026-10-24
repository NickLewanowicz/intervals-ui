# Runbooks

Step-by-step operational procedures. Write one the first time an operation
goes wrong twice (practice-project convention). Planned entries:

- **deploy-rollback** — bad production build: redeploy previous Pages
  deployment (`wrangler pages deployment` / dashboard), revert main, push.
- **pb-restore** — rebuild PocketBase from scratch: fresh pockethost instance
  → `node tools/pb_setup.mjs` → `node tools/pb_dev_user.mjs` →
  `node tools/pb_sync.mjs` → re-enter keys in Settings (hidden fields are
  user-owned; superuser can also PATCH them).
- **rotate-secrets** — OpenRouter/intervals keys (user-side, Settings);
  PocketBase superuser password (pockethost dashboard → re-run
  `tools/pb_setup.mjs` env + `wrangler secret put PB_PASSWORD` +
  Gitea/CI where applicable); Cloudflare tokens (dashboard → update
  `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_WORKERS_TOKEN` repo secrets).
- **worker-fallback** — if Worker deploys break (token scope regression):
  `node tools/build_functions.mjs apps/expo/dist/_worker.js` after web export
  and deploy Pages with the Pages token (ADR-0003 fallback path).
- **backup** — issue V-12.
