// Regenerates build/icon-duck.icns + build/icon-duck.png from build/icon-duck.svg.
// Uses sharp for SVG→PNG, then iconutil to assemble the .icns.
import sharp from 'sharp';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'build/icon-duck.svg');
const iconsetDir = resolve(root, 'build/icon-duck.iconset');
const icnsPath = resolve(root, 'build/icon-duck.icns');
const pngPath = resolve(root, 'build/icon-duck.png');

if (!existsSync(svgPath)) {
  console.error(`[build-icon] missing ${svgPath}`);
  process.exit(1);
}

// Reset iconset dir
rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });

// Apple iconset convention: for each nominal size N, emit
//   icon_NxN.png      (N px)
//   icon_NxN@2x.png   (2N px)
const nominal = [16, 32, 128, 256, 512];
for (const n of nominal) {
  await sharp(svgPath, { density: 384 })
    .resize(n, n)
    .png()
    .toFile(resolve(iconsetDir, `icon_${n}x${n}.png`));
  await sharp(svgPath, { density: 384 })
    .resize(n * 2, n * 2)
    .png()
    .toFile(resolve(iconsetDir, `icon_${n}x${n}@2x.png`));
}

// Assemble .icns
execSync(`iconutil -c icns -o "${icnsPath}" "${iconsetDir}"`);

// Flat 512x512 png (used as extraResource + fallback)
await sharp(svgPath, { density: 384 })
  .resize(512, 512)
  .png()
  .toFile(pngPath);

console.log('[build-icon] generated icon-duck.icns + icon-duck.png');
