# OpenRouter Model Brief — AI Running-Coach Agent (BYO-key, Cloudflare Worker)

**Research date: 2026-10-24.** All data pulled live from `https://openrouter.ai/api/v1/models` (no auth required) plus per-model `/endpoints` queries. Prices are USD per 1M tokens as listed on OpenRouter (first-party/median provider; floor prices noted where relevant).

## Requirements recap

- Very cheap, frontier-adjacent ("value frontier")
- Strong tool/function calling — the coach emits structured "proposal" tool-calls (`add_to_calendar`, `modify_workout`) plus multi-turn chat
- 100k+ context (training calendar); all finalists are 1M-class
- Streaming (SSE on `/chat/completions` — supported for every candidate below)

## Comparison table — top 6 candidates (Oct 2026)

| Model ID (exact) | Context | $/1M input | $/1M output | $/1M cache read | Tools / tool_choice | Structured outputs | Reasoning | Notes |
|---|---|---|---|---|---|---|---|---|
| `anthropic/claude-haiku-5.5` | 1,000,000 | **$0.10** | **$0.50** | **$0.01** | Yes | Yes | Optional (default medium, `none` allowed) | Released 2026-10-07. AA intelligence 43.4. Anthropic = best-in-class tool-call reliability. 128k max output |
| `z-ai/glm-5.3-flash` | 1,048,576 | $0.15 | $0.50 | $0.03 | Yes (+ `parallel_tool_calls`) | Yes | **Mandatory** (efforts max/high/low, no `none`) | AA intelligence 41.8, **agentic 50.9 — best in value tier**, coding 71.5. Default effort `max` → hidden reasoning tokens billed as output; set effort `low`. Floor price via Relace: $0.0175/$0.1425 |
| `deepseek/deepseek-v4.1-flash-1017` | 1,048,576 | $0.15 | $0.60 | **$0.003** | Yes (+ `parallel_tool_calls`) | Yes | Optional (default high, `none` allowed) | The **Oct 17, 2026 snapshot** of DeepSeek V4.1 Flash (served by DeepSeek as `deepseek-flash`). AA intelligence 39.5 vs only 24.7 for the Sept base ID — use the 1017 snapshot |
| `openai/gpt-5.6-luna` | 1,050,000 | $0.20 | $1.20 | $0.02 | Yes | Yes | Optional (default medium, `none` allowed) | AA intelligence 37.3, agentic 42.1, coding 71.4. OpenAI-native function calling + strict structured outputs = most reliable schema conformance. Batch variant $0.10/$0.60 |
| `minimax/minimax-m3.1-flash` | 1,048,576 | $0.15 | $0.60 | $0.015 | Yes | Yes | Mandatory | Released 2026-10-19. AA intelligence 42.7. Description claims major agentic gains over M3 |
| `moonshotai/kimi-k3.1-pro` | 1,048,576 | $2.00 | $10.00 | $0.20 | Yes | Yes | Optional (default `max`, `none` allowed) | Released **2026-10-23** (yesterday). AA intelligence **55.1 — frontier class**. Kimi K3 line is agentic-first (K3: agentic 50, coding 76). Too pricey as default; excellent "hard planning" escalation tier |

Honorable mentions: `qwen/qwen3.8-flash` ($0.15/$0.47, 1M ctx, tools+structured outputs, but no `parallel_tool_calls` and no published benchmarks on OR), `inclusionai/ling-3.1-flash` ($0.075/$0.225, intel 41.1, but only 262k ctx, smaller lab), `inception/mercury-3` ($0.10/$0.35, diffusion LLM — very fast but less proven for long structured tool args), `nvidia/nemotron-3.5-super-vl` ($0.15/$0.50, has a `:free` variant, intel 26.5).

Not competitive anymore: Gemini flash tier (3.5 Flash is $1.50/$9.00; flash-lites $0.25–0.30/$1.50–2.50 with lower AA scores), old `gpt-5-nano`/`gpt-5-mini` (intel 13–20.6, dated Aug 2025), `kimi-k3` ($0.239 in but $10.80 out), GLM-5.3-FlashX ($0.37/$1.25, no `structured_outputs`, 128k max output).

## Pricing math — typical coach turn (50k input, 5k output)

| Model | Uncached turn | Cached turn* | 100-turn session |
|---|---|---|---|
| `anthropic/claude-haiku-5.5` | **$0.0075** | **$0.0035** | **$0.35–0.75** |
| `z-ai/glm-5.3-flash` | $0.0100 (+~$0.0005–0.0015 reasoning tokens) | $0.0046 | $0.46–1.15 |
| `deepseek/deepseek-v4.1-flash-1017` | $0.0105 | $0.0039 | $0.39–1.05 |
| `openai/gpt-5.6-luna` | $0.0160 | $0.0073 | $0.73–1.60 |
| `minimax/minimax-m3.1-flash` | $0.0105 | $0.0045 | $0.45–1.05 |
| `moonshotai/kimi-k3.1-pro` | $0.1500 | $0.1345 | $13.45–15.00 |

