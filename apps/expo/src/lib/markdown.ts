/**
 * Markdown v2 for coach replies (pure, unit tested) — NOT a markdown library.
 * Exactly the subset the coach actually emits (docs/research/chat-ui-patterns.md
 * §2): **bold**, `- ` bullets, `1. ` numbered steps, `## `/`### ` section
 * headers, `| a | b |` pipe tables, `inline code` chips, `---` dividers.
 * Code fences degrade (fence markers stripped, lines kept). No nesting, no
 * images, no HTML. Every transform is pure so streaming re-parses are cheap
 * and partial (mid-table, mid-header) markdown renders gracefully.
 */

export interface InlineSeg {
  text: string;
  bold: boolean;
  /** `code` span — rendered as a monospace chip, not stripped. */
  code?: boolean;
}

export type MdLineKind = 'text' | 'bullet' | 'number' | 'header' | 'hr' | 'gap';

export interface MdLine {
  kind: MdLineKind;
  segs: InlineSeg[];
  /** header level (## = 2, ### = 3; # degrades to 2) */
  level?: 2 | 3;
  /** ordered-list glyph ("1.", "2.") for kind === 'number' */
  marker?: string;
}

export interface MdTable {
  kind: 'table';
  /** first non-separator row = header row (rendered emphasized) */
  header: InlineSeg[][];
  /** body rows; cells are inline segments */
  rows: InlineSeg[][][];
}

export type MdBlock = MdLine | MdTable;

const isBlock = (b: MdBlock): b is MdTable => b.kind === 'table';

/** "| a | b |" (or with leading/trailing pipes missing) → trimmed cells. */
function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

/** A table separator row: every cell is dashes/colons ("|---|:---:|"). */
function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * "`a` b **c**" → [a(code), " b ", c(bold)]. Paired backticks become code
 * segments FIRST (bold inside them stays literal); unpaired backticks fall
 * back to the old behavior — stripped, words kept. Unpaired ** drops its
 * marks too.
 */
export function parseInline(raw: string): InlineSeg[] {
  const clean = raw ?? '';
  const segs: InlineSeg[] = [];
  const codeRe = /`([^`]+)`/;
  let rest = clean;
  // pull paired `code` spans out, then bold-parse the text between them
  for (;;) {
    const m = codeRe.exec(rest);
    if (!m) break;
    segs.push(...plainSegs(rest.slice(0, m.index)));
    segs.push({ text: m[1]!, bold: false, code: true });
    rest = rest.slice(m.index + m[0].length);
  }
  segs.push(...plainSegs(rest));
  return segs.filter((s) => s.text.length > 0);
}

/** Bold pass + the unpaired-backtick fallback (strip the marks, keep words). */
function plainSegs(text: string): InlineSeg[] {
  return boldSegs(text).map((s) =>
    s.code ? s : { ...s, text: s.text.replace(/`+/g, '') },
  );
}

/** "**a** b **c**" → [a!, " b ", c!] — unpaired ** falls back to plain text. */
function boldSegs(text: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), bold: false });
    segs.push({ text: m[1]!, bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    // stray/unpaired ** → drop the marks, keep the words
    segs.push({ text: text.slice(last).replace(/\*\*/g, ''), bold: false });
  }
  return segs;
}

/**
 * Coach reply → renderable blocks. Contiguous `|`-rows fold into one table
 * block (separator rows dropped; first data row is the header); `## `/`### `
 * become headers; `1. ` becomes a numbered row; `- ` a bullet; `---` a
 * divider; blank lines gaps so section groups survive.
 */
export function parseCoachMarkdown(src: string): MdBlock[] {
  const lines = (src ?? '').split(/\r?\n/);
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // table: consecutive lines starting with '|'
    if (trimmed.startsWith('|')) {
      const block: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        block.push(lines[i]!);
        i += 1;
      }
      const dataRows = block.filter((l) => !isTableSeparator(l));
      if (dataRows.length > 0) {
        const [head, ...body] = dataRows;
        out.push({
          kind: 'table',
          header: splitTableRow(head!).map(parseInline),
          rows: body.map((r) => splitTableRow(r).map(parseInline)),
        });
      }
      continue;
    }

    // code fences: drop the fence markers, keep the inner lines as text
    const fence = /^```/.exec(trimmed);
    if (fence) {
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i]!.trim())) {
        out.push({ kind: 'text', segs: parseInline(lines[i]!.trimEnd()) });
        i += 1;
      }
      i += 1; // closing fence
      continue;
    }

    i += 1;
    if (trimmed.length === 0) {
      out.push({ kind: 'gap', segs: [] });
      continue;
    }
    const header = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (header) {
      out.push({
        kind: 'header',
        segs: parseInline(header[2]!),
        level: header[1]!.length === 3 ? 3 : 2,
      });
      continue;
    }
    if (/^-{3,}\s*$/.test(trimmed)) {
      out.push({ kind: 'hr', segs: [] });
      continue;
    }
    const bullet = /^-\s+/.exec(trimmed);
    if (bullet) {
      out.push({ kind: 'bullet', segs: parseInline(trimmed.slice(bullet[0].length)) });
      continue;
    }
    const numbered = /^(\d{1,2})[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      out.push({ kind: 'number', segs: parseInline(numbered[2]!), marker: `${numbered[1]}.` });
      continue;
    }
    out.push({ kind: 'text', segs: parseInline(trimmed) });
  }
  return out;
}

/** Blocks that carry visible content (renderer skips gap-only streams). */
export function hasVisibleContent(blocks: MdBlock[]): boolean {
  return blocks.some((b) => (isBlock(b) ? b.header.length + b.rows.length > 0 : b.kind !== 'gap'));
}
