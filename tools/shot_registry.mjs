#!/usr/bin/env node
/**
 * shot_registry.mjs — centralized screenshot registry for the intervals-ui
 * multi-agent flow. Node stdlib only (no deps).
 *
 * Every agent routes captures through here so that:
 *  - files land in ONE browsable tree (anyone can "watch the folder"):
 *      qa-screenshots/registry/<YYYY-MM-DD>/<sha>/<agent>/<surface>-<theme>-<platform>-<HHMMSS>.png
 *  - each PNG carries its own metadata in tEXt chunks (Author, Surface, Commit,
 *    Theme, Platform, TimestampISO) — survives copies, readable by any tool
 *  - a sidecar .json next to each PNG has the full metadata + git dirty state
 *  - qa-screenshots/registry/index.jsonl is the append-only machine index
 *  - qa-screenshots/registry/latest/<agent>/<surface>-<theme>-<platform>.png is
 *    always the most recent state per agent+surface (the "what does it look
 *    like right now" view)
 *
 * Usage:
 *   node tools/shot_registry.mjs capture --file <png> --surface <name> --agent <name>
 *        [--platform web|android|ios] [--theme dark|light] [--width N] [--note "..."] [--move]
 *   node tools/shot_registry.mjs index [--agent X] [--surface Y] [--since <ts|2h|3d>]
 *   node tools/shot_registry.mjs read   --file <png>     # parse tEXt back out
 *
 * (c) internal tooling; CRC32 + PNG chunk writer hand-rolled per the PNG spec.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG_ROOT = path.join(REPO_ROOT, 'qa-screenshots', 'registry');
const INDEX_FILE = path.join(REG_ROOT, 'index.jsonl');
const LATEST_ROOT = path.join(REG_ROOT, 'latest');

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PLATFORMS = ['web', 'android', 'ios'];
const THEMES = ['dark', 'light'];

function die(msg) {
  console.error(`shot_registry: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- PNG chunks
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: 4B big-endian length + type + data + CRC32(type||data). */
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function parseChunks(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG (bad signature)');
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    if (off + 8 > buf.length) throw new Error('truncated chunk header');
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const dataEnd = off + 8 + len;
    if (dataEnd + 4 > buf.length) throw new Error(`truncated ${type} chunk`);
    chunks.push({ type, start: off, end: dataEnd + 4 });
    if (type === 'IEND') break;
    off = dataEnd + 4;
  }
  return chunks;
}

/**
 * Insert/replace tEXt chunks ({keyword: text}) right after IHDR.
 * Existing tEXt chunks with the same keywords are removed first, so re-stamping
 * is idempotent. tEXt payload is Latin-1 keyword \0 text per the PNG spec.
 */
function stampPng(buf, texts) {
  const chunks = parseChunks(buf);
  const keywords = new Set(Object.keys(texts));
  const ihdr = chunks.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('PNG has no IHDR chunk');
  const newChunks = Object.entries(texts).map(([k, v]) => {
    if (k.length < 1 || k.length > 79) throw new Error(`bad tEXt keyword length: ${k}`);
    const text = String(v).replace(/[^\x20-\x7e\xa1-\xff]/g, '?'); // Latin-1 safe
    return pngChunk('tEXt', Buffer.concat([Buffer.from(k, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]));
  });
  const parts = [PNG_SIG];
  let inserted = false;
  for (const c of chunks) {
    if (c.type === 'tEXt') {
      const kStart = c.start + 8;
      const kEnd = buf.indexOf(0, kStart); // tEXt: keyword \0 text
      const kw = kEnd > kStart ? buf.toString('latin1', kStart, kEnd) : '';
      if (keywords.has(kw)) continue; // drop stale stamp for this keyword
    }
    parts.push(buf.subarray(c.start, c.end));
    if (c.type === 'IHDR') {
      parts.push(...newChunks);
      inserted = true;
    }
  }
  if (!inserted) throw new Error('failed to insert tEXt chunks');
  return Buffer.concat(parts);
}

function readTextChunks(buf) {
  const out = {};
  for (const c of parseChunks(buf)) {
    if (c.type !== 'tEXt') continue;
    const start = c.start + 8;
    const z = buf.indexOf(0, start);
    if (z > start) out[buf.toString('latin1', start, z)] = buf.toString('latin1', z + 1, c.end - 4);
  }
  return out;
}

function pngDims(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// ---------------------------------------------------------------------- git
function git(args) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

function gitInfo() {
  const sha = git(['rev-parse', '--short', 'HEAD']);
  const st = git(['status', '--porcelain']);
  const lines = st.status === 0 ? st.stdout.split('\n').filter(Boolean) : [];
  return {
    sha: sha.status === 0 ? sha.stdout.trim() : 'uncommitted',
    dirty: lines.length > 0,
    dirtyCount: lines.length,
    dirtyFiles: lines.slice(0, 50),
  };
}

// -------------------------------------------------------------------- utils
function safeName(name) {
  const s = String(name).trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s) die('name required (after sanitizing)');
  return s.slice(0, 64);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[++i] ?? die(`missing value for ${a}`);
    else out._.push(a);
  }
  return out;
}

function parseSince(s) {
  const rel = /^(\d+)(m|h|d)$/.exec(s);
  if (rel) {
    const mult = { m: 60e3, h: 3600e3, d: 86400e3 }[rel[2]];
    return Date.now() - Number(rel[1]) * mult;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) die(`--since: cannot parse "${s}" (use ISO ts or Nd/Nh/Nm)`);
  return t;
}

