# Research — how the best open-source chat UIs make AI chat skimmable, engaging, multi-session

2026-10-24 · UI research for the coach chat. Question: what do the
highest-starred open-source chat UIs do for session management, structured
message rendering, and streaming/engagement affordances — and what should we
steal for a mobile-first Expo app with no heavy deps?

Method: repos/docs read live (WebFetch + GitHub API, star counts fetched
2026-10-24). Our own baseline read from `apps/expo/app/(app)/coach/index.tsx`,
`src/lib/markdown.ts`, `src/lib/local-chat.ts`, `tools/pb_setup.mjs`.

## TL;DR

Every serious chat UI converges on the same three answers:

1. **Sessions**: a list ordered by *last activity* (not creation), grouped by
   time (Today / Yesterday / Previous 7 Days), with a **pinned** section on
   top and an **LLM-generated title from the first message** (async, cheap
   model, never blocks the stream). Search is titles + message content; at our
   scale a client-side title filter is plenty.
2. **Structured content**: markdown with **headers, bold, bullets, tables,
   inline code** — tables are the pacing-schedule killer feature. The big web
   apps all map markdown onto hand-styled custom components; nobody ships a
   stock renderer's default look.
3. **Streaming/engagement**: caret on the streaming token, typing dots before
   first token, **stop button that replaces the send arrow**, copy on every
   message, retry on failure, tool calls rendered as **inline cards in the
   transcript** (not modal-only), suggested-reply chips on the empty state.

The single most relevant artifact for us is **assistant-ui's Expo example**:
Expo Router Drawer + `ThreadList` — the canonical RN multi-session pattern.

---

## Part 1 — the survey

### Open WebUI — 156.7k stars (`open-webui/open-webui`)

The feature-maximalist reference. *Source: docs.openwebui.com
"History & Search", CHANGELOG.*

- **Sessions**: sidebar grouped by time periods; **pinned chats**; folders
  with subfolders (drag-and-drop); **unread dots** when a reply lands while
  you're elsewhere; hover previews showing a card of recent messages.
- **Auto-title**: a *task model* generates titles asynchronously; title
  generation deliberately **does not count as activity** (doesn't bump the
  chat to the top or mark it unread). Manual rename via pencil icon.
- **Search** (⌘K): searches **titles AND message content**, case-insensitive
  substring, multi-word AND across different messages, filter prefixes
  (`pinned:`, `folder:`, `archived:`), results **open at the matching
  message**. Agentic search even exposes `search_chats` / `view_chat` as tools
  the model can call.
- **Archive vs delete**: archive removes from list + search but is browsable
  in Settings; delete is permission-gated; bulk select with shift-click.
- **Steal**: last-activity ordering + unread dot + "title gen doesn't bump
  activity" as a rule.

### LibreChat — 46.3k stars (`LibreChat-AI/LibreChat`)

The most mature conversation *management*. *Source: librechat.ai
docs/features/navigation + /search.*

- **Sessions**: navigation rail with panels (chats, bookmarks, prompts,
  memories, skills); a unified **Pinned section mixes conversations with
  favorite presets**; drag-to-pin and drag-to-reorder on desktop, long-press
  menus on touch ("Touch devices use menus instead of drag" — explicitly our
  case). Sort by Updated / Created / Title, remembered per browser.
- **Conversation menu**: rename, pin/unpin, duplicate, archive, delete (with
  confirmation), export, share. Pinned conversations **load independently**
  from regular history (cheap query shape worth copying).
- **Auto-title**: a cheap model (`titleModel` in librechat.yaml) titles the
  conversation from the first message when `titleConvo` is on.
- **Search**: Meilisearch over titles + indexed message contents with typo
  tolerance and as-you-type results; filters by date/endpoint/bookmarks. This
  is heavy infrastructure — overkill for us.
- **Unread dot** when a reply completes while you're elsewhere.
- **Steal**: pinned-first + recency sort; touch menus not drag; the pinned
  query that's independent of the history query.

### LobeChat / LobeHub — ~69k stars (`lobehub/lobe-chat`, now `lobehub/lobehub`)

The richest *in-conversation* structure. *Source: GitHub README/issue #9654,
lobehub.com docs (env vars: auto topic naming; message-actions docs).*

