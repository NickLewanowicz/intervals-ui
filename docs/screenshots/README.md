# docs/screenshots/

Embedded captures for `docs/FEATURES.md` (and any other doc that needs a
picture). Images are named `<surface>-<variant>.<ext>`:

- **surface** — the screen/widget the capture shows: `sign-in`,
  `calendar-week`, `calendar-month`, `day-peek`, `day-detail`, `status-sheet`,
  `coach-chat`, `coach-sessions`, `coach-empty`, `proposal-modal`,
  `proposal-confirm`, `bundle-multiselect`, `settings`, `widget-*`,
  `widgets-picker`, `theme-calendar`.
- **variant** — theme or layout variant where it matters: `dark`/`light`,
  `mobile`/`desktop`. No variant suffix = the default (dark, web).

Extensions: `.png` for small/flat captures kept lossless, `.jpg` for larger
ones re-encoded (JPEG q60–80) to keep this folder under ~2 MB. All images are
compressed for docs embedding — **do not use them as source assets**.

Fresh captures come from the QA screenshot registry: run
`node tools/shot_registry.mjs` (personas × surfaces →
`qa-screenshots/registry/<date>/<persona>/`); the curated copies here were
taken from `qa-screenshots/registry/latest/` and the widget rounds
(`qa-screenshots/round-16-widgets/`, `round-19/`, `round-20-hero-v4/`,
`round-22-desktop-unify/`). To refresh: re-shoot with the registry tool, then
re-copy + compress (`sips -s format jpeg -s formatOptions 70 --resampleWidth
1600 …` for desktop, keep 750 px width for phone captures).

Note: captures marked "QA stack" come from test athletes, so names/loads in
them are test data. The sign-in capture predates nothing — it shows the live
Google button (configured Nov 2026).
