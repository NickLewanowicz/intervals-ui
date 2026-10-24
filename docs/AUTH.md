# Authentication — Google OAuth via PocketBase

Plan mirrors the viet-study pattern (same infrastructure family). Status
2026-10-24: **not yet configured** — the app runs on email+password dev
login (`tools/pb_dev_user.mjs`, creds in `.scratch/dev-user.txt`). Google
OAuth is deliberately not blocking anything: the users collection and app
flows are identical either way.

## Part A — Google Cloud Console (Nick, ~5 min, requires Google login)

| Step | Link |
|---|---|
| 1. Create project (or reuse) | https://console.cloud.google.com/projectcreate |
| 2. OAuth consent screen | https://console.cloud.google.com/apis/credentials/consent |
| 3. Create OAuth client | https://console.cloud.google.com/apis/credentials/oauthclient |

1. Project name suggestion: `intervals` (separate from `viet-study`).
2. Consent screen: user type **External**; app name `intervals`; add your
   Gmail(s) as **test users** (Testing mode is fine for personal use).
3. OAuth client, type **Web application**:
   - **Authorized JavaScript origins**: `https://intervals.imnick.dev`
     (optionally also `https://intervals-356.pages.dev`)
   - **Authorized redirect URI** (exact, no trailing slash):
     `https://intervals.pockethost.io/api/oauth2-redirect`
   - Copy Client ID + Client Secret → put them in `.env` as
     `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Part B — PocketBase (one command after creds arrive)

```bash
TOKEN=$(curl -s -X POST "https://intervals.pockethost.io/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d '{"identity":"superuser@redacted.local","password":"***"}' | jq -r .token)
curl -s -X PATCH "https://intervals.pockethost.io/api/collections/users" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"authProviders":[{"name":"google","enabled":true,"clientId":"<CLIENT_ID>","clientSecret":"<CLIENT_SECRET>"}]}'
curl -s "https://intervals.pockethost.io/api/collections/users/auth-methods" | jq '.oauth2'
```

## Part C — App side (built already, just enable)

`apps/expo` sign-in screen ships both paths:
- `loginWithGoogle()` → `pb.collection('users').authWithOAuth2({provider:'google'})`
  (popup flow on web; native uses the OS browser via the PB SDK's flow).
- The "Continue with Google" button flips from `disabled` to live once Part B
  runs — see issue V-08 in `docs/ISSUES-VISION.md` for the acceptance test.
- Optional hardening after Google lands: disable password auth on the
  collection (`passwordAuth.enabled = false`) and rotate the dev-user password.

## Security notes

- Redirect URI must match EXACTLY: `https://intervals.pockethost.io/api/oauth2-redirect`.
- The client secret lives only in PocketBase (+ `.env` for tooling). The app
  bundle ships only the PocketBase URL.
- Users created before Google OAuth (the dev user) link automatically on
  first Google sign-in when the emails match.
