import { describe, expect, it } from 'vitest';
import { parseCoachMarkdown, parseInline } from '../markdown';

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

  it('strips stray backticks everywhere', () => {
    expect(parseInline('run `4x1km` at **Z4** pace')).toEqual([
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
