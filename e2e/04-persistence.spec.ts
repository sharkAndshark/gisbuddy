import { test, expect } from '@playwright/test';
import { launchApp, cleanupApp } from './fixtures/app';

test.describe('Conversation lifecycle', () => {
  test('删除对话后 IndexedDB session 数据被清理', async () => {
    const { app, page, tmpDir } = await launchApp({ withProject: 'e2e-cleanup', testMode: true });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      // Create a new conversation to get a sessionId
      await page.locator('button:has-text("+ 对话")').first().click();
      await page.waitForTimeout(1000);
      await page.waitForSelector('pi-chat-panel', { timeout: 10000 });

      // Send a message to generate a session
      await page.evaluate(() => {
        const f = (window as any).__faux;
        f.setResponses([f.fauxAssistantMessage([f.fauxText('cleanup test')], { stopReason: 'stop' })]);
      });
      await page.locator('textarea').first().fill('test');
      await page.locator('textarea').first().press('Enter');
      await page.waitForSelector('assistant-message', { timeout: 15000 });
      await page.waitForTimeout(1000);

      // Get sessionId from agent interface
      const sessionInfo = await page.evaluate(() => {
        const iface = document.querySelector('agent-interface') as any;
        return {
          sessionId: iface?.session?.sessionId || null,
          msgCount: iface?.session?.state?.messages?.length || 0,
        };
      });

      expect(sessionInfo.msgCount).toBeGreaterThanOrEqual(2);

      if (sessionInfo.sessionId) {
        // Verify session exists before delete
        const existsBefore = await page.evaluate(async (sid: string) => {
          const storage = (window as any).__storage;
          return !!(await storage?.sessions?.get(sid));
        }, sessionInfo.sessionId);
        expect(existsBefore).toBe(true);

        // Delete the conversation
        const deleteBtn = page.locator('button[title="删除对话"]').first();
        await deleteBtn.click();
        await page.waitForTimeout(1000);

        // Verify session cleaned up
        const existsAfter = await page.evaluate(async (sid: string) => {
          const storage = (window as any).__storage;
          return !!(await storage?.sessions?.get(sid));
        }, sessionInfo.sessionId);
        expect(existsAfter).toBe(false);
      }
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });
});
