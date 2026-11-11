# tools/gif/ — README GIF capture pipeline

Regenerates the animated captures embedded in the root `README.md`
(`docs/gifs/*.gif`). The GIFs are recorded from the **production web export**
running against the **local QA stack** (test athlete, mock LLM) — never from a
real account, and no intervals.icu writes are involved (the mock worker's
apply writes the local mirror only).

## One-time setup per session

```sh
# 1) QA stack (local PocketBase :8090 + mock coach API :8099)
tools/qa_stack.sh start
QA_PERSONA_PASSWORD='QaGifShoot1!' PB_URL=http://127.0.0.1:8090 \
  PB_EMAIL=qa-admin@intervals.test PB_PASSWORD=qa-admin-pass \
  node tools/qa_seed_personas.mjs        # known persona password

# 2) OpenAI-shaped mock LLM on :8097 (the app's DIRECT chat path fetches it
#    from the browser, so its CORS headers matter — they are set)
node tools/qa_mock_llm.mjs 8097

# 3) Point a persona at the mock LLM + stage a local key
#    - PATCH users/records/<id> { llm_base_url: "http://localhost:8097/v1" } (superuser)
#    - browser: localStorage.setItem('intervals.orkey', 'sk-or-v1-qa-local-demo')

# 4) Production export against the QA stack — Metro caches EXPO_PUBLIC_*,
#    so move apps/expo/.env.local aside first (RESTORE IT AFTER) and export
#    with --clear; then verify dist has no pockethost.io URLs before serving
mv apps/expo/.env.local apps/expo/.env.local.qa-shoot-bak
cd apps/expo && EXPO_PUBLIC_PB_URL=http://localhost:8090 \
  EXPO_PUBLIC_WORKER_URL=http://localhost:8099 \
  npx expo export --platform web --clear
npx serve -s dist -l 8091
```

## Capture

- `frame_sink.mjs` — tiny HTTP sink (`POST /start`, `POST /frame`, `GET /count`)
  that writes screencast JPEG frames + a wall-clock receipt log to
  `/tmp/gif-frames/<clip>/`. Needed because the Playwright tool sandbox has
  `fetch` but no `fs`.
- Frames come from a CDP screencast on the served app
  (`Page.startScreencast`, JPEG q72, ack every frame) while a driver script
  performs the interactions (sign-in as a persona, click through the
  scenario). A 1×1 RAF heartbeat div keeps idle gaps producing frames at a
  steady cadence. Playwright role selectors drive the UI; typing uses
  `pressSequentially` so the composer types on camera.
- Scenarios captured for the README: `calendar-tour` (day panel → month →
  week), `coach-chat` (typed question → streamed reply), `proposal-flow`
  (typed schedule request → proposal review modal → Approve → the run appears
  on the calendar's Thursday).

## Assemble

```sh
tools/gif/assemble.sh   # resamples each take to 12fps from the receipt log,
                        # crops to the app column (880×800 @ x200), scales to
                        # 720w, two-pass palette (128 colors, bayer dither)
```

Output lands in `docs/gifs/`. Keep each GIF under ~800KB (current set:
122–757KB); if a re-capture blows past that, trim scenario wait times or
drop to 10fps.
