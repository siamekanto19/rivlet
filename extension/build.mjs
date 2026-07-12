import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/service-worker.ts', 'src/content-script.ts', 'src/options.ts'], outdir: 'dist', bundle: true, format: 'iife', target: 'chrome120', minify: false, sourcemap: false });
await mkdir('.test', { recursive: true });
await build({ entryPoints: ['src/media.ts'], outfile: '.test/media.mjs', bundle: true, format: 'esm', platform: 'node', target: 'node20' });
await build({ entryPoints: ['src/download-capture.ts'], outfile: '.test/download-capture.mjs', bundle: true, format: 'esm', platform: 'node', target: 'node20' });
await cp('public', 'dist', { recursive: true });
