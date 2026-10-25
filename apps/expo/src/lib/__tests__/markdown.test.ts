import { describe, expect, it } from 'vitest';
import { hasVisibleContent, parseCoachMarkdown, parseInline } from '../markdown';

describe('parseInline', () => {
  it('plain text stays a single plain segment', () => {
    expect(parseInline('Easy aerobic 40m')).toEqual([{ text: 'Easy aerobic 40m', bold: false }]);
  });

  it('paired ** converts to a bold segment', () => {
    expect(parseInline('**Mon**: recovery jog')).toEqual([
      { text: 'Mon', bold: true },
      { text: ': recovery jog', bold: false },
    ]);
  });

  it('multiple bolds in one line', () => {
    expect(parseInline('**Mon** easy, **Tue** quality')).toEqual([
      { text: 'Mon', bold: true },
      { text: ' easy, ', bold: false },
      { text: 'Tue', bold: true },
      { text: ' quality', bold: false },
    ]);
  });

  it('full-bold line', () => {
    expect(parseInline('**Week 50km · Load ▲**')).toEqual([
      { text: 'Week 50km · Load ▲', bold: true },
    ]);
  });

  it('unpaired ** drops the marks but keeps the words', () => {
    expect(parseInline('**Mon: 5km easy')).toEqual([{ text: 'Mon: 5km easy', bold: false }]);
  });

  it('paired backticks become code segments (styled, not stripped)', () => {
    expect(parseInline('hold `5:10 /km` at **Z4** pace')).toEqual([
      { text: 'hold ', bold: false },
      { text: '5:10 /km', bold: false, code: true },
      { text: ' at ', bold: false },
      { text: 'Z4', bold: true },
      { text: ' pace', bold: false },
    ]);
  });

  it('unpaired backticks still drop the marks but keep the words', () => {
    expect(parseInline('run `4x1km at **Z4** pace')).toEqual([
      { text: 'run 4x1km at ', bold: false },
      { text: 'Z4', bold: true },
      { text: ' pace', bold: false },
    ]);
  });

  it('empty input yields no segments', () => {
    expect(parseInline('')).toEqual([]);
    expect(parseInline(undefined as unknown as string)).toEqual([]);
  });
});

describe('parseCoachMarkdown', () => {
  it('splits a real reply into text, bullets and gaps', () => {
    const lines = parseCoachMarkdown(
      '**Week 50km · Load ▲**\nWatch: HRV.\n\n**Mon**:\n- 6km recovery Z1\n- strides 4x15s',
    );
    expect(lines).toEqual([
      { kind: 'text', segs: [{ text: 'Week 50km · Load ▲', bold: true }] },
      { kind: 'text', segs: [{ text: 'Watch: HRV.', bold: false }] },
      { kind: 'gap', segs: [] },
      { kind: 'text', segs: [{ text: 'Mon', bold: true }, { text: ':', bold: false }] },
      { kind: 'bullet', segs: [{ text: '6km recovery Z1', bold: false }] },
      { kind: 'bullet', segs: [{ text: 'strides 4x15s', bold: false }] },
    ]);
  });

  it('bullets keep inline bold', () => {
    expect(parseCoachMarkdown('- **Main set** 4x1km Z4')[0]).toEqual({
      kind: 'bullet',
      segs: [
        { text: 'Main set', bold: true },
        { text: ' 4x1km Z4', bold: false },
      ],
    });
  });

  it('dash not followed by space stays text', () => {
    expect(parseCoachMarkdown('-5°C morning — layer up')[0]!.kind).toBe('text');
  });

  it('handles \\r\\n line endings', () => {
    const lines = parseCoachMarkdown('a\r\n- b\r\n\r\nc');
    expect(lines.map((l) => l.kind)).toEqual(['text', 'bullet', 'gap', 'text']);
  });

  it('empty source yields one gap line (renderer shows nothing)', () => {
    expect(parseCoachMarkdown('')).toEqual([{ kind: 'gap', segs: [] }]);
  });
});

