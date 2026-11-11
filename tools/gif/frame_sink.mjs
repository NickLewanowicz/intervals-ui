// Tiny frame sink for GIF capture: receives raw JPEG frames from the
// playwright sandbox (which has fetch but no fs) and writes them to disk
// with a wall-clock receipt log for faithful GIF timing.
//   POST /start            {clip:"name"} -> resets /tmp/gif-frames/<name>/
//   POST /frame?clip=name  raw jpeg body   -> <clip>/<seq>.jpg, logs seq\tms
//   GET  /count?clip=name  -> {clip, frames}
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/tmp/gif-frames';
let seq = 0;
let clip = 'default';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/start') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      clip = (() => { try { return JSON.parse(body).clip ?? 'default'; } catch { return 'default'; } })();
      seq = 0;
      const dir = path.join(ROOT, clip);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(ROOT, `${clip}.tsv`), 'seq\tms\n');
      res.end(JSON.stringify({ started: clip }));
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/frame') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      seq += 1;
      const dir = path.join(ROOT, clip);
      fs.writeFileSync(path.join(dir, `${String(seq).padStart(5, '0')}.jpg`), Buffer.concat(chunks));
      fs.appendFileSync(path.join(ROOT, `${clip}.tsv`), `${seq}\t${Date.now()}\n`);
      res.end(JSON.stringify({ seq }));
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/count') {
    const dir = path.join(ROOT, url.searchParams.get('clip') ?? clip);
    const n = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).length : 0;
    res.end(JSON.stringify({ clip, frames: n }));
    return;
  }
  res.statusCode = 404;
  res.end('nope');
});

server.listen(8098, '127.0.0.1', () => console.log('frame sink on :8098'));
