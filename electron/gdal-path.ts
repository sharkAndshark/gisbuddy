import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Locates the bundled `gdal-bin/` directory if present.
 *
 * Candidates (checked in order):
 *   1. <repo>/gdal-bin           (dev / source checkout)
 *   2. <resources>/gdal-bin      (packaged app — extraResources)
 *   3. <cwd>/gdal-bin            (fallback)
 */
export function getBundledGdalPath(): string | null {
  const candidates = [
    path.join(__dirname, '../../gdal-bin'),
    process.resourcesPath ? path.join(process.resourcesPath, 'gdal-bin') : '',
    path.join(process.cwd(), 'gdal-bin'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Returns the bundled GDAL directory plus any extra environment variables
 * needed for the binaries to find their data files at runtime.
 *
 * On macOS (Homebrew-derived bundle) the data files are embedded or found
 * via rpath, so typically no extra env is needed.
 *
 * On Windows (conda-forge-derived bundle) the data files live in
 * `gdal-bin/gdal-data/` and `gdal-bin/proj-data/`; GDAL needs `GDAL_DATA`
 * and PROJ needs `PROJ_LIB` / `PROJ_DATA` to locate them.
 */
export interface BundledGdalEnv {
  /** Directory to prepend to PATH. */
  path: string;
  /** Extra env vars (GDAL_DATA, PROJ_LIB, …) to inject into spawned tools. */
  extraEnv: Record<string, string>;
}

export function getBundledGdalEnv(): BundledGdalEnv | null {
  const gdalPath = getBundledGdalPath();
  if (!gdalPath) return null;

  const extraEnv: Record<string, string> = {};

  const gdalData = path.join(gdalPath, 'gdal-data');
  if (fs.existsSync(gdalData)) extraEnv.GDAL_DATA = gdalData;

  const projData = path.join(gdalPath, 'proj-data');
  if (fs.existsSync(projData)) {
    extraEnv.PROJ_LIB = projData;
    extraEnv.PROJ_DATA = projData; // PROJ ≥ 9.1
  }

  const plugins = path.join(gdalPath, 'plugins');
  if (fs.existsSync(plugins)) extraEnv.GDAL_DRIVER_PATH = plugins;

  return { path: gdalPath, extraEnv };
}
