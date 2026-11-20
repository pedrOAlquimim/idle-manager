import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

// Entries that run in Node or in a sandboxed preload: CommonJS, only `electron` left external.
const nodeEntries = [
  ['src/main/main.ts', 'dist/main.js'],
  ['src/preload/probe.ts', 'dist/probe.js'],
  ['src/preload/ui.ts', 'dist/ui-preload.js'],
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const [entry, outfile] of nodeEntries) {
  if (!existsSync(entry)) continue;
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'warning',
  });
}

if (existsSync('src/renderer/main.tsx')) {
  await build({
    entryPoints: ['src/renderer/main.tsx'],
    outdir: 'dist/renderer',
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome140',
    loader: { '.woff2': 'file', '.woff': 'file', '.png': 'file' },
    sourcemap: true,
    logLevel: 'warning',
  });
}

if (existsSync('src/renderer/index.html')) {
  mkdirSync('dist/renderer', { recursive: true });
  cpSync('src/renderer/index.html', 'dist/renderer/index.html');
}
