# Multi-agent communication ("swarm") patterns — and what we should adopt

*2026-10-26. Context: ZCode orchestrator ("Maintainer") + persona subagents
(ui-builder, visual-reviewer, qa-parity, coach-tuner) working ONE repo; files +
git as shared state; `docs/qa/` + `qa-screenshots/` + `.zcode/agents/*.md` as
handoff surfaces. Question: how do 2025-26 multi-agent systems talk to each
other, and what's worth stealing?*

## TL;DR (opinionated)

1. We already run the pattern that won in production (orchestrator-worker over
   a file blackboard). Don't re-architect.
2. A2A and MCP are **not worth adopting** for agent↔agent comms here — both
   solve "opaque agents across org/network boundaries", a problem we don't
   have. Our agents share a filesystem; the file IS the protocol.
3. Adopt three cheap upgrades: the **screenshot registry index as the shared
   blackboard**, **structured task envelopes** for dispatch, and a
   **claim/lock convention** for files. All are conventions + stdlib scripts,
   zero infra.

## Pattern comparison

| Pattern | How agents communicate | Strengths | Failure modes | Who runs it in prod |
|---|---|---|---|---|
| **Orchestrator-worker** (hub-and-spoke) | Lead decomposes task, dispatches briefs; workers return condensed results | Clear accountability; workers are "intelligent filters"; effort scaling is centrally controlled | Lead context bloat; telephone-game loss if workers return raw dumps; single point of congestion | Anthropic's research system (Opus lead + Sonnet workers, +90.2% over single agent) |
| **Blackboard** (shared files/state) | Agents read/write a shared store; anyone can pick up or annotate work | Async, durable, human-watchable; no coordination service; trivially debuggable | Stale reads; write races; nobody notices updates (no push) | Claude Code agent teams' shared task list; our `docs/qa/` rounds |
| **Peer-to-peer / agent teams** | Teammates message directly, shared task list, no boss | Emergent challenge/critique; no orchestrator bottleneck | Conformity (identical agents pick the same branch name, all defect at once); miscoordinated PRs; needs mature models | Claude Code agent teams (experimental) |
| **Message-passing queues** | Explicit envelopes via queue/bus (Redis, MCP sampling, JSON-RPC) | Backpressure, delivery guarantees, cross-machine scale | Infra to run; serialization overhead; overkill under ~10 agents on one host | A2A deployments (cross-org); AutoGen group chat is the loose cousin |
| **Handoffs** (chain-of-custody) | Agent A transfers control + context to agent B | Dead simple; matches "specialist takes over" UX | Context loss at each hop; loops if scope unclear | OpenAI Agents SDK; our Maintainer → persona dispatch |
| **Graph/state-machine** | Agents are nodes; edges + shared state object are explicit | Deterministic recovery, time-travel debug, human-in-loop gates | Authoring cost; rigid for exploratory work | LangGraph; our pre-commit/CI gates are a degenerate case |

Key production findings worth internalizing:

- Anthropic: multi-agent uses ~**15× the tokens of chat**; token spend explains
  80% of performance variance. Subagents should **write artifacts to the
  filesystem and return lightweight references**, not route big payloads
  through the lead (limits telephone-game loss). Vague briefs ("research the
  chip shortage") caused duplicated and divergent work — each subagent needs
  objective, output format, tool guidance, boundaries.
- Anthropic's swarm study: identical agents **conform** (30 agents, one branch
  name), **silo instead of collaborate** under merge pressure, and with
  conflicting goals escalate to sabotage. Prompting on roles/hierarchies barely
  helped; **file-ownership siloing** was the only mitigation that reliably
  worked, plus central coordination forums and commitment devices.
- Claude Code agent teams: the shared task list + status flags + git worktrees
  is just the blackboard pattern with a claim convention bolted on.

## What our flow already implements (honest audit)

- **Orchestrator-worker**: yes — Maintainer dispatches personas via the Agent
  tool, routes FIXes, owns acceptance (`.zcode/agents/README.md`). This is the
  pattern Anthropic validated in production.
- **Blackboard**: yes, informally — `docs/qa/round-N.md` (verdicts),
  `qa-screenshots/` (evidence), `docs/research/eval-log.md` (append-only
  learnings), `docs/ISSUES-VISION.md` (work queue), `.zcode/agents/*.md`
  (standing instructions). Files + git = durable, diffable, human-watchable
  shared state. What's missing is *machine-readable* state: verdicts live in
  prose, screenshot folders were unstructured (fixed by the registry, below),
  and there's no push signal — an orchestrator polling files is the only
  "notification".
- **Structured handoff**: partial — persona files give standing context, and
  dispatch briefs are prompt text. No envelope schema, so the Anthropic
  "vague brief → duplicated work" failure is one lazy dispatch away.
- **Concurrency control**: none. Two agents editing one file is resolved by
  the Maintainer just… not doing that. Works at our scale (1–3 concurrent
  agents, one repo); it's discipline, not a mechanism.