describe('parseCoachMarkdown — markdown v2 blocks', () => {
  it('headers (## / ###) carry their level and keep inline bold', () => {
    expect(parseCoachMarkdown('## This week\n### Race prep **notes**')).toEqual([
      { kind: 'header', segs: [{ text: 'This week', bold: false }], level: 2 },
      {
        kind: 'header',
        segs: [
          { text: 'Race prep ', bold: false },
          { text: 'notes', bold: true },
        ],
        level: 3,
      },
    ]);
  });

  it('# degrades to level 2, and a bare #hash tag is not a header', () => {
    expect(parseCoachMarkdown('# Big title')[0]).toMatchObject({ kind: 'header', level: 2 });
    expect(parseCoachMarkdown('issue #12 stays text')[0]!.kind).toBe('text');
  });

  it('parses a pipe table: header row, dropped separator, body cells', () => {
    const blocks = parseCoachMarkdown(
      '| Segment | Pace | Time |\n|---|:---:|---:|\n| Easy | `5:45 /km` | 40m |\n| **Tempo** | 4:55 /km | 2x10m |',
    );
    expect(blocks).toHaveLength(1);
    const t = blocks[0]!;
    if (t.kind !== 'table') throw new Error('expected table');
    expect(t.header).toEqual([
      [{ text: 'Segment', bold: false }],
      [{ text: 'Pace', bold: false }],
      [{ text: 'Time', bold: false }],
    ]);
    expect(t.rows).toEqual([
      [[{ text: 'Easy', bold: false }], [{ text: '5:45 /km', bold: false, code: true }], [{ text: '40m', bold: false }]],
      [
        [{ text: 'Tempo', bold: true }],
        [{ text: '4:55 /km', bold: false }],
        [{ text: '2x10m', bold: false }],
      ],
    ]);
  });

  it('a table without a separator row still renders (header = first row)', () => {
    const blocks = parseCoachMarkdown('| Mon | Tue |\n| 5km | 8km |');
    const t = blocks[0]!;
    if (t.kind !== 'table') throw new Error('expected table');
    expect(t.header).toEqual([[{ text: 'Mon', bold: false }], [{ text: 'Tue', bold: false }]]);
    expect(t.rows).toEqual([[[{ text: '5km', bold: false }], [{ text: '8km', bold: false }]]]);
  });

  it('a lone separator row (mid-stream table) produces no block', () => {
    expect(parseCoachMarkdown('|---|---|')).toEqual([]);
  });

  it('text after a table is not swallowed into it', () => {
    const blocks = parseCoachMarkdown('| a | b |\n| 1 | 2 |\n\nPlain line');
    expect(blocks.map((b) => b.kind)).toEqual(['table', 'gap', 'text']);
  });

  it('numbered lists keep their marker and parse inline bold', () => {
    expect(parseCoachMarkdown('1. Warm up **easy**\n2. 4x1km hard')).toEqual([
      {
        kind: 'number',
        marker: '1.',
        segs: [
          { text: 'Warm up ', bold: false },
          { text: 'easy', bold: true },
        ],
      },
      { kind: 'number', marker: '2.', segs: [{ text: '4x1km hard', bold: false }] },
    ]);
  });

  it('--- renders a divider row', () => {
    expect(parseCoachMarkdown('advice\n\n---\n\nplan').map((b) => b.kind)).toEqual([
      'text',
      'gap',
      'hr',
      'gap',
      'text',
    ]);
  });

  it('code fences strip the markers and keep the lines as text', () => {
    const blocks = parseCoachMarkdown('```\n4x1km @ 5:00\n2min jog\n```');
    expect(blocks).toEqual([
      { kind: 'text', segs: [{ text: '4x1km @ 5:00', bold: false }] },
      { kind: 'text', segs: [{ text: '2min jog', bold: false }] },
    ]);
  });

  it('an unterminated fence degrades to text lines (streaming grace)', () => {
    const blocks = parseCoachMarkdown('```\nstill streaming');
    expect(blocks).toEqual([{ kind: 'text', segs: [{ text: 'still streaming', bold: false }] }]);
  });

  it('a full coach reply mixes headers, table, list and text', () => {
    const blocks = parseCoachMarkdown(
      '## Your paces\n\n| Zone | Pace |\n|---|---|\n| Easy | `5:45 /km` |\n\n**Plan**:\n- Tue intervals\n- Sat long run\n\n---\n\nFuel 60g carbs/hour.',
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'header',
      'gap',
      'table',
      'gap',
      'text',
      'bullet',
      'bullet',
      'gap',
      'hr',
      'gap',
      'text',
    ]);
    expect(hasVisibleContent(blocks)).toBe(true);
  });

  it('gap-only streams report no visible content', () => {
    expect(hasVisibleContent(parseCoachMarkdown('\n\n'))).toBe(false);
    expect(hasVisibleContent(parseCoachMarkdown(''))).toBe(false);
  });
});
