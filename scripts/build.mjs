import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
await mkdir(distDir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src', 'cli.js')],
  outfile: path.join(distDir, 'cli.js'),
  platform: 'node',
  format: 'esm',
  bundle: true,
  sourcemap: true,
  target: ['node18'],
  banner: {
    js: '#!/usr/bin/env node'
  }
});
