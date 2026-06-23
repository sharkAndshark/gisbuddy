import path from 'node:path';
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createBashTool,
  type AgentSession,
  type AgentSessionEvent,
} from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import { createGisResourceLoader } from './gis-resource-loader.js';
import { getBundledGdalPath } from './gdal-path.js';

// All sessions share these process-global services. API key is injected via
// `authStorage.setRuntimeApiKey` from main.ts (DeepSeek for production, faux for tests).
const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);
const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: true, maxRetries: 2 },
});

// Central sessionDir so all conversation sessions live under userData, not
// scattered across each project's `.pi/sessions/`. Set once at startup.
let sessionDir: string | null = null;
export function setSessionDir(dir: string): void {
  sessionDir = dir;
}

// One AgentSession + SessionManager per conversation. The SessionManager owns
// the JSONL file (persistence); AgentSession is the live runtime over it.
interface ConversationSession {
  session: AgentSession;
  sessionManager: SessionManager;
}
const sessions = new Map<string, ConversationSession>();

let defaultModel: Model<string> | null = null;
export function setDefaultModel(model: Model<string>): void {
  defaultModel = model;
}

export type EventForwarder = (conversationId: string, event: AgentSessionEvent) => void;
let eventForwarder: EventForwarder | null = null;
export function setEventForwarder(fn: EventForwarder): void {
  eventForwarder = fn;
}

export interface CreateSessionOptions {
  conversationId: string;
  cwd: string;
  /** Existing session file path (resume). Omit to create a new persisted session. */
  sessionFilePath?: string;
}

/**
 * Returns `{ session, sessionFilePath }`. `sessionFilePath` is the JSONL file
 * the SessionManager persists to — callers store it on the conversation so the
 * next switch can resume via SessionManager.open.
 */
export async function getOrCreateSession(
  opts: CreateSessionOptions,
): Promise<{ session: AgentSession; sessionFilePath: string }> {
  const existing = sessions.get(opts.conversationId);
  if (existing) {
    return { session: existing.session, sessionFilePath: existing.sessionManager.getSessionFile() ?? '' };
  }

  if (!sessionDir) {
    throw new Error('sessionDir not set. Call setSessionDir() at startup.');
  }
  if (!defaultModel) {
    throw new Error('No model configured. Call setDefaultModel() before creating sessions.');
  }

  // Resume an existing JSONL file, or start a new persisted session under sessionDir.
  const sm = opts.sessionFilePath
    ? SessionManager.open(opts.sessionFilePath, sessionDir, opts.cwd)
    : SessionManager.create(opts.cwd, sessionDir);

  // Override the built-in bash to inject bundled GDAL into PATH. In dev the
  // bundled dir is empty and the system PATH still wins; in release the
  // bundled binaries are reachable without users installing GDAL themselves.
  const customTools = [];
  const gdalPath = getBundledGdalPath();
  if (gdalPath) {
    customTools.push(
      createBashTool(opts.cwd, {
        spawnHook: (ctx) => ({
          ...ctx,
          env: {
            ...ctx.env,
            PATH: `${gdalPath}${path.delimiter}${ctx.env.PATH ?? process.env.PATH ?? ''}`,
          },
        }),
      }),
    );
  }

  const { session } = await createAgentSession({
    cwd: opts.cwd,
    model: defaultModel,
    thinkingLevel: 'off',
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager: sm,
    resourceLoader: createGisResourceLoader(),
    tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
    customTools,
  });

  if (eventForwarder) {
    const convId = opts.conversationId;
    session.subscribe((event) => {
      if (eventForwarder) eventForwarder(convId, event);
    });
  }

  const sessionFilePath = sm.getSessionFile();
  if (!sessionFilePath) {
    // Avoid poisoning the cache with a session that has no backing file.
    try { session.dispose(); } catch { /* ignore */ }
    throw new Error('SessionManager did not allocate a session file');
  }
  sessions.set(opts.conversationId, { session, sessionManager: sm });
  return { session, sessionFilePath };
}

export function getSession(conversationId: string): AgentSession | undefined {
  return sessions.get(conversationId)?.session;
}

export function disposeSession(conversationId: string): void {
  const entry = sessions.get(conversationId);
  if (entry) {
    entry.session.dispose();
    sessions.delete(conversationId);
  }
}

export function disposeAllSessions(): void {
  for (const { session } of sessions.values()) {
    try {
      session.dispose();
    } catch {
      // ignore — best-effort cleanup on app shutdown
    }
  }
  sessions.clear();
}

export { authStorage, modelRegistry };
