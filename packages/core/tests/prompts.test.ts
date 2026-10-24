import { describe, expect, it } from 'vitest';
import { COACH_TOOLS, openRouterFetchInit, OPENROUTER_CHAT_URL } from '../src/models';
import { buildCoachSystemPrompt, DEFAULT_MODEL_ID, MODEL_ROSTER, resolveModel } from '../src/prompts/coach';

describe('buildCoachSystemPrompt', () => {
  const prompt = buildCoachSystemPrompt({
    today: '2026-10-24',
    units: 'km',
    calendarDigest: 'Mon 10-19: (none)\nTue 10-20: #145969946 Run club WORKOUT 8.5km planned / 8.8km done load 92',
    wellnessDigest: 'form -1.5 (neutral), hrv 61, rhr 50, sleep 7.8h',
    zonesDigest: 'Z1 Recovery <143bpm; Z5 Aerobic Endurance; threshold pace 3:42/km',
    athleteProfile: 'Training for a half marathon in December.',
  });

  it('embeds the context digests', () => {
    expect(prompt).toContain('2026-10-24');
    expect(prompt).toContain('#145969946');
    expect(prompt).toContain('3:42/km');
    expect(prompt).toContain('half marathon');
  });

  it('teaches the naming trap: propose, never claim writes', () => {
    expect(prompt).toContain('You never claim to have changed anything');
    expect(prompt).toContain('PROPOSE');
    expect(prompt).toMatch(/RACE_A/);
    expect(prompt).toMatch(/category.*WORKOUT/s);
  });

  it('describes intervals.icu description syntax', () => {
    expect(prompt).toContain('Main Set 4x');
    expect(prompt).toContain('Z2 Pace');
  });
});

describe('model roster', () => {
  it('defaults to the value-tier flash model', () => {
    expect(resolveModel(undefined).id).toBe(DEFAULT_MODEL_ID);
    expect(MODEL_ROSTER.map((m) => m.id)).toContain('anthropic/claude-haiku-5.5');
  });
  it('falls back to default on unknown preference', () => {
    expect(resolveModel('gpt-4').id).toBe(DEFAULT_MODEL_ID);
  });
});

describe('openRouterFetchInit', () => {
  it('requires parameters-capable providers and pins reasoning effort', () => {
    const init = openRouterFetchInit({
      apiKey: 'sk-or-test',
      model: resolveModel('z-ai/glm-5.3-flash'),
      messages: [{ role: 'user', content: 'hi' }],
      tools: COACH_TOOLS,
    });
    const body = JSON.parse(String(init.body));
    expect(body.provider.require_parameters).toBe(true);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.tools).toHaveLength(3);
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-or-test');
    expect(String((init as RequestInit).method)).toBe('POST');
  });

  it('omits reasoning for models without an effort pin', () => {
    const init = openRouterFetchInit({
      apiKey: 'k',
      model: resolveModel('anthropic/claude-haiku-5.5'),
      messages: [],
    });
    expect(JSON.parse(String(init.body)).reasoning).toBeUndefined();
  });

  it('has exactly the three coach tools with valid-looking schemas', () => {
    for (const t of COACH_TOOLS) {
      expect(t.function.parameters.type).toBe('object');
      expect(typeof t.function.description).toBe('string');
    }
  });
});
