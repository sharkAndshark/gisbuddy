// Reorganizes GDAL files from a conda-forge env into gdal-bin/.
//
// On Windows, a conda-forge gdal install has this layout:
//   $PREFIX/Library/bin/       <- gdalinfo.exe, ogr2ogr.exe, *.dll
//   $PREFIX/Library/share/gdal/ <- GDAL data (csv, json)
//   $PREFIX/Library/share/proj/ <- PROJ data (tif, db)
//   $PREFIX/Library/lib/gdalplugins/ <- optional plugins
//
// We flatten it into:
//   gdal-bin/
//     *.exe, *.dll
//     gdal-data/     <- GDAL_DATA points here
//     proj-data/     <- PROJ_LIB / PROJ_DATA points here
//     plugins/       <- GDAL_DRIVER_PATH (optional)
//
// Usage:
//   node scripts/bundle-gdal-win-conda.mjs [condaPrefix]
//   CONDA_PREFIX=/path node scripts/bundle-gdal-win-conda.mjs
import {
  mkdirSync,
  rmSync,
  readdirSync,
  copyFileSync,
  statSync,
  existsSync,
} from 'fs';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const target = resolve(root, 'gdal-bin');

const condaPrefix = process.argv[2] || process.env.CONDA_PREFIX;
if (!condaPrefix) {
  console.error(
    '[bundle-gdal-win-conda] no conda prefix provided. ' +
      'Pass it as an arg or set CONDA_PREFIX.'
  );
  process.exit(1);
}

const libBin = join(condaPrefix, 'Library', 'bin');
const libShareGdal = join(condaPrefix, 'Library', 'share', 'gdal');
const libShareProj = join(condaPrefix, 'Library', 'share', 'proj');
const libGdalPlugins = join(condaPrefix, 'Library', 'lib', 'gdalplugins');

if (!existsSync(libBin)) {
  console.error(`[bundle-gdal-win-conda] ${libBin} not found — is gdal installed?`);
  process.exit(1);
}

// Reset target.
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

function copyDir(src, dst) {
  if (!existsSync(src)) return 0;
  mkdirSync(dst, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) {
      count += copyDir(s, d);
    } else {
      copyFileSync(s, d);
      count++;
    }
  }
  return count;
}

// 1. Binaries + DLLs from Library/bin/ → gdal-bin/
let binCount = 0;
for (const f of readdirSync(libBin)) {
  const lower = f.toLowerCase();
  if (lower.endsWith('.exe') || lower.endsWith('.dll')) {
    copyFileSync(join(libBin, f), join(target, f));
    binCount++;
  }
}
console.log(`[bundle-gdal-win-conda] copied ${binCount} exe/dll → gdal-bin/`);

// 2. GDAL data → gdal-bin/gdal-data/
const gdalDataCount = copyDir(libShareGdal, join(target, 'gdal-data'));
console.log(`[bundle-gdal-win-conda] copied ${gdalDataCount} gdal-data files`);

// 3. PROJ data → gdal-bin/proj-data/
const projDataCount = copyDir(libShareProj, join(target, 'proj-data'));
console.log(`[bundle-gdal-win-conda] copied ${projDataCount} proj-data files`);

// 4. Plugins → gdal-bin/plugins/ (optional)
const pluginCount = copyDir(libGdalPlugins, join(target, 'plugins'));
if (pluginCount) console.log(`[bundle-gdal-win-conda] copied ${pluginCount} plugin files`);

console.log('[bundle-gdal-win-conda] ✓ done');
