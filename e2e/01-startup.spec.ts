import { test, expect } from '@playwright/test';
import { launchApp, cleanupApp } from './fixtures/app';

test.describe('App 启动', () => {
  test('ChatPanel 渲染', async () => {
    const { app, page, tmpDir } = await launchApp({ withProject: 'e2e-startup' });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });
      const count = await page.locator('pi-chat-panel').count();
      expect(count).toBeGreaterThan(0);
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });

  test('预配置项目后正常加载', async () => {
    const { app, page, tmpDir } = await launchApp({ withProject: 'e2e-load' });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });
      const bodyText = await page.textContent('body');
      expect(bodyText).not.toContain('启动失败');
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });

  test('侧边栏渲染项目和对话列表', async () => {
    const { app, page, tmpDir } = await launchApp({ withProject: 'e2e-sidebar' });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      // Sidebar should contain the conversation title
      const sidebar = page.locator('[data-testid="sidebar"]');
      const sidebarText = await sidebar.textContent();
      expect(sidebarText).toContain('e2e-sidebar');

      // Sidebar should have + button (new conversation)
      const newProjectBtn = page.locator('button.new-project-btn', { hasText: '+' });
      expect(await newProjectBtn.count()).toBeGreaterThan(0);
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });
});
