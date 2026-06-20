import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readFileHandler } from '../electron/handlers/read-file.js';

const SHAPEFILE_FIXTURES = path.join(__dirname, 'fixtures', 'shapefile');

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-readfile-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function write(name: string, content: string | Buffer): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}

// Copy a shapefile component from committed fixtures into tmpDir.
function copyShpComponent(base: string, ext: string): void {
  const src = path.join(SHAPEFILE_FIXTURES, base + ext);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(tmpDir, base + ext));
}

describe('read-file — 文本文件 (B44)', () => {
  it('返回 type=text 与原始内容', async () => {
    const p = write('note.txt', 'hello world\n');
    const r = await readFileHandler(p);
    expect(r.type).toBe('text');
    if (r.type !== 'text') return;
    expect(r.content).toBe('hello world\n');
    expect(r.name).toBe('note.txt');
  });

  it('无扩展名文件按文本处理', async () => {
    const p = write('README', 'plain content');
    const r = await readFileHandler(p);
    expect(r.type).toBe('text');
  });
});

describe('read-file — JSON pretty-print (B45)', () => {
  it('压缩 JSON 被格式化为 2 空格缩进', async () => {
    const p = write('data.json', '{"a":1,"b":[2,3]}');
    const r = await readFileHandler(p);
    expect(r.type).toBe('text');
    if (r.type !== 'text') return;
    expect(r.content).toBe(JSON.stringify({ a: 1, b: [2, 3] }, null, 2));
  });

  it('畸形 JSON 保持原文本', async () => {
    const p = write('broken.json', '{not valid json');
    const r = await readFileHandler(p);
    expect(r.type).toBe('text');
    if (r.type !== 'text') return;
    expect(r.content).toBe('{not valid json');
  });
});

describe('read-file — GeoJSON (B46/B47)', () => {
  it('兼容 CRS 返回 geojson 类型 (B46)', async () => {
    const p = write('ok.geojson', JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
    }));
    const r = await readFileHandler(p);
    expect(r.type).toBe('geojson');
    if (r.type !== 'geojson') return;
    expect((r.content as { type: string }).type).toBe('FeatureCollection');
    expect(r.name).toBe('ok.geojson');
  });

  it('无 CRS 字段视为兼容 (RFC 7946)', async () => {
    const p = write('nocrs.geojson', '{"type":"FeatureCollection","features":[]}');
    const r = await readFileHandler(p);
    expect(r.type).toBe('geojson');
  });

  it('不兼容 CRS 降级为 text (B47)', async () => {
    const p = write('utm.geojson', JSON.stringify({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::32633' } },
      features: [],
    }));
    const r = await readFileHandler(p);
    expect(r.type).toBe('text');
    if (r.type !== 'text') return;
    // 降级路径仍 pretty-print
    expect(r.content).toContain('"name": "urn:ogc:def:crs:EPSG::32633"');
  });
});

describe('read-file — 图片 base64 (B48)', () => {
  it('返回 data URI', async () => {
    // 1x1 PNG
    const pngBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
    const p = write('pixel.png', pngBuf);
    const r = await readFileHandler(p);
    expect(r.type).toBe('image');
    if (r.type !== 'image') return;
    expect(r.content).toMatch(/^data:image\/png;base64,/);
    expect(r.name).toBe('pixel.png');
  });

  it('svg 使用 image/svg+xml mime', async () => {
    const p = write('icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const r = await readFileHandler(p);
    expect(r.type).toBe('image');
    if (r.type !== 'image') return;
    expect(r.content).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});

describe('read-file — Shapefile (B49-B52)', () => {
  it('解析 .shp 为 GeoJSON (B49)', async () => {
    copyShpComponent('test-points', '.shp');
    copyShpComponent('test-points', '.dbf');
    copyShpComponent('test-points', '.shx');
    const p = path.join(tmpDir, 'test-points.shp');
    const r = await readFileHandler(p);
    expect(r.type).toBe('geojson');
    if (r.type !== 'geojson') return;
    expect((r.content as { type: string }).type).toBe('FeatureCollection');
    expect(r.name).toBe('test-points.shp');
  });

  it('不兼容 CRS 的 Shapefile 被拒绝 (B50)', async () => {
    copyShpComponent('test-points', '.shp');
    copyShpComponent('test-points', '.dbf');
    copyShpComponent('test-points', '.shx');
    fs.writeFileSync(path.join(tmpDir, 'test-points.prj'),
      'PROJCS["WGS 84 / UTM zone 33N",AUTHORITY["EPSG","32633"]]');
    const p = path.join(tmpDir, 'test-points.shp');
    const r = await readFileHandler(p);
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('坐标系非 4326/3857');
  });

  it('.dbf 缺失时仍解析几何 (B51)', async () => {
    copyShpComponent('test-points', '.shp');
    copyShpComponent('test-points', '.shx');
    const p = path.join(tmpDir, 'test-points.shp');
    const r = await readFileHandler(p);
    expect(r.type).toBe('geojson');
  });

  it('畸形 .shp 返回 error (B52)', async () => {
    write('bad.shp', Buffer.from('not a real shapefile'));
    const p = path.join(tmpDir, 'bad.shp');
    const r = await readFileHandler(p);
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('Shapefile 解析失败');
  });
});

describe('read-file — 大小限制 (B53)', () => {
  it('文本超过 512KB 被拒绝', async () => {
    const p = write('big.txt', 'x'.repeat(512 * 1024 + 1));
    const r = await readFileHandler(p);
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('512KB');
  });

  it('图片超过 10MB 被拒绝 (注入 statSync)', async () => {
    const p = write('big.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const r = await readFileHandler(p, { statSync: () => ({ size: 10 * 1024 * 1024 + 1 }) });
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('10MB');
  });

  it('GeoJSON 超过 50MB 被拒绝 (注入 statSync)', async () => {
    const p = write('big.geojson', '{"type":"FeatureCollection","features":[]}');
    const r = await readFileHandler(p, { statSync: () => ({ size: 50 * 1024 * 1024 + 1 }) });
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('50MB');
  });

  it('Shapefile 超过 500MB 被拒绝 (注入 statSync)', async () => {
    const p = write('big.shp', Buffer.from([0, 0, 0, 0]));
    const r = await readFileHandler(p, { statSync: () => ({ size: 500 * 1024 * 1024 + 1 }) });
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('500MB');
  });
});

describe('read-file — 不支持类型与读取异常 (B54/B55)', () => {
  it('未知扩展名返回错误提示 (B54)', async () => {
    const p = write('archive.bin', Buffer.from([0, 1, 2, 3]));
    const r = await readFileHandler(p);
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('无法预览此文件类型');
  });

  it('文件不存在返回统一错误格式 (B55)', async () => {
    const r = await readFileHandler(path.join(tmpDir, 'nope.txt'));
    expect(r.type).toBe('error');
    if (r.type !== 'error') return;
    expect(r.message).toContain('读取文件失败');
  });
});
