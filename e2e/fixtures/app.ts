import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LaunchOptions {
  withProject?: string;
}

export async function launchApp(opts?: LaunchOptions): Promise<{ app: ElectronApplication; page: Page; tmpDir: string }> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-e2e-'));

  if (opts?.withProject) {
    const convPath = path.join(tmpDir, 'conversations.json');
    const projectDir = opts.withProject;
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(convPath, JSON.stringify({
      projects: [{
        id: 'p1',
        title: path.basename(projectDir),
        folderPath: projectDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        archived: false,
      }],
      conversations: [{
        id: 'c1',
        title: 'test',
        projectId: 'p1',
        sessionId: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    }));
  }

  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      GISBUDDY_API_KEY: 'test-fake-key',
      GISBUDDY_USER_DATA: tmpDir,
    },
    timeout: 30000,
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return { app, page, tmpDir };
}

export async function cleanupApp(app: ElectronApplication, tmpDir: string) {
  try {
    await app.close();
  } catch {
    // ignore
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
