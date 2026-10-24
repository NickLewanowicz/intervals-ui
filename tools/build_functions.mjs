/**
 * Bundle the coach API (apps/worker/src/index.ts) into a Pages advanced-mode
 * `_worker.js` dropped next to the web export assets (default:
 * apps/expo/dist/_worker.js). CI runs this AFTER `expo export` and BEFORE
 * `wrangler pages deploy`.
 *
 * Usage: node tools/build_functions.mjs [outputPath]
 */
import { build } from 'esbuild';

const out = process.argv[2] || new URL('../apps/expo/dist/_worker.js', import.meta.url).pathname;

const result = await build({
  entryPoints: [new URL('../apps/worker/src/index.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  minify: true,
  write: true,
  outfile: out,
  legalComments: 'none',
});

console.log(`✓ coach API bundled → ${out} (${result.metafile ? '' : ''}${(result.outputFiles?.[0]?.contents.length ?? 0 / 1024).toFixed(0)}KB min)`);
