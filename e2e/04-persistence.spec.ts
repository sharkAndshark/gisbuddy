import { test, expect } from '@playwright/test';
import { launchApp, cleanupApp } from './fixtures/app';
import { fauxAssistantMessage, fauxText, setFauxResponses } from './fixtures/faux';

// Note: this previously tested IndexedDB SessionsStore cleanup in the renderer.
// After issue #14, sessions live in main's AgentSession cache; Phase 3 will
// swap SessionManager.inMemory for SessionManager.create (JSONL files), at
// which point this file gets a JSONL-on-disk cleanup test. For now we verify
// the conversation-dispose side effect that main actually owns today.

test.describe('Conversation lifecycle', () => {
  test('删除对话 → main 进程 session 被 dispose（agentGetState 返回 null）', async () => {
    const { app, page, tmpDir } = await launchApp({ withProject: 'e2e-cleanup', testMode: true });

    try {
      await page.waitForSelector('pi-chat-panel', { timeout: 20000 });

      // Send a message so main creates a real session for c1
      await setFauxResponses(page, [
        fauxAssistantMessage([fauxText('cleanup test')]),
      ]);
      await page.locator('textarea').first().fill('test');
      await page.locator('textarea').first().press('Enter');
      await page.waitForSelector('assistant-message', { timeout: 15000 });
      await page.waitForTimeout(500);

      // Verify the session exists in main
      const before = await page.evaluate(() =>
        (window as unknown as { gisbuddy: { agentGetState: (id: string) => Promise<unknown> } })
          .gisbuddy.agentGetState('c1'),
      );
      expect(before).not.toBeNull();

      // Delete the conversation
      const deleteBtn = page.locator('button[title="删除对话"]').first();
      await deleteBtn.click();
      await page.waitForTimeout(500);

      // Verify main disposed the session
      const after = await page.evaluate(() =>
        (window as unknown as { gisbuddy: { agentGetState: (id: string) => Promise<unknown> } })
          .gisbuddy.agentGetState('c1'),
      );
      expect(after).toBeNull();
    } finally {
      await cleanupApp(app, tmpDir);
    }
  });
});
