#!/usr/bin/env node
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/renderer.ts'],
  bundle: true,
  outfile: 'dist/renderer/bundle.js',
  format: 'iife',
  platform: 'node',
  target: 'es2022',
  external: [
    'electron',
    'fs',
    'path',
    'os',
    'child_process',
    'util',
    'crypto',
  ],
  loader: {
    '.css': 'text',
  },
  sourcemap: true,
});

console.log('Renderer bundled successfully');
