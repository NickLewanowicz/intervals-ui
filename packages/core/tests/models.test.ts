/**
 * models.ts unit tests (round 23): chatUrlFor base-URL normalization for
 * OpenAI-compatible endpoints, and the `compatible` init flag that strips the
 * OpenRouter-only body extras for strict servers (OpenAI 400s on unknown
 * body arguments).
 */
import { describe, expect, it } from 'vitest';
import {
  chatUrlFor,
  OPENROUTER_CHAT_URL,
  openRouterFetchInit,
  type OpenRouterRequestInit,
} from '../src/models';
import { DEFAULT_MODEL_ID, resolveModel } from '../src/prompts/coach';

const init = (over: Partial<OpenRouterRequestInit> = {}): OpenRouterRequestInit => ({
  apiKey: 'sk-test',
  model: resolveModel(DEFAULT_MODEL_ID),
  messages: [{ role: 'user', content: 'hi' }],
  ...over,
});

describe('chatUrlFor', () => {
  it('defaults to the OpenRouter chat URL for empty/absent bases', () => {
    expect(chatUrlFor()).toBe(OPENROUTER_CHAT_URL);
    expect(chatUrlFor(null)).toBe(OPENROUTER_CHAT_URL);
    expect(chatUrlFor('')).toBe(OPENROUTER_CHAT_URL);
    expect(chatUrlFor('   ')).toBe(OPENROUTER_CHAT_URL);
  });

  it('appends /chat/completions to versioned bases (OpenAI convention)', () => {
    expect(chatUrlFor('http://127.0.0.1:8099/v1')).toBe('http://127.0.0.1:8099/v1/chat/completions');
    expect(chatUrlFor('https://api.openai.com/v1')).toBe('https://api.openai.com/v1/chat/completions');
    expect(chatUrlFor('http://localhost:1234/v1')).toBe('http://localhost:1234/v1/chat/completions');
    expect(chatUrlFor('http://localhost:11434/v1')).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('strips trailing slashes before appending', () => {
    expect(chatUrlFor('https://api.groq.com/openai/v1/')).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(chatUrlFor('https://api.together.xyz/v1///')).toBe('https://api.together.xyz/v1/chat/completions');
  });

  it('passes through a full endpoint already ending in /chat/completions', () => {
    expect(chatUrlFor('https://openrouter.ai/api/v1/chat/completions')).toBe(OPENROUTER_CHAT_URL);
    expect(chatUrlFor('http://127.0.0.1:8099/v1/chat/completions/')).toBe(
      'http://127.0.0.1:8099/v1/chat/completions',
    );
  });
});

describe('openRouterFetchInit compatible flag', () => {
  it('default keeps the OpenRouter router extras (worker behavior unchanged)', () => {
    const body = JSON.parse(String(openRouterFetchInit(init()).body)) as Record<string, unknown>;
    expect(body.provider).toEqual({ sort: 'throughput', require_parameters: true });
    expect(body.tool_choice).toBe('auto');
    expect(body.stream).toBe(false);
  });

  it('compatible omits provider/reasoning extras, keeps the shared shape', () => {
    const body = JSON.parse(
      String(openRouterFetchInit(init({ compatible: true })).body),
    ) as Record<string, unknown>;
    expect(body.provider).toBeUndefined();
    expect(body.reasoning).toBeUndefined();
    expect(body.model).toBeTypeOf('string');
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.tool_choice).toBe('auto');
    expect(body.stream).toBe(false);
  });

  it('compatible still sends bearer auth but drops the OpenRouter attribution headers', () => {
    const headers = openRouterFetchInit(init({ compatible: true })).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
    // custom headers force a CORS preflight most OpenAI-compatible endpoints
    // reject — without them the browser direct path only needs auth+json
    expect(headers['HTTP-Referer']).toBeUndefined();
    expect(headers['X-Title']).toBeUndefined();
  });

  it('default keeps the OpenRouter attribution headers', () => {
    const headers = openRouterFetchInit(init()).headers as Record<string, string>;
    expect(headers['HTTP-Referer']).toBe('https://intervals.imnick.dev');
    expect(headers['X-Title']).toBe('intervals coach');
  });
});
