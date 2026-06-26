// Downloads a prepackaged GDAL Windows zip and extracts it into gdal-bin/.
// Source URL is taken from the first CLI arg or GDAL_WIN_URL env var.
//
// The zip may either contain its files at the root, or under a single
// top-level directory (e.g. gdal-3.x-win64/); the latter is stripped so
// gdal-bin/ ends up with bin/ + share/ + plugins/ laid out flat.
//
// Recommended sources (pick one, pin a version):
//   - GIS Internals nightly:  https://www.gisinternals.com/release.php
//   - Conda-force GDAL win-64: https://anaconda.org/conda-forge/gdal
//
// Usage:
//   node scripts/bundle-gdal-win.mjs <url>
//   GDAL_WIN_URL=https://... node scripts/bundle-gdal-win.mjs
import { mkdirSync, rmSync, existsSync, writeFileSync, readdirSync, renameSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const target = resolve(root, 'gdal-bin');
const url = process.argv[2] || process.env.GDAL_WIN_URL;

if (!url) {
  console.error(
    '[bundle-gdal-win] no URL provided. Pass it as an arg or set GDAL_WIN_URL.'
  );
  console.error('  e.g. node scripts/bundle-gdal-win.mjs https://example.com/gdal-win.zip');
  process.exit(1);
}

// Stage the download in OS temp dir.
const zipPath = join(tmpdir(), `gisbuddy-gdal-win-${Date.now()}.zip`);

console.log(`[bundle-gdal-win] downloading ${url}`);
const res = await fetch(url);
if (!res.ok || !res.body) {
  console.error(`[bundle-gdal-win] download failed: HTTP ${res.status}`);
  process.exit(1);
}
const ab = await res.arrayBuffer();
writeFileSync(zipPath, Buffer.from(ab));
console.log(`[bundle-gdal-win] saved ${(ab.byteLength / 1048576).toFixed(1)} MiB to ${zipPath}`);

// Reset target.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

// Extract with `tar -xf` (ships with Windows 10 1803+, macOS, Linux).
// We first extract into a staging dir so we can strip a single top-level
// folder if present.
const staging = join(tmpdir(), `gisbuddy-gdal-win-extract-${Date.now()}`);
mkdirSync(staging, { recursive: true });
const tar = spawnSync('tar', ['-xf', zipPath, '-C', staging], { stdio: 'inherit' });
if (tar.status !== 0) {
  console.error('[bundle-gdal-win] tar extraction failed (need Windows 10 1803+ or `tar` on PATH).');
  process.exit(tar.status ?? 1);
}

// Determine whether there's a single top-level dir to strip.
const entries = readdirSync(staging).filter((e) => !e.startsWith('.'));
let src = staging;
if (entries.length === 1) {
  const only = join(staging, entries[0]);
  if (statSync(only).isDirectory()) src = only;
}

// Move contents into gdal-bin/.
for (const e of readdirSync(src)) {
  renameSync(join(src, e), join(target, e));
}

// Cleanup.
rmSync(staging, { recursive: true, force: true });
rmSync(zipPath, { force: true });

const final = readdirSync(target);
console.log(`[bundle-gdal-win] ✓ extracted ${final.length} entries into gdal-bin/`);
console.log(final.slice(0, 20).map((e) => `  - ${e}`).join('\n'));
