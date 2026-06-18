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
    'readline',
    'stream',
    'events',
    'buffer',
    'url',
    '@earendil-works/pi-coding-agent',
  ],
  sourcemap: true,
});

console.log('Renderer bundled successfully');