- **Two-level hierarchy**: sessions (agents) contain **topics** — sub-
  conversations you can branch mid-session, that get **auto-named from
  content**, and can be favorited. Powerful, but it's a second list to
  manage; ChatGPT/Claude never adopted it. **Don't steal** (complexity), but
  note the underlying need it serves: "keep going on a tangent without losing
  the main thread" — our pinned-race-chat solves this more simply.
- **Session management**: pinning, grouping, default agent + inbox.
- **Structured content / tool calls**: plugins render as **custom cards
  inline in the transcript with a loading shimmer** while running; chain-of-
  thought rendered as a collapsible reasoning step.
- **Message actions**: regenerate, edit, **branch into subtopics**,
  multi-select forward, share.
- **Steal**: inline tool cards with loading state in the transcript.

### Chatbot UI (mckaywrigley) — 33.3k stars, dormant (last push 2024-08)

The cleanest ChatGPT-clone UX ever shipped open source; maintained poorly now,
so treat it as a *pattern* reference. *Source: repo, discussions #1313/#1714.*

- **Sessions**: date-grouped list (Today / Yesterday / Previous 7 Days),
  named+colored **folders** with drag-and-drop, Cmd+K search modal over titles
  and content, auto-title from first message.
- **Steal**: the time-grouped list is still the best default ordering for a
  personal chat history; everything else was superseded.

### Vercel AI chatbot template — 21.0k stars (`vercel/chatbot`, ex ai-chatbot)

The reference *codebase* for a hackable chat app (we've lifted its shape
before). *Source: repo README, `app/(chat)/actions.ts` read directly.*

- **Sessions**: collapsible flat sidebar, multi-select bulk delete, search
  dialog. **Auto-title is explicit and copyable** — `generateTitleFromUserMessage`
  calls a dedicated cheap `titleModel` with a `titlePrompt` against the first
  user message, then strips leading `#*"` and trailing quotes; stored on the
  chat row; the stream never waits on it.
- **Message actions**: copy, edit user message, **branch/fork the chat at any
  message** (creates a new chat from that point), thumbs vote persisted,
  regenerate.
- **Engagement**: **suggested actions** — chips like "What are the advantages
  of using Next.js?" on the empty state that just call `append`.
- **Visibility**: chats are private by default, shareable by link.
- **Artifacts**: versioned code/doc canvas beside the chat (web-only pattern;
  our ProposalModal already covers the "rich side panel" need).
- **Steal**: the title-generation recipe verbatim (cheap model, sanitize, async);
  suggested-action chips.

### assistant-ui — 12.7k stars (`assistant-ui/assistant-ui`)

Headless React primitives — "the UX of ChatGPT in your app". The only library
in this list that takes React Native seriously. *Source: repo README,
assistant-ui.com/examples/expo.*

- **Primitives**: `ThreadList`, `Thread`, `Message`, `Composer`, `ActionBar`
  (copy / reload / edit); branching (edit = new branch, switch between
  versions); generative UI — **tool calls render as your React components with
  inline human approvals** (exactly our proposal-card model, generalized).
- **The Expo example is the template for our session UX**: Expo Router
  `Drawer` with `drawerType: "front"`, `swipeEnabled: true`; drawer content is
  the `ThreadList`; drawer auto-closes on `threads.selectionChanged`; header
  "New chat" button calls `switchToNewThread()`; `KeyboardAvoidingView` wraps
  the thread.
- **Steal**: the drawer-+list mental model and the auto-close-on-switch
  detail; the ActionBar triple (copy/retry/edit) as the minimal message-action
  set.

### Also-rans

- **chatscope/chat-ui-kit-react** — 1.8k stars. Web-only component kit
  (`MessageList` with `typingIndicator` prop, auto scroll-to-bottom with
  pin-to-bottom-when-at-bottom). Not usable in RN; its value is documenting
  the *scroll behavior* we should keep: stick to bottom while the user is at
  bottom, never yank them down if they scrolled up.
- **expo / AI SDK** — no official chat session UI ships from Expo; the Vercel
  AI SDK has an official Expo quickstart (`ai-sdk.dev/docs/getting-started/expo`)
  and `@expo/ai` wraps on-device agents. The assistant-ui Expo example remains
  the de facto RN reference.

### Cross-cutting summary