- **Protocols (MCP/A2A)**: not used agent-to-agent, and shouldn't be. MCP
  connects agents to *tools/data*; A2A connects *opaque agents across trust
  and network boundaries* (Agent Card discovery, JSON-RPC/HTTP, artifacts) —
  both solve remoteness and opacity. Our agents are colocated, fully
  transparent to each other via the repo, and share a trust domain. A2A would
  add a server, an Agent Card, and RPC semantics to replace what `cat
  docs/qa/round-3.md` already does better (git history included, free).

## Three adoptable improvements

### 1. Registry `index.jsonl` as the shared blackboard for visual state (shipped)

`node tools/shot_registry.mjs capture …` (docs/TESTING.md "Screenshot
registry") gives every agent a machine-readable, append-only feed of visual
progress: `qa-screenshots/registry/index.jsonl` (one JSON line per capture:
ts, sha, agent, surface, theme, platform, path, note) plus a `latest/<agent>/`
view. Anyone — orchestrator, persona, or human — answers "what does surface X
look like right now, and what changed since commit Y" with one `index` query
instead of spelunking round folders. The PNGs self-describe (tEXt chunks:
Author, Surface, Commit, TimestampISO), so evidence survives being copied out
of context. This converts our weakest blackboard (opaque PNG piles) into the
strongest one. Next step when needed: `verdicts.jsonl` in `docs/qa/` using the
same append-only convention (PASS/FIX lines keyed by surface + commit) so the
Maintainer can gate on machine-readable verdicts instead of parsing prose.

### 2. Structured task envelopes for every dispatch

Formalize what Anthropic learned the hard way: a subagent brief must carry
**objective, output format, tool/source guidance, and boundaries**. Convention:
the Maintainer writes `.scratch/tasks/<id>.json` before dispatching —

```json
{
  "id": "r20-fix-calendar-gap",
  "agent": "ui-builder",
  "objective": "Close the 1-day gap between week strip and month grid (docs/qa/round-19.md FIX-2)",
  "inputs": ["docs/qa/round-19.md", "apps/expo/src/screens/WeekSheet.tsx"],
  "output_format": "code + tests + registry captures (surface=calendar) + summary ≤10 lines",
  "boundaries": "do not touch packages/core; no new deps; visual judgment stays with visual-reviewer",
  "done_when": "typecheck+test green; visual-reviewer PASS on surface=calendar"
}
```

—the persona reads it, and reports back a condensed result **plus file paths**
(artifact-on-filesystem, references-in-message — the Anthropic appendix
pattern). Costs nothing, kills the two documented failure modes (scope drift,
telephone-game payload loss), and makes dispatches auditable in git.

### 3. A claim/lock convention for shared files

Anthropic's swarm study found file-ownership siloing was the only reliable
defense against miscoordination, and Claude Code's task lists use status flags
for exactly this. Adopt the 30-second version: before an agent edits a file it
doesn't uniquely own, it creates `.scratch/claims/<path-with-slashes-replaced>.owner`
containing `{agent, task-id, ts}` and deletes it on completion; the registry's
sidecar already records git dirty state, so a stale claim (agent died) is
visible via `ls .scratch/claims/` + `git status`. Rules: claim-then-edit is
mandatory for shared files (`AGENTS.md`, `docs/SPEC.md`, theme tokens, prompt
files); per-issue code files stay first-come-keep (claims optional); the
Maintainer arbitrates disputes and force-clears stale claims. Not a real lock
service — deliberately. `mkdir` is atomic on all relevant filesystems, claims
are visible in every tool we already use, and the failure mode (a leftover
file) is benign and self-evident.

## Sources

- [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/research/multi-agent-research-system) (orchestrator-worker, 15× tokens, artifact-references, brief contents)
- [Anthropic — Patterns and problems in emerging multiagent systems](https://www.anthropic.com/research/multiagent-systems) (conformity, collusion, sabotage, siloing)
- [Anthropic — Building effective AI agents](https://www.anthropic.com/research/building-effective-agents) (orchestrator-workers definition)
- [Google — Announcing the Agent2Agent Protocol (A2A)](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability)
- [Google A2A on GitHub](https://github.com/google-a2a/A2A) (opaque agents, JSON-RPC 2.0/HTTP, Agent Card)
- [arXiv — A Survey of Agent Interoperability Protocols: MCP, ACP, A2A...](https://arxiv.org/html/2505.02279v1)
- [OpenAI Agents SDK vs LangGraph vs AutoGen vs CrewAI — Composio](https://composio.dev/content/openai-agents-sdk-vs-langgraph-vs-autogen-vs-crewai)
- [AutoGen vs CrewAI vs LangGraph vs OpenAI Agents — Galileo](https://galileo.ai/blog/autogen-vs-crewai-vs-langgraph-vs-openai-agents-framework)
- [Claude Code docs — Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams) (subagents vs agent teams, shared task list)
- [Hatchworks — Claude Sub Agents and Agent Teams](https://hatchworks.com/blog/claude/claude-sub-agents-and-agent-teams) (task-list-as-blackboard)
- [MindStudio — Inside Claude Code's Shared Task List](https://www.mindstudio.ai/blog/claude-code-agent-teams-shared-task-list) (status flags, worktrees)
