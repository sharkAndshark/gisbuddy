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
    // Electron renderer has nodeIntegration, so `process.versions.node` is set,
    // which makes pi-ai/pi-agent-core attempt ESM dynamic `import('node:fs')` etc.
    // The renderer doesn't support `node:` scheme dynamic imports, so we blank
    // `process.versions` to skip those Node-only code paths (Vertex ADC, Bun
    // sandbox env, OAuth helpers). `process.env` is left intact for isTestMode.
    'process.versions': '{}',
  },
  external: [
    'electron',
    'fs', 'path', 'os', 'child_process', 'util', 'crypto', 'readline',
    'stream', 'events', 'buffer', 'url', 'http', 'https', 'net', 'tls',
    'zlib', 'querystring', 'assert',
    'node:fs', 'node:path', 'node:os', 'node:crypto', 'node:http',
    // mistralai's optional dep; renderer never executes the mistral provider path.
    '@opentelemetry/api',
  ],
  sourcemap: true,
});

// Copy Leaflet CSS and icon images from npm package
fs.copyFileSync('node_modules/leaflet/dist/leaflet.css', 'dist/renderer/leaflet.css');
fs.cpSync('node_modules/leaflet/dist/images', 'dist/renderer/images', { recursive: true });

// Copy pi-web-ui Tailwind CSS (required by pi-chat-panel and sub-components)
fs.copyFileSync('node_modules/@earendil-works/pi-web-ui/dist/app.css', 'dist/renderer/app.css');
// KaTeX math fonts referenced by app.css via relative url(fonts/...)
fs.cpSync('node_modules/katex/dist/fonts', 'dist/renderer/fonts', { recursive: true });

console.log('Renderer bundled successfully');