| | Session list | Ordering | Auto-title | Search | Tool calls | Streaming affordances |
|---|---|---|---|---|---|---|
| Open WebUI | time groups + pin + folders | last activity | LLM, async, no bump | titles + content, opens at match | inline | caret, stop, regenerate |
| LibreChat | panels + pin + projects | last activity (sortable) | cheap model from 1st msg | Meilisearch | inline cards | caret, stop, retry, edit/branch |
| LobeChat | sessions ⊃ topics, pin, groups | last activity | LLM topic names | title search | inline plugin cards + shimmer | stop, regenerate, branch |
| Chatbot UI | date groups + folders | last activity | 1st msg (LLM) | titles + content modal | n/a | stop, retry, edit |
| Vercel chatbot | flat sidebar | last activity | cheap model, async, sanitized | dialog | generative UI | stop, retry, edit, vote |
| assistant-ui | ThreadList (drawer on Expo) | last activity | host app's job | host app's job | generative UI + approvals | retry, edit, branching, auto-scroll |

Consensus everywhere: **order by last activity, never by creation; titles come
from a cheap async model; pin beats folders for a personal app.**

---

## Part 2 — distillation for the coach chat

Our baseline (read from code): a single rolling session per visit — "New chat"
*orphans* the previous session (rows exist in PB but are unreachable from the
UI, which is the biggest gap). Markdown-lite = bold + bullets + backtick
stripping + streaming caret + typing dots. Proposals open the modal only;
there's a pending-proposals bar. No stop button (input is disabled while
sending, no AbortController is wired). No copy. No session list.

### 1. Session management

**List UX — push a route, don't add a drawer.** assistant-ui's Expo example
and ChatGPT mobile use drawers because chat *is* their whole app. We are a
3-tab app (coach / calendar / settings) with a glass input dock at the bottom
of the coach screen; a drawer adds a second nav idiom and its edge-swipe
gesture will fight the text input. Recommendation: a header history icon
(icon-button next to "New chat") pushing `/coach/sessions` — an Expo Router
stack screen, reusing `GlassBar` + `PressableScale` conventions. (A bottom
sheet is the fallback if the pushed screen feels heavy; it's the same list
component either way.)

**List structure** (LibreChat/Open WebUI/Chatbot UI consensus, mobile-tuned):

```
[ pin icon ]  Coach chats                    (from header)
  ★ PINNED
    Fueling for Paris 2026          2d ago     ← pinned, no time group
  TODAY
    Why did Tuesday feel flat?      9:14
    Race week plan                  8:02
  PREVIOUS 7 DAYS
    Build back after 2 weeks off    Mon
  OLDER …
```

- Rows: title (1 line, `numberOfLines={1}`), relative time, small star if
  pinned, 44px min touch target (existing `layout.minTouch`).
- **Long-press row → action menu**: Pin/Unpin, Rename, Delete (confirm —
  cascade already deletes the session's messages: `rel()` defaults
  `cascade: true` in `tools/pb_setup.mjs`).
- **Search**: a plain `TextInput` at the top filtering titles client-side.
  Full-text content search is a Meilisearch-shaped problem (LibreChat runs an
  entire search engine for it) — at a personal scale of dozens of sessions,
  title filter + pinned section solves 95%. Revisit never-ish.
- Auto-close/select behavior: switching sessions resets `sessionId` **and**
  `historyLoadedFor.current` (the hydration guard in `coach/index.tsx` already
  keys on session id — keep that invariant).

