// Regenerates build/icon-duck.ico from build/icon-duck.svg.
// Uses sharp for SVG→PNG, then packs PNGs into an .ico container.
// (sharp has no .ico output, so we encode the ICO directory by hand —
//  PNG-compressed ICONDIRENTRY is a well-supported format on Windows.)
import sharp from 'sharp';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'build/icon-duck.svg');
const icoPath = resolve(root, 'build/icon-duck.ico');

if (!existsSync(svgPath)) {
  console.error(`[build-icon-win] missing ${svgPath}`);
  process.exit(1);
}

// Windows toolbar / taskbar / file-explorer sizes. 256 is the modern max.
const sizes = [16, 24, 32, 48, 64, 128, 256];

const pngs = [];
for (const s of sizes) {
  const buf = await sharp(svgPath, { density: 384 })
    .resize(s, s)
    .png()
    .toBuffer();
  pngs.push({ size: s, data: buf });
}

// ICO layout:
//   ICONDIR (6 bytes): reserved=0, type=1, count=N
//   N × ICONDIRENTRY (16 bytes)
//   N × PNG blob
const count = pngs.length;
const headerSize = 6;
const dirSize = 16 * count;
let offset = headerSize + dirSize;

const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = icon
header.writeUInt16LE(count, 4);

const dir = Buffer.alloc(dirSize);
for (let i = 0; i < count; i++) {
  const { size, data } = pngs[i];
  const o = i * 16;
  // width/height: 0 means 256
  dir.writeUInt8(size >= 256 ? 0 : size, o + 0);
  dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
  dir.writeUInt8(0, o + 2); // color count (0 = ≥256 colors)
  dir.writeUInt8(0, o + 3); // reserved
  dir.writeUInt16LE(1, o + 4); // planes
  dir.writeUInt16LE(32, o + 5); // bit count
  dir.writeUInt32LE(data.length, o + 8); // bytes
  dir.writeUInt32LE(offset, o + 12); // offset to image
  offset += data.length;
}

const out = Buffer.concat([header, dir, ...pngs.map((p) => p.data)]);
writeFileSync(icoPath, out);
console.log(`[build-icon-win] generated icon-duck.ico (${count} sizes)`);
