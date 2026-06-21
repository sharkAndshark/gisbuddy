import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LaunchOptions {
  /** Project directory name (created inside tmpDir). Pass a path segment, not a full path. */
  withProject?: string;
  testMode?: boolean;
  /** Override the API key env var (defaults to 'test-fake-key'). */
  apiKey?: string;
  /** Reuse an existing tmpDir (for session persistence tests). */
  userDataDir?: string;
}

export async function launchApp(opts?: LaunchOptions): Promise<{ app: ElectronApplication; page: Page; tmpDir: string; projectDir?: string }> {
  const tmpDir = opts?.userDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-e2e-'));
  let projectDir: string | undefined;
  if (opts?.withProject) {
    projectDir = path.join(tmpDir, opts.withProject);
    fs.mkdirSync(projectDir, { recursive: true });
    const convPath = path.join(tmpDir, 'conversations.json');
    // Don't overwrite if reusing an existing userDataDir (session persistence tests)
    if (!opts?.userDataDir || !fs.existsSync(convPath)) {
      fs.writeFileSync(convPath, JSON.stringify({
          projects: [{
            id: 'p1',
            title: opts.withProject,
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
  }

  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      GISBUDDY_API_KEY: opts?.apiKey ?? 'test-fake-key',
      GISBUDDY_USER_DATA: tmpDir,
      ...(opts?.testMode ? { GISBUDDY_TEST: '1' } : {}),
    },
    timeout: 30000,
  });

  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  return { app, page, tmpDir, projectDir };
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
