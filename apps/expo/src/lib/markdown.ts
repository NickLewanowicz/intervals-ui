/**
 * Minimal markdown for coach replies (pure, unit tested) — FIX-5 from the
 * persona panel: replies shipped literal `**bold**` asterisks. This is NOT a
 * markdown library: exactly three transforms, the ones the coach actually
 * emits — paired `**bold**`, `- ` line bullets, stray backticks stripped.
 */

export interface InlineSeg {
  text: string;
  bold: boolean;
}

export type MdLineKind = 'text' | 'bullet' | 'gap';

export interface MdLine {
  kind: MdLineKind;
  segs: InlineSeg[];
}

/** Remove backticks (coach sometimes wraps names/splits in `code` marks). */
function stripBackticks(text: string): string {
  return text.replace(/`+/g, '');
}

/** "**a** b **c**" → [a!, " b ", c!] — unpaired ** falls back to plain text. */
export function parseInline(raw: string): InlineSeg[] {
  const clean = stripBackticks(raw ?? '');
  const segs: InlineSeg[] = [];
  // non-greedy pairs only; anything unmatched keeps its asterisks until the
  // final sweep below
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(clean); m; m = re.exec(clean)) {
    if (m.index > last) segs.push({ text: clean.slice(last, m.index), bold: false });
    segs.push({ text: m[1]!, bold: true });
    last = m.index + m[0].length;
  }
  if (last < clean.length) {
    // stray/unpaired ** → drop the marks, keep the words
    segs.push({ text: clean.slice(last).replace(/\*\*/g, ''), bold: false });
  }
  return segs.filter((s) => s.text.length > 0);
}

/**
 * Coach reply → renderable lines. `- ` prefixed lines become bullets (nested
 * bold still parses inside them); blank lines become gaps so section groups
 * survive; everything else is plain text with inline bold.
 */
export function parseCoachMarkdown(src: string): MdLine[] {
  const lines = (src ?? '').split(/\r?\n/);
  const out: MdLine[] = [];
  for (const line of lines) {
    const trimmedEnd = line.trimEnd();
    const bullet = /^-\s+/.exec(trimmedEnd.trimStart());
    if (bullet) {
      const content = trimmedEnd.trimStart().slice(bullet[0].length);
      out.push({ kind: 'bullet', segs: parseInline(content) });
    } else if (trimmedEnd.trim().length === 0) {
      out.push({ kind: 'gap', segs: [] });
    } else {
      out.push({ kind: 'text', segs: parseInline(trimmedEnd) });
    }
  }
  return out;
}