const pad = (n) => String(n).padStart(2, '0');

// ----------------------------------------------------------------- commands
function cmdCapture(opts) {
  for (const req of ['file', 'surface', 'agent']) if (!opts[req]) die(`capture requires --${req}`);
  const src = path.resolve(opts.file);
  if (!fs.existsSync(src)) die(`no such file: ${src}`);
  const platform = opts.platform ?? 'web';
  const theme = opts.theme ?? 'dark';
  if (!PLATFORMS.includes(platform)) die(`--platform must be one of ${PLATFORMS.join('|')}`);
  if (!THEMES.includes(theme)) die(`--theme must be one of ${THEMES.join('|')}`);

  const agent = safeName(opts.agent);
  const surface = safeName(opts.surface);
  const raw = fs.readFileSync(src);
  if (!raw.subarray(0, 8).equals(PNG_SIG)) die(`not a PNG (bad signature): ${src}`);

  const g = gitInfo();
  const now = new Date();
  const ts = now.toISOString();
  const dateDir = ts.slice(0, 10); // YYYY-MM-DD (UTC)
  const hhmmss = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const dims = pngDims(raw);

  const dir = path.join(REG_ROOT, dateDir, g.sha, agent);
  fs.mkdirSync(dir, { recursive: true });
  let base = `${surface}-${theme}-${platform}-${hhmmss}`;
  if (fs.existsSync(path.join(dir, `${base}.png`))) base = `${base}-${now.getUTCMilliseconds()}`; // same-second collision
  const destPng = path.join(dir, `${base}.png`);

  const stamp = {
    Author: agent, // tEXt keyword spec-compatible; agent identity
    Surface: surface,
    Commit: g.sha,
    Theme: theme,
    Platform: platform,
    TimestampISO: ts,
    Width: String(opts.width ? Number(opts.width) : dims.width),
    Height: String(dims.height),
    Software: 'shot-registry',
  };
  if (opts.note) stamp.Note = opts.note;
  const stamped = stampPng(raw, stamp);
  fs.writeFileSync(destPng, stamped);

  const meta = {
    ts,
    sha: g.sha,
    dirty: g.dirty,
    dirtyCount: g.dirtyCount,
    dirtyFiles: g.dirtyFiles,
    agent,
    surface,
    platform,
    theme,
    width: opts.width ? Number(opts.width) : dims.width,
    height: dims.height,
    bytes: stamped.length,
    source: path.relative(REPO_ROOT, src),
    note: opts.note ?? '',
  };
  fs.writeFileSync(`${destPng}.json`, JSON.stringify(meta, null, 2) + '\n');

  const relPath = path.relative(REPO_ROOT, destPng);
  const entry = {
    ts,
    sha: g.sha,
    agent,
    surface,
    platform,
    theme,
    path: relPath,
    w: meta.width,
    h: meta.height,
    bytes: meta.bytes,
    note: opts.note ?? '',
  };
  fs.mkdirSync(REG_ROOT, { recursive: true });
  fs.appendFileSync(INDEX_FILE, JSON.stringify(entry) + '\n');

  const latestDir = path.join(LATEST_ROOT, agent);
  fs.mkdirSync(latestDir, { recursive: true });
  const latestPng = path.join(latestDir, `${surface}-${theme}-${platform}.png`);
  fs.copyFileSync(destPng, latestPng);
  fs.writeFileSync(`${latestPng}.json`, JSON.stringify(meta, null, 2) + '\n');

  if (opts.move) fs.rmSync(src);

  console.log(
    JSON.stringify(
      {
        registered: relPath,
        latest: path.relative(REPO_ROOT, latestPng),
        sidecar: `${relPath}.json`,
        entry,
      },
      null,
      2,
    ),
  );
}

function cmdIndex(opts) {
  const lines = fs.existsSync(INDEX_FILE) ? fs.readFileSync(INDEX_FILE, 'utf8').split('\n').filter(Boolean) : [];
  let entries = lines.map((l, i) => {
    try {
      return JSON.parse(l);
    } catch {
      die(`index.jsonl line ${i + 1} is not valid JSON`);
    }
  });
  if (opts.agent) entries = entries.filter((e) => e.agent === safeName(opts.agent));
  if (opts.surface) entries = entries.filter((e) => e.surface === safeName(opts.surface));
  if (opts.since) {
    const t = parseSince(opts.since);
    entries = entries.filter((e) => Date.parse(e.ts) >= t);
  }
  for (const e of entries) console.log(JSON.stringify(e));
  console.error(`# ${entries.length} of ${lines.length} entries${opts.agent || opts.surface || opts.since ? ' (filtered)' : ''}`);
}

function cmdRead(opts) {
  if (!opts.file) die('read requires --file <png>');
  const p = path.resolve(opts.file);
  if (!fs.existsSync(p)) die(`no such file: ${p}`);
  const buf = fs.readFileSync(p);
  const texts = readTextChunks(buf);
  const dims = pngDims(buf);
  console.log(JSON.stringify({ file: path.relative(REPO_ROOT, p), width: dims.width, height: dims.height, text: texts }, null, 2));
}

// --------------------------------------------------------------------- main
const [cmd, ...rest] = process.argv.slice(2);
const opts = parseArgs(rest);
if (cmd === 'capture') cmdCapture(opts);
else if (cmd === 'index') cmdIndex(opts);
else if (cmd === 'read') cmdRead(opts);
else {
  die(`unknown command "${cmd}". Use: capture | index | read  (see header comment for flags)`);
}
