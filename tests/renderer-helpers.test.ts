import { describe, it, expect } from 'vitest';
import { generateSessionId, computeAutoTitle, formatFileSize, parentDir } from '../src/renderer-helpers.js';

describe('generateSessionId (B66)', () => {
  it('生成 <base36>_<6字符> 格式的 ID', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[0-9a-z]+_[0-9a-z]{6}$/);
  });

  it('每次调用生成不同 ID', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(generateSessionId());
    expect(ids.size).toBe(100);
  });
});

describe('computeAutoTitle (B68)', () => {
  it('取首条 assistant 消息前 30 字符', () => {
    const longText = '这是一段非常非常长的回复内容，超过三十个字符的时候应该被截断掉后面的部分';
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      { role: 'assistant', content: [{ type: 'text', text: longText }] },
    ];
    const title = computeAutoTitle(messages);
    expect(title).toBe(longText.slice(0, 30));
    expect(title?.length).toBe(30);
  });

  it('短回复原样返回', () => {
    const messages = [
      { role: 'assistant', content: [{ type: 'text', text: '短回复' }] },
    ];
    expect(computeAutoTitle(messages)).toBe('短回复');
  });

  it('无 assistant 消息返回 null', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: 'question' }] },
    ];
    expect(computeAutoTitle(messages)).toBeNull();
  });

  it('assistant 消息无 text block 返回 null', () => {
    const messages = [
      { role: 'assistant', content: [{ type: 'thinking', text: '...' }] },
    ];
    expect(computeAutoTitle(messages)).toBeNull();
  });

  it('空 text 返回 null', () => {
    const messages = [
      { role: 'assistant', content: [{ type: 'text', text: '' }] },
    ];
    expect(computeAutoTitle(messages)).toBeNull();
  });
});

describe('formatFileSize', () => {
  it('小于 1KB 显示 B', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('1KB-1MB 显示 KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB');
  });

  it('超过 1MB 显示 MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MB');
  });
});

describe('parentDir', () => {
  it('返回父目录路径', () => {
    expect(parentDir('/home/user/docs/file.txt')).toBe('/home/user/docs');
  });

  it('根目录下返回 /', () => {
    expect(parentDir('/file.txt')).toBe('/');
  });

  it('多级路径', () => {
    expect(parentDir('/a/b/c/d')).toBe('/a/b/c');
  });
});
