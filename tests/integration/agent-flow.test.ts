import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getOrCreateSession,
  getSession,
  disposeSession,
  disposeAllSessions,
  setDefaultModel,
  setSessionDir,
  authStorage,
} from '../../electron/agent-session-manager.js';
import { ensureFauxRegistered, setFauxResponses } from '../../electron/faux.js';

let tmpDir: string;
let tmpSessionDir: string;
let fauxSetup: boolean = false;

beforeAll(async () => {
  if (fauxSetup) return;
  tmpSessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-sessions-'));
  setSessionDir(tmpSessionDir);
  const reg = await ensureFauxRegistered();
  const fauxModel = reg.getModel('faux-pro');
  if (!fauxModel) throw new Error('faux model missing');
  authStorage.setRuntimeApiKey('faux', 'faux-dummy-key');
  setDefaultModel(fauxModel as never);
  fauxSetup = true;
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-agent-test-'));
});

afterEach(() => {
  disposeAllSessions();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('agent-session-manager', () => {
  it('creates and caches a session per conversation', async () => {
    const r1 = await getOrCreateSession({ conversationId: 'c1', cwd: tmpDir });
    const r2 = await getOrCreateSession({ conversationId: 'c1', cwd: tmpDir });
    expect(r2.session).toBe(r1.session);
    expect(getSession('c1')).toBe(r1.session);
    // Each created session allocates a JSONL file path. The file itself is
    // created lazily on first persist; just assert we got a non-empty path.
    expect(r1.sessionFilePath).toBeTruthy();
  });

  it('different conversations get different sessions', async () => {
    const r1 = await getOrCreateSession({ conversationId: 'c-diff1', cwd: tmpDir });
    const r2 = await getOrCreateSession({ conversationId: 'c-diff2', cwd: tmpDir });
    expect(r1.session).not.toBe(r2.session);
    expect(r1.sessionFilePath).not.toBe(r2.sessionFilePath);
  });

  it('prompt with faux text response populates assistant message', async () => {
    setFauxResponses([
      { role: 'assistant', content: [{ type: 'text', text: '你好 GISBuddy' }], stopReason: 'stop' },
    ]);
    const { session } = await getOrCreateSession({ conversationId: 'c-text', cwd: tmpDir });
    await session.prompt('hello');
    const assistant = session.messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeTruthy();
    const text = JSON.stringify(assistant?.content);
    expect(text).toContain('你好 GISBuddy');
  });

  it('prompt with bash tool call executes the tool and returns toolResult', async () => {
    setFauxResponses([
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'tc1', name: 'bash', arguments: { command: 'echo agent-flow-works' } }],
        stopReason: 'toolUse',
      },
      { role: 'assistant', content: [{ type: 'text', text: 'done' }], stopReason: 'stop' },
    ]);
    const { session } = await getOrCreateSession({ conversationId: 'c-bash', cwd: tmpDir });
    await session.prompt('run echo');

    const toolResult = session.messages.find((m) => m.role === 'toolResult');
    expect(toolResult).toBeTruthy();
    expect(JSON.stringify(toolResult?.content)).toContain('agent-flow-works');
  });

  it('disposeSession clears the cached session so next getOrCreateSession makes a fresh one', async () => {
    const r1 = await getOrCreateSession({ conversationId: 'c-disp', cwd: tmpDir });
    disposeSession('c-disp');
    const r2 = await getOrCreateSession({ conversationId: 'c-disp', cwd: tmpDir });
    expect(r2.session).not.toBe(r1.session);
  });

  it('snapshotState via agent.state exposes tools and messages', async () => {
    const { session } = await getOrCreateSession({ conversationId: 'c-state', cwd: tmpDir });
    expect(session.agent.state.tools.length).toBeGreaterThan(0);
    const toolNames = session.agent.state.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toEqual(expect.arrayContaining(['bash', 'read', 'edit', 'write']));
  });

  it('sessionFilePath resume: reopening a stored path restores history', async () => {
    setFauxResponses([
      { role: 'assistant', content: [{ type: 'text', text: 'persisted-message' }], stopReason: 'stop' },
    ]);
    const r1 = await getOrCreateSession({ conversationId: 'c-resume', cwd: tmpDir });
    await r1.session.prompt('hello');
    expect(r1.session.messages.length).toBeGreaterThanOrEqual(2);
    const storedPath = r1.sessionFilePath;
    disposeSession('c-resume');

    // Reopen with the stored path — agent should restore prior messages.
    const r2 = await getOrCreateSession({
      conversationId: 'c-resume',
      cwd: tmpDir,
      sessionFilePath: storedPath,
    });
    expect(r2.sessionFilePath).toBe(storedPath);
    expect(r2.session.messages.length).toBeGreaterThanOrEqual(2);
    const restored = r2.session.messages.find((m: { role: string }) => m.role === 'assistant');
    expect(JSON.stringify(restored?.content)).toContain('persisted-message');
  });
});
