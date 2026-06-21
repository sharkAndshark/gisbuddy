import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { launchApp, cleanupApp } from './fixtures/app';

// Real-API smoke test. Skipped unless DEEPSEEK_API_KEY is set.
// Run: DEEPSEEK_API_KEY=sk-... npx playwright test e2e/05-smoke-real.spec.ts
//
// This test exercises paths that faux-provider E2E tests cannot cover:
//   - real network fetch to api.deepseek.com (CSP connect-src)
//   - real model streaming + message rendering
//   - non-test-mode renderer init (no faux provider, real getModel)

const apiKey = process.env.DEEPSEEK_API_KEY;
const hasKey = !!apiKey && apiKey.startsWith('sk-');

test.describe('Real API smoke', () => {
  test.skip(!hasKey, 'DEEPSEEK_API_KEY not set — skipping real-API smoke test');

  test('启动 → 发送消息 → 收到真实回复', async () => {
    const { app, page, tmpDir } = await launchApp({
      withProject: 'smoke-real',
      testMode: false,
      apiKey,
    });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 30000 });
      await page.waitForSelector('textarea', { timeout: 20000 });

      const textarea = page.locator('textarea').first();
      await textarea.fill('回复"pong"两个字即可，不要其他内容。');
      await textarea.press('Enter');

      // Real API may take a few seconds to stream.
      await page.waitForSelector('assistant-message', { timeout: 60000 });

      // Poll until the assistant message has actual text content
      let text = '';
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        text = (await page.locator('assistant-message').last().textContent()) || '';
        if (text.trim().length > 0) break;
      }

      expect(text.trim().length).toBeGreaterThan(0);

      // Verify no error elements in the DOM
      const errorElements = await page.locator('.bg-destructive').count();
      expect(errorElements).toBe(0);
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });

  test('恢复 session 时不显示旧的 error 消息', async () => {
    // First launch: send a message, then close (keep userData dir)
    const { app: app1, page: page1, tmpDir } = await launchApp({
      withProject: 'smoke-restore',
      testMode: false,
      apiKey,
    });

    try {
      await page1.waitForSelector('textarea', { timeout: 20000 });
      const textarea = page1.locator('textarea').first();
      await textarea.fill('回复"hello"');
      await textarea.press('Enter');
      await page1.waitForSelector('assistant-message', { timeout: 60000 });
      await page1.waitForTimeout(3000); // wait for session save
    } finally {
      // Only close the app, don't delete tmpDir
      try { await app1.close(); } catch { /* ignore */ }
    }

    // Second launch: reuse same userData dir, should restore session
    const { app: app2, page: page2 } = await launchApp({
      withProject: 'smoke-restore',
      testMode: false,
      apiKey,
      userDataDir: tmpDir,
    });

    try {
      await page2.waitForSelector('pi-chat-panel', { timeout: 30000 });
      await page2.waitForTimeout(2000); // wait for session restore

      // Should have the previous assistant message, no error elements
      const assistantMessages = await page2.locator('assistant-message').count();
      expect(assistantMessages).toBeGreaterThan(0);

      const errorElements = await page2.locator('.bg-destructive').count();
      expect(errorElements).toBe(0);
    } finally {
      await cleanupApp(app2, tmpDir);
    }
  });

  test('agent 在项目目录下执行 bash 工具', async () => {
    const { app, page, tmpDir, projectDir } = await launchApp({
      withProject: 'smoke-cwd',
      testMode: false,
      apiKey,
    });

    // Create a test file in the project directory
    if (projectDir) {
      fs.writeFileSync(path.join(projectDir, 'test-data.txt'), 'hello from project dir');
    }

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 30000 });
      await page.waitForSelector('textarea', { timeout: 20000 });

      const textarea = page.locator('textarea').first();
      await textarea.fill('用 bash 工具执行 ls 命令，列出当前项目目录下的文件。');
      await textarea.press('Enter');

      // Wait for assistant message with tool output
      await page.waitForSelector('assistant-message', { timeout: 60000 });

      // Wait for tool execution and final response
      await page.waitForSelector('tool-message', { timeout: 30000 });

      // Poll for the final assistant response after tool call
      let text = '';
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const messages = await page.locator('assistant-message').count();
        if (messages >= 2) {
          text = (await page.locator('assistant-message').last().textContent()) || '';
          if (text.trim().length > 0) break;
        }
      }

      console.log('[smoke-cwd] final assistant text:', JSON.stringify(text));

      // The tool output should contain the test file name
      const toolText = (await page.locator('tool-message').first().textContent()) || '';
      console.log('[smoke-cwd] tool output:', JSON.stringify(toolText));
      expect(toolText).toContain('test-data.txt');

      // No error elements
      const errorElements = await page.locator('.bg-destructive').count();
      expect(errorElements).toBe(0);
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });
});
