import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { launchApp, cleanupApp } from './fixtures/app';

test.describe('App 启动', () => {
  test('ChatPanel 渲染', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-proj-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });
      const count = await page.locator('pi-chat-panel').count();
      expect(count).toBeGreaterThan(0);
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('预配置项目后正常加载', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-proj-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('启动失败');
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('Tool IPC 桥正常工作', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-proj-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      const result = await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gisbuddy = (window as any).gisbuddy;
        return await gisbuddy.toolExec('bash', { command: 'echo e2e-test' }, '/tmp');
      });

      expect(result.success).toBe(true);
      expect(result.value.content[0].text).toContain('e2e-test');
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  test('侧边栏渲染项目和对话列表', async () => {
    const projectDir = path.join(os.tmpdir(), 'gisbuddy-e2e-proj-' + Date.now());
    const { app, page, tmpDir } = await launchApp({ withProject: projectDir });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      // Sidebar should contain the project name
      const sidebar = page.locator('div[style*="width:240px"]');
      const sidebarText = await sidebar.textContent();
      expect(sidebarText).toContain(path.basename(projectDir));

      // Sidebar should have +项目 button
      const newProjectBtn = page.locator('button', { hasText: '+ 项目' });
      expect(await newProjectBtn.count()).toBeGreaterThan(0);
    } finally {
      await cleanupApp(app, tmpDir);
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
