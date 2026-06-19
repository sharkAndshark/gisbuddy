import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createBashTool } from '../../electron/tools/bash.tool.js';
import { createReadTool } from '../../electron/tools/read.tool.js';
import { createWriteTool } from '../../electron/tools/write.tool.js';
import { createEditTool } from '../../electron/tools/edit.tool.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-tool-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('bash 工具', () => {
  it('echo 命令返回 stdout', async () => {
    const tool = createBashTool(tmpDir);
    const result = await tool.execute('test-1', { command: 'echo hello' });
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect((result.content[0] as { text: string }).text).toContain('hello');
    expect(result.details.exitCode).toBe(0);
  });

  it('失败命令返回非零 exitCode', async () => {
    const tool = createBashTool(tmpDir);
    const result = await tool.execute('test-2', { command: 'exit 42' });
    expect(result.details.exitCode).toBe(42);
  });
});

describe('read 工具', () => {
  it('读取存在的文件', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'file content here');
    const tool = createReadTool(tmpDir);
    const result = await tool.execute('test-3', { path: 'test.txt' });
    expect((result.content[0] as { text: string }).text).toBe('file content here');
    expect(result.details.byteLength).toBeGreaterThan(0);
  });

  it('读取不存在的文件返回错误信息', async () => {
    const tool = createReadTool(tmpDir);
    const result = await tool.execute('test-4', { path: 'nonexistent.txt' });
    expect((result.content[0] as { text: string }).text).toContain('读取失败');
  });
});

describe('write 工具', () => {
  it('创建新文件', async () => {
    const tool = createWriteTool(tmpDir);
    const result = await tool.execute('test-5', { path: 'output.txt', content: 'new content' });
    const written = fs.readFileSync(path.join(tmpDir, 'output.txt'), 'utf-8');
    expect(written).toBe('new content');
    expect((result.content[0] as { text: string }).text).toContain('output.txt');
  });

  it('自动创建父目录', async () => {
    const tool = createWriteTool(tmpDir);
    await tool.execute('test-6', { path: 'sub/dir/deep/file.txt', content: 'nested' });
    expect(fs.existsSync(path.join(tmpDir, 'sub/dir/deep/file.txt'))).toBe(true);
  });

  it('覆盖已有文件', async () => {
    const filePath = path.join(tmpDir, 'overwrite.txt');
    fs.writeFileSync(filePath, 'old content');
    const tool = createWriteTool(tmpDir);
    await tool.execute('test-7', { path: 'overwrite.txt', content: 'new content' });
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('new content');
  });
});

describe('edit 工具', () => {
  it('替换匹配文本', async () => {
    const filePath = path.join(tmpDir, 'edit.txt');
    fs.writeFileSync(filePath, 'line1\nold text\nline3');
    const tool = createEditTool(tmpDir);
    const result = await tool.execute('test-8', { path: 'edit.txt', oldString: 'old text', newString: 'new text' });
    expect(result.details.found).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('line1\nnew text\nline3');
  });

  it('未匹配时不修改文件', async () => {
    const filePath = path.join(tmpDir, 'nomatch.txt');
    fs.writeFileSync(filePath, 'unchanged content');
    const tool = createEditTool(tmpDir);
    const result = await tool.execute('test-9', { path: 'nomatch.txt', oldString: 'MISSING', newString: 'replaced' });
    expect(result.details.found).toBe(false);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('unchanged content');
  });
});
