/**
 * OpenRouter call helpers shared by the worker and the eval harness.
 * BYO-key: the API key always comes from the user's PocketBase record
 * (or .env for eval tooling) — never bundled, never logged.
 */
import type { ModelChoice } from './prompts/coach';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface OpenRouterTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON schema
  };
}

/** The coach's tool surface — mirrors proposal.ts validators exactly. */
export const COACH_TOOLS: OpenRouterTool[] = [
  {
    type: 'function',
    function: {
      name: 'propose_event',
      description:
        'Propose adding a planned workout or race to the calendar. The athlete confirms it in a modal before it is written.',
      parameters: {
        type: 'object',
        required: ['start_date_local', 'name'],
        properties: {
          start_date_local: {
            type: 'string',
            description: 'Athlete-local start "YYYY-MM-DDTHH:mm" (no timezone suffix)',
          },
          name: { type: 'string', description: 'Short human title' },
          category: {
            type: 'string',
            enum: ['WORKOUT', 'RACE_A', 'RACE_B', 'RACE_C'],
            description: 'WORKOUT for training; RACE_A goal race; RACE_B/C lower priority',
          },
          type: { type: 'string', enum: ['Run', 'TrailRun', 'VirtualRun'], description: 'Sport; default Run' },
          description: {
            type: 'string',
            description:
              'Workout spec in intervals.icu syntax: section lines (Warmup / Main Set 4x / Cooldown) + "- " steps like "- 10m Z2 Pace". Parsed into the structured workout.',
          },
          distance: { type: 'number', description: 'Total distance in meters' },
          moving_time: { type: 'number', description: 'Total duration in seconds' },
          rationale: { type: 'string', description: 'One sentence why this session' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_event',
      description:
        'Propose modifying an existing calendar entry. Reference it by its #id from the calendar digest.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'number', description: 'intervals.icu event id from the digest' },
          name: { type: 'string' },
          description: { type: 'string' },
          start_date_local: { type: 'string', description: 'New local start "YYYY-MM-DDTHH:mm"' },
          distance: { type: 'number' },
          moving_time: { type: 'number' },
          category: { type: 'string', enum: ['WORKOUT', 'RACE_A', 'RACE_B', 'RACE_C'] },
          rationale: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_event',
      description: 'Propose removing a calendar entry by its #id.',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'number' },
          rationale: { type: 'string' },
        },
      },
    },
  },
];

export interface OpenRouterRequestInit {
  apiKey: string;
  model: ModelChoice;
  messages: OpenRouterMessage[];
  tools?: OpenRouterTool[];
  stream?: boolean;
  signal?: AbortSignal;
}

/**
 * Build the fetch init for an OpenRouter chat call. Always sets
 * require_parameters so tool calls never route to providers lacking them
 * (docs/research/openrouter-models-brief.md caveat).
 */
export function openRouterFetchInit(init: OpenRouterRequestInit): RequestInit {
  const body: Record<string, unknown> = {
    model: init.model.id,
    messages: init.messages,
    tools: init.tools,
    tool_choice: 'auto',
    stream: init.stream ?? false,
    provider: {
      sort: 'throughput',
      require_parameters: true,
    },
  };
  if (init.model.reasoningEffort) {
    body.reasoning = { effort: init.model.reasoningEffort };
  }
  return {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${init.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://intervals.imnick.dev',
      'X-Title': 'intervals coach',
    },
    body: JSON.stringify(body),
    signal: init.signal,
  };
}

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
