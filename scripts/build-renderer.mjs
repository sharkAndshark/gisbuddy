#!/usr/bin/env node
import * as esbuild from 'esbuild';
import * as fs from 'fs';

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
  plugins: [{
    name: 'faux-provider',
    setup(build) {
      build.onResolve({ filter: /^@earendil-works\/pi-ai\/faux$/ }, () => ({
        path: fs.realpathSync('node_modules/@earendil-works/pi-ai/dist/providers/faux.js'),
        namespace: 'file',
      }));
    },
  }],
  sourcemap: true,
});

// Copy Leaflet CSS and icon images from npm package
fs.copyFileSync('node_modules/leaflet/dist/leaflet.css', 'dist/renderer/leaflet.css');
fs.cpSync('node_modules/leaflet/dist/images', 'dist/renderer/images', { recursive: true });

console.log('Renderer bundled successfully');