\* Cached turn = 45k cached input + 5k fresh input + 5k output (system prompt + training calendar resent each turn — exactly your pattern, and why cheap cache reads matter).

Example: `claude-haiku-5.5` cached = 45,000×$0.01/M + 5,000×$0.10/M + 5,000×$0.50/M = $0.00045 + $0.00050 + $0.00250 = $0.00345.

## Function-calling reliability notes

- **Anthropic (`claude-haiku-5.5`)**: Claude models are the de-facto benchmark for tool-call adherence — schema-conformant arguments, stable multi-turn tool loops, honest refusals to call tools when unneeded. No `parallel_tool_calls` knob on OR but parallel calls work natively. Recommended baseline for a proposal-tool UX.
- **Z.ai (`glm-5.3-flash`)**: GLM 5.x is post-trained heavily for agents (highest agentic index 50.9 in this tier) and supports `structured_outputs` + `parallel_tool_calls`. Main quirk: reasoning is mandatory and defaults to `max` — always send `reasoning: {effort: "low"}` or output-token bills inflate ~1.5–2x. Served by ~35 providers with wildly varying prices ($0.0175–$0.248 input); default price routing lands on the cheapest, so pin quality with `provider.order` if tool-call formatting ever degrades.
- **DeepSeek (`deepseek-v4.1-flash-1017`)**: DeepSeek's function calling is solid and the Oct-17 snapshot scores intel 39.5 (the Sept `deepseek/deepseek-v4.1-flash` base ID only scores 24.7 — same price class, much weaker; don't use the old one). Full param support incl. `parallel_tool_calls`. Cheapest cache reads anywhere ($0.003/M). Caveat: only first-party DeepSeek + a few hosts serve the 1017 snapshot; the base ID's $0.02 floor (OpenInference) is the older snapshot.
- **OpenAI (`gpt-5.6-luna`)**: The most battle-tested function-calling stack in the industry; strict structured outputs (json_schema) guarantee schema conformance at the API level. Costs ~2x Haiku 5.5 but is the safest port-in-a-storm if BYO-key users report issues elsewhere.
- **MiniMax (`minimax-m3.1-flash`)**: Agentic-focused post-training (cybersecurity/agent benchmarks cited), full tool param support, but newest and least battle-tested; reasoning mandatory.
- **Moonshot (`kimi-k3.1-pro`)**: Flagship-tier intelligence (55.1), strong agentic pedigree, full tool support. Default reasoning effort is `max` — dial it down. Cost structure ($2/$10) fits an "escalation" tier for complex plan rewrites, not everyday chat.
- **OpenRouter docs caveat (applies to all)**: structured-output and tool support is **per endpoint, not per model**. Set `provider.preferences.require_parameters: true` when using `tools`/`response_format` so routing never lands on an endpoint lacking them. Streaming with tools/structured outputs emits valid partial JSON.

## Recommendation

- **Primary: `anthropic/claude-haiku-5.5`** — cheapest realistic total cost in the tier (thanks to $0.01/M cache reads on a resend-heavy chat pattern), 1M context, top-tier tool-call reliability, optional reasoning. Best fit for a BYO-key consumer app where users notice bad tool calls more than 2 IQ points.
- **Fallback 1: `z-ai/glm-5.3-flash`** — highest agentic index in the value tier, same output price, richer tool knobs (`parallel_tool_calls`); accept the mandatory-reasoning overhead by pinning effort `low`.
- **Fallback 2: `openai/gpt-5.6-luna`** — 2x cost but the most reliable function-calling/strict-schema stack; good default if you want zero tool-call support tickets.
- Optional escalation tier: `moonshotai/kimi-k3.1-pro` for hard, long-horizon plan rewrites; budget floor: `deepseek/deepseek-v4.1-flash-1017`.

Auto-updating aliases `~z-ai/glm-flash-latest` and `~deepseek/deepseek-flash-latest` exist if you'd rather never break on version bumps — at the cost of silent model/prompting changes and snapshot-quality surprises (e.g. the alias currently still resolves toward the weaker Sept DeepSeek snapshot).

## Data provenance

- `GET https://openrouter.ai/api/v1/models` (fetched 2026-10-24, snapshot saved at `.scratch/research/models.json`)
- Per-model endpoint pricing: `GET https://openrouter.ai/api/v1/models/{id}/endpoints`
- AA intelligence/agentic/coding indices as embedded in the models payload (Artificial Analysis via OpenRouter)
- Docs: https://openrouter.ai/docs/features/structured-outputs
