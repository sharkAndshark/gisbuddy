import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { launchApp, cleanupApp } from './fixtures/app';

test.describe('Chat with faux LLM', () => {
  test('发送消息 → 收到纯文本回复', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-chat-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir, testMode: true });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      await page.evaluate(() => {
        const f = (window as any).__faux;
        f.setResponses([f.fauxAssistantMessage([f.fauxText('测试回复')], { stopReason: 'stop' })]);
      });

      const textarea = page.locator('textarea').first();
      await textarea.fill('你好');
      await textarea.press('Enter');

      await page.waitForSelector('assistant-message', { timeout: 15000 });
      await expect(page.locator('assistant-message').last()).toContainText('测试回复', { timeout: 5000 });
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('Agent 返回 thinking 块 → 前端渲染 thinking-block', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-think-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir, testMode: true });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      await page.evaluate(() => {
        const f = (window as any).__faux;
        f.setResponses([
          f.fauxAssistantMessage(
            [f.fauxThinking('Step 1: analyze input. Step 2: formulate answer.'), f.fauxText('最终答案')],
            { stopReason: 'stop' },
          ),
        ]);
      });

      const textarea = page.locator('textarea').first();
      await textarea.fill('复杂问题');
      await textarea.press('Enter');

      await page.waitForSelector('thinking-block', { timeout: 15000 });
      // Click thinking header to expand (thinking content is collapsed by default)
      await page.locator('thinking-block .thinking-header').last().click();
      // Wait for markdown-block to render (only present when expanded)
      await page.waitForSelector('thinking-block markdown-block', { timeout: 5000 });
      const thinkText = await page.locator('thinking-block').last().textContent();
      expect(thinkText).toContain('Step 1');
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('Agent 返回错误 → 前端展示错误信息', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-err-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir, testMode: true });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      await page.evaluate(() => {
        const f = (window as any).__faux;
        f.setResponses([
          f.fauxAssistantMessage([], { stopReason: 'error', errorMessage: '模拟的网络错误' }),
        ]);
      });

      const textarea = page.locator('textarea').first();
      await textarea.fill('触发错误');
      await textarea.press('Enter');

      await page.waitForSelector('assistant-message', { timeout: 15000 });
      await expect(page.locator('assistant-message').last()).toContainText('模拟的网络错误', { timeout: 5000 });
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('发送消息 → Agent 调用 bash 工具 → 收到工具输出', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-toolchat-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir, testMode: true });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      await page.evaluate(() => {
        const f = (window as any).__faux;
        f.setResponses([
          f.fauxAssistantMessage(
            [f.fauxToolCall('bash', { command: 'echo hello-from-faux-bash' })],
            { stopReason: 'toolUse' },
          ),
          f.fauxAssistantMessage([f.fauxText('执行完毕')], { stopReason: 'stop' }),
        ]);
      });

      const textarea = page.locator('textarea').first();
      await textarea.fill('执行命令');
      await textarea.press('Enter');

      // Wait for tool-message and then poll until the actual output appears
      await page.waitForSelector('tool-message', { timeout: 15000 });
      await expect(page.locator('tool-message').last()).toContainText('hello-from-faux-bash', { timeout: 10000 });
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
