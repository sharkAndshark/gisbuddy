import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listDirectoryHandler } from '../electron/handlers/list-directory.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-listdir-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeDir(name: string): string {
  const p = path.join(tmpDir, name);
  fs.mkdirSync(p);
  return p;
}

function writeFile(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content);
  return p;
}

describe('list-directory — 隐藏文件过滤 (B56)', () => {
  it('过滤 . 开头的文件和目录', () => {
    writeFile('visible.txt', 'a');
    writeFile('.hidden', 'b');
    writeFile('.gitignore', 'c');
    makeDir('.secretdir');
    const entries = listDirectoryHandler(tmpDir);
    expect(entries.map(e => e.name)).toEqual(['visible.txt']);
  });

  it('无隐藏文件时返回全部可见条目', () => {
    writeFile('a.txt', '1');
    writeFile('b.md', '2');
    const entries = listDirectoryHandler(tmpDir);
    expect(entries.map(e => e.name).sort()).toEqual(['a.txt', 'b.md']);
  });
});

describe('list-directory — 目录优先排序 (B57)', () => {
  it('目录排在文件前面', () => {
    writeFile('z-file.txt', 'x');
    makeDir('a-dir');
    writeFile('a-file.txt', 'y');
    const entries = listDirectoryHandler(tmpDir);
    // 第一个应该是目录
    expect(entries[0].isDirectory).toBe(true);
    expect(entries[0].name).toBe('a-dir');
    // 之后是文件
    expect(entries.slice(1).every(e => !e.isDirectory)).toBe(true);
  });
});

describe('list-directory — 字母排序 (B58)', () => {
  it('同类条目按 localeCompare 排序', () => {
    writeFile('banana.txt', '1');
    writeFile('apple.txt', '2');
    writeFile('cherry.txt', '3');
    const entries = listDirectoryHandler(tmpDir);
    expect(entries.map(e => e.name)).toEqual(['apple.txt', 'banana.txt', 'cherry.txt']);
  });

  it('多个目录之间也按字母排序', () => {
    makeDir('zebra');
    makeDir('apple');
    makeDir('mango');
    const entries = listDirectoryHandler(tmpDir);
    expect(entries.map(e => e.name)).toEqual(['apple', 'mango', 'zebra']);
  });
});

describe('list-directory — 返回结构 (B59)', () => {
  it('每条目含 name/path/isDirectory/size/ext', () => {
    writeFile('report.csv', 'id,name\n1,a');
    makeDir('subdir');
    const entries = listDirectoryHandler(tmpDir);
    const dir = entries.find(e => e.name === 'subdir');
    expect(dir).toBeDefined();
    expect(dir?.path).toBe(path.join(tmpDir, 'subdir'));
    expect(dir?.isDirectory).toBe(true);
    expect(dir?.size).toBe(0);
    expect(dir?.ext).toBe('');

    const file = entries.find(e => e.name === 'report.csv');
    expect(file).toBeDefined();
    expect(file?.path).toBe(path.join(tmpDir, 'report.csv'));
    expect(file?.isDirectory).toBe(false);
    expect(file?.size).toBe(Buffer.from('id,name\n1,a').length);
    expect(file?.ext).toBe('.csv');
  });

  it('扩展名小写化', () => {
    writeFile('IMG.PNG', Buffer.from([0x89, 0x50]));
    const entries = listDirectoryHandler(tmpDir);
    const file = entries.find(e => e.name === 'IMG.PNG');
    expect(file?.ext).toBe('.png');
  });
});
