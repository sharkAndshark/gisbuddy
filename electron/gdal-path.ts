import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