**Auto-title**: v1 keep truncation, but truncate at a word boundary to ~48
chars (`slice(0,60)` today cuts mid-word: `"Tell me about my long run paces f…"`).
v2 (ranked #8 below): the Vercel recipe — after the first exchange, one
fire-and-forget call to a cheap model ("5-word title, no quotes, no trailing
punctuation"), sanitize, update the row. The stream never waits for it, and
per Open WebUI's rule, **title updates must not bump the sort key** — which is
exactly why the sort key is a dedicated column (next point).

**PB schema** (`tools/pb_setup.mjs` — schema of record, edit + re-run,
idempotent, per AGENTS.md non-negotiable #5):

- Add `last_message_at` (timestamp) to `chat_sessions`; set on session
  create, bump on every `chat_messages.create` in **both** transports
  (`local-chat.ts` *and* the Worker `/api/chat` — they must stay symmetrical).
- Add `pinned` (bool, default false).
- Sort: `pinned DESC, last_message_at DESC`. Deliberately **not** PB's
  auto `updated` field — a rename or pin would silently reorder the list
  (Open WebUI had to build the same distinction).
- Optional v2: `preview` (text 120) = last-message snippet so list rows don't
  require a per-session message fetch (kills an N+1 before it exists).
- **Critical existing bug for this feature: `chat_sessions.updateRule` is
  `null`** (pb_setup.mjs:160) — nobody, including the owner, can update a
  session, so rename/pin/title-update would all 403 today. Must become
  `updateRule: 'user = @request.auth.id'` (mirroring the existing
  createRule). This is the enabling change for the whole feature.
- Index: `(user, last_message_at)`.
- **Cut**: `summary`, folders, archive, message_count. The "race prep vs
  daily training" split is what `pinned` is for — two pins beat a taxonomy.

### 2. Rich message rendering

**Verdict: extend the hand-rolled parser. Do not adopt a markdown library.**

`react-native-markdown-display` (the viable RN option; ~3.4M monthly npm
downloads) is effectively frozen — last release v7.0.2, Dec 2023 — and renders
full CommonMark through its own styled component tree, which would fight our
palette/glass theming and our per-delta streaming re-parse. Our parser is 66
pure, vitest-covered lines that emit *our* components; every major UI in the
survey hand-styles its markdown-to-component mapping anyway. Going to ~150
lines keeps that property. (streamdown / react-native-marked etc. are all
heavier and web-shaped.)

**Markdown v2 subset** — the exact spec to implement in `src/lib/markdown.ts`,
each transform pure + tested, mapped to components in `MarkdownBubble`:

| Syntax (coach emits) | Renders as | Why |
|---|---|---|
| `**bold**` | bold Text | have it |
| `- ` lines | bullet rows | have it |
| blank line | gap | have it |
| `## Header` / `### Header` | small-caps section label, accent/muted | skimmability #1 — coach replies are 3-section answers; headers are what makes them scannable |
| `\| a \| b \|` rows with `\|---\|` divider | flex-row table (first row = header, hairline dividers) | pace schedules, zones, fueling plans — the single biggest content win |
| `` `code` `` | monospace Text with subtle chip bg (stop *stripping* backticks — style them) | paces, zone names, dates pop as tokens |
| `1. ` lines | numbered rows (reuse bullet layout, glyph = number) | step-by-step protocols ("do this Tue/Thu/Sat") |
| `---` | hairline divider | separates advice from the plan |
| ```` ``` ```` fences | strip the fence markers, keep the lines | coach shouldn't emit code; degrade gracefully |

Still no nested lists, no images, no HTML. Header + table are ~60 lines of
parser and ~50 of components; everything else is trivial. Long-term niceties
deliberately deferred: **stat chips** (a `Label:**value**` bullet group could
render as a horizontal chip row later), **collapsible sections** (only worth
it if the coach starts dumping long KB excerpts — it doesn't today).

One free skimmability upgrade outside the parser: assistant bubbles currently
span `maxWidth: '84%'`; let *assistant* bubbles go full-width minus margins
(ChatGPT/Claude do this) so tables and bullet lines stop wrapping early — user
bubbles stay right-aligned and bubbled.

### 3. Engagement patterns — ranked by value/effort

1. **Stop button** (S). Send arrow becomes a stop square while streaming
   (universal: ChatGPT, vercel template, every survey entry). `AbortController`
   is already plumbed through `streamChat`/`streamChatDirect` via
   `opts.signal` — the screen just never creates one. One real design note:
   today an abort mid-stream means the partial reply is **never persisted**
   (persistence happens after the stream ends in `local-chat.ts`); on abort,
   persist what streamed (with a `" — stopped"` guard is optional) so the
   transcript survives the trip back.
2. **Inline proposal cards in the transcript** (M). The LobeChat plugin-card
   pattern: each proposal renders as a compact row inside the assistant turn —
   icon, one-line summary ("Move Thu tempo → Fri · recover Thu"), status chip
   (pending / applied / dismissed from the proposals query) — tap reopens
   `ProposalModal`. Right now approval flow is modal-only, which makes tool
   calls feel like interruptions instead of transcript events, and the
   transcript can't answer "what did I approve last week?" later. This also
   composes with the existing pending-proposals bar rather than replacing it.
3. **Suggested-reply chips** (S, static v1). The vercel `suggested-actions`
   pattern; we already write the content — the empty state's three example
   prompts become 3 tappable chips above the input, plus 2 persona-flavored
   chips ("What should my weekend long run be?" / "Am I recovered enough for
   tomorrow?"). Static chips cost zero model tokens. LLM-generated follow-ups
   (cheap model, fired in `onDone`, rendered when they arrive) are the v2.
4. **Copy message** (S). Long-press assistant bubble → Copy (expo-clipboard).
   The assistant-ui ActionBar minimum. Zero model cost, universal expectation.
5. **Retry for real** (S, mostly built). The error-row Retry exists (FIX-9);
   extend so "retry" on a *completed-but-bad* turn deletes the last assistant
   row and resends the last user message. Do **not** build full branching /
   edit-user-message (assistant-ui/LobeChat territory — a second message tree
   for one user).
6. **Unread dot on session rows** (S, later). LibreChat/Open WebUI: reply
   finished while you were on the calendar tab → dot on that session row.
   Cheap (compare `last_message_at` vs `lastReadAt`), delightful at low
   session counts.

**Explicitly cut**: token fade-in animations (RN re-render churn per delta for
a subtle effect the caret already delivers), message votes/ratings, resumable
streams, artifacts, multi-level topics, agentic search over history.

---

## Part 3 — prioritized build list

| # | Item | Effort | Notes |
|---|---|---|---|
| 1 | PB schema: `pinned` + `last_message_at` + **updateRule fix** + `(user, last_message_at)` index | **S** | pure `tools/pb_setup.mjs`, bump on message create in both transports |
| 2 | Session list screen `/coach/sessions`: pinned-first + time groups, long-press pin/rename/delete, client title filter, switch = set `sessionId` + reset hydration guard | **M** | the headline feature; reuses GlassBar/ui kit |
| 3 | Stop button (AbortController in screen; persist partial on abort) | **S** | small diff, fixes a real data-loss edge |
| 4 | Markdown v2: headers, pipe tables, inline code, numbered lists, hr + full-width assistant bubbles | **M** | parser stays pure; ~5 new vitest cases |
| 5 | Inline proposal cards in transcript (status-aware, tap → modal) | **M** | data already in `proposals` query |
| 6 | Suggested-reply chips (static) above input + on empty state | **S** | copy is already written |
| 7 | Copy message action (long-press menu) | **S** | expo-clipboard |
| 8 | LLM auto-titles (cheap model, fire-and-forget after first exchange, sanitized, sort-key untouched) | **M** | vercel recipe; Worker helper + direct-path variant |

Sequencing: 1 → 2 are the core (nothing else needs them, but they unlock the
whole "multi-session" story). 3 and 4 are independent and small. 5–7 are
polish that compounds with 4. 8 is gravy — truncation titles are fine until
session count makes bad titles annoying.

**Cut list** (the discipline): folders/projects (pins cover our two real
buckets), full-text content search (client title filter until proven
insufficient), archive vs delete, LobeChat-style topics/subthreads, message
branching and edit-rerun trees, votes/ratings, token fade-in animations,
resumable streams, artifacts, agentic search over past chats. Revisit any of
these only when a persona panel asks for it by name.

## Sources

- Open WebUI — 156,694 stars (GitHub API 2026-10-24); docs.openwebui.com
  "History & Search"; repo CHANGELOG
- LibreChat — 46,281 stars; librechat.ai/docs/features/navigation and
  /features/search; discussions #2610, #6743, #11044 (pin/notes requests)
- LobeChat/LobeHub — ~69k stars (search-verified; API rate-limited at write
  time); lobehub.com docs (auto topic naming env var, message actions);
  issue #9654 (topics scoping)
- Chatbot UI — 33,326 stars, last push 2024-08; repo + discussions #1313, #1714
- Vercel chatbot — 21,004 stars; README; `app/(chat)/actions.ts`
  (`generateTitleFromUserMessage`) read from source; chatbot.ai-sdk.dev/docs
- assistant-ui — 12,733 stars; README; assistant-ui.com/examples/expo
- chatscope/chat-ui-kit-react — 1,783 stars; chatscope.io/docs
- AI SDK × Expo quickstart — ai-sdk.dev/docs/getting-started/expo
- Local baseline: `apps/expo/app/(app)/coach/index.tsx`, `src/lib/markdown.ts`,
  `src/lib/local-chat.ts`, `src/components/ProposalModal.tsx`,
  `tools/pb_setup.mjs`, `docs/adr/0006-hybrid-chat-transport.md`
