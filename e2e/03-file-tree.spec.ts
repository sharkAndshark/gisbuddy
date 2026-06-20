import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { launchApp, cleanupApp } from './fixtures/app';

test.describe('File tree', () => {
  test('文件树渲染项目目录内容', async () => {
    const { app, page, tmpDir, projectDir } = await launchApp({ withProject: 'e2e-ft' });

    try {
      // Create test files in the project
      fs.writeFileSync(path.join(projectDir!, 'hello.txt'), 'hello world');
      fs.writeFileSync(path.join(projectDir!, 'data.json'), '{"a":1}');
      fs.mkdirSync(path.join(projectDir!, 'subdir'));

      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      // File tree should show entries (may need a refresh via conversation switch)
      // The tree should show hello.txt, data.json, and subdir directory
      const treeText = await page.locator('text=hello.txt').count();
      expect(treeText).toBeGreaterThan(0);
      expect(await page.locator('text=data.json').count()).toBeGreaterThan(0);
      expect(await page.locator('text=subdir').count()).toBeGreaterThan(0);
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });

  test('点击文本文件 → 查看器展示内容', async () => {
    const { app, page, tmpDir, projectDir } = await launchApp({ withProject: 'e2e-ft2' });

    try {
      fs.writeFileSync(path.join(projectDir!, 'readme.txt'), 'GISBuddy test content');

      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      // Wait for file tree to load entries
      await page.waitForSelector('text=readme.txt', { timeout: 10000 });

      // Click the text file
      await page.locator('text=readme.txt').first().click();

      // Should show file viewer with content
      await page.waitForSelector('text=GISBuddy test content', { timeout: 10000 });

      // Should have a "← 返回" button
      expect(await page.locator('text=← 返回').count()).toBeGreaterThan(0);

      // Click back should return to chat
      await page.locator('text=← 返回').first().click();
      await page.waitForSelector('pi-chat-panel', { timeout: 5000 });
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });
});
