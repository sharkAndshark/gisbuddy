// Pre-populate electron-builder caches for Windows release builds.
//
// Why is this needed?  electron-builder downloads 3 zip archives at build
// time and extracts them with 7zip.  Two of them contain POSIX symlinks:
//
//   winCodeSign-2.6.0.7z  — darwin .dylib symlinks
//   nsis-3.0.4.1.7z       — (harmless, but still needs extraction)
//   nsis-resources-3.4.0.7z — StdUtils, Nsis7z plugins (missing from nsis)
//
// Windows users lack SeCreateSymbolicLinkPrivilege by default, so 7zip
// fails with "Access is denied" on symbolic links.  This script downloads
// all three archives and extracts them with -snl (skip symbolic links),
// pre-staging the cache so electron-builder never has to.
//
// Usage:
//   node scripts/prepare-electron-builder-cache.mjs
//
// This is safe to run repeatedly (idempotent — skips already-populated dirs).

import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const CACHE = join(homedir(), 'AppData', 'Local', 'electron-builder', 'Cache');
const SEVEN_ZIP = join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

const ARCHIVES = [
  {
    name: 'winCodeSign',
    version: 'winCodeSign-2.6.0',
    url: 'https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z',
    needsSnl: true, // macOS .dylib symlinks
  },
  {
    name: 'nsis',
    version: 'nsis-3.0.4.1',
    url: 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z',
    needsSnl: false,
  },
  {
    name: 'nsis-resources',
    version: 'nsis-3.0.4.1', // extracted into the same nsis-3.0.4.1 dir
    url: 'https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.0/nsis-resources-3.4.0.7z',
    needsSnl: false,
  },
];

async function download(url, dest) {
  console.log(`  downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(dest, buf);
  console.log(`  saved ${(buf.length / 1048576).toFixed(1)} MiB`);
}

function extract(archivePath, destDir, needsSnl) {
  const args = ['x', archivePath, `-o${destDir}`, '-y'];
  if (needsSnl) args.push('-snl'); // skip symbolic links
  const r = spawnSync(SEVEN_ZIP, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`7za extract failed (exit ${r.status})`);
  }
}

async function main() {
  mkdirSync(CACHE, { recursive: true });

  for (const archive of ARCHIVES) {
    const destDir = join(CACHE, archive.name, archive.version);
    if (existsSync(destDir) && existsSync(join(CACHE, archive.name, `${archive.version}.7z`))) {
      console.log(`✓ ${archive.name} cache ready (${destDir})`);
      continue;
    }

    console.log(`\n=== Preparing ${archive.name} cache ===`);

    // Reset target dir
    rmSync(destDir, { recursive: true, force: true });
    mkdirSync(destDir, { recursive: true });

    // Download to temp, then extract
    const zipPath = join(tmpdir(), `${archive.name}-${Date.now()}.7z`);
    try {
      await download(archive.url, zipPath);
      // Also save a copy to the cache dir so electron-builder recognizes it
      const cacheZip = join(CACHE, archive.name, `${archive.version}.7z`);
      require('fs').copyFileSync(zipPath, cacheZip);
      extract(zipPath, destDir, archive.needsSnl);
      console.log(`  ✓ ${archive.name} ready`);
    } finally {
      try { rmSync(zipPath, { force: true }); } catch { /* ignore */ }
    }
  }

  console.log('\n✓ All electron-builder caches ready');
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
