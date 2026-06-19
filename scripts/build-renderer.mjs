#!/usr/bin/env node
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/renderer.ts'],
  bundle: true,
  outfile: 'dist/renderer/bundle.js',
  format: 'iife',
  platform: 'node',
  target: 'es2022',
  define: {
    'import.meta.url': JSON.stringify('file:///dist/renderer/bundle.js'),
  },
  external: [
    'electron',
    'fs', 'path', 'os', 'child_process', 'util', 'crypto', 'readline',
    'stream', 'events', 'buffer', 'url', 'http', 'https', 'net', 'tls',
    'zlib', 'querystring', 'assert',
    'node:fs', 'node:path', 'node:os', 'node:crypto', 'node:http',
  ],
  sourcemap: true,
});

console.log('Renderer bundled successfully');
