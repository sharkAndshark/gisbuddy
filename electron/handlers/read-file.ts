import * as path from 'path';
import * as fs from 'fs';
import { isCompatibleCRS, extractEPSG } from '../utils.js';
import { read as readShapefile } from 'shapefile';

const TEXT_EXTS = new Set(['.json', '.xml', '.csv', '.txt', '.md', '.yml', '.yaml', '.js', '.py', '.sh', '.env', '.gitignore', '.log', '.html', '.css', '.ts', '.jsx', '.tsx', '.toml', '.cfg', '.conf', '.ini', '.sql', '.glsl', '.r', '.m']);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);

export type ReadFileResult =
  | { type: 'text'; content: string; name: string }
  | { type: 'image'; content: string; name: string }
  | { type: 'geojson'; content: unknown; name: string }
  | { type: 'error'; message: string };

// Optional dependency injection so tests can fake file sizes for the
// size-limit branches (image>10MB / geojson>50MB / shp>500MB) without
// writing huge real files. Production callers omit this and use fs.
export interface ReadFileDeps {
  statSync?: (filePath: string) => { size: number };
}

// Extracted from electron/main.ts read-file IPC handler so it can be unit-tested.
// Behavior reference: behaviors.md B44-B55.
export async function readFileHandler(filePath: string, deps?: ReadFileDeps): Promise<ReadFileResult> {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const stat = (deps?.statSync ?? fs.statSync)(filePath);

    if (IMAGE_EXTS.has(ext)) {
      if (stat.size > 10 * 1024 * 1024) return { type: 'error', message: '图片文件超过 10MB，建议使用 Agent 处理' };
      const buf = fs.readFileSync(filePath);
      const mime = ext === '.svg' ? 'image/svg+xml' : 'image/' + ext.slice(1);
      return { type: 'image', content: 'data:' + mime + ';base64,' + buf.toString('base64'), name: path.basename(filePath) };
    }

    if (ext === '.geojson') {
      if (stat.size > 50 * 1024 * 1024) return { type: 'error', message: 'GeoJSON 文件超过 50MB，建议使用 Agent 处理' };
      const raw = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        if (isCompatibleCRS(parsed)) return { type: 'geojson', content: parsed, name: path.basename(filePath) };
      } catch { /* not valid JSON, return raw */ }
      try {
        return { type: 'text', content: JSON.stringify(JSON.parse(raw), null, 2), name: path.basename(filePath) };
      } catch { return { type: 'text', content: raw, name: path.basename(filePath) }; }
    }

    if (ext === '.shp') {
      if (stat.size > 500 * 1024 * 1024) return { type: 'error', message: 'Shapefile 超过 500MB，建议使用 Agent 处理' };
      const dbfPath = filePath.slice(0, -4) + '.dbf';
      const prjPath = filePath.slice(0, -4) + '.prj';
      let crsCompatible = true;
      try {
        if (fs.existsSync(prjPath)) {
          const epsg = extractEPSG(fs.readFileSync(prjPath, 'utf-8'));
          if (epsg !== null && epsg !== 4326 && epsg !== 3857) crsCompatible = false;
        }
      } catch { /* ignore */ }
      if (!crsCompatible) return { type: 'error', message: 'Shapefile 坐标系非 4326/3857，无法叠加地图预览' };
      try {
        const geojson = await readShapefile(filePath, fs.existsSync(dbfPath) ? dbfPath : null, { encoding: 'utf-8' });
        return { type: 'geojson', content: geojson, name: path.basename(filePath) };
      } catch (e) { return { type: 'error', message: 'Shapefile 解析失败: ' + (e as Error).message }; }
    }

    if (TEXT_EXTS.has(ext) || !ext) {
      if (stat.size > 512 * 1024) return { type: 'error', message: '文本文件超过 512KB，建议使用 Agent 查看' };
      let content = fs.readFileSync(filePath, 'utf-8');
      if (ext === '.json') { try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* ignore */ } }
      return { type: 'text', content, name: path.basename(filePath) };
    }

    return { type: 'error', message: '无法预览此文件类型，可尝试在对话中让 Agent 处理' };
  } catch (err) { return { type: 'error', message: '读取文件失败: ' + (err as Error).message }; }
}
