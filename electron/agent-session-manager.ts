import path from "node:path";
import { spawn } from "child_process";
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  createAgentSession,
  createBashTool,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { createGisResourceLoader } from "./gis-resource-loader.js";
import { getBundledGdalEnv } from "./gdal-path.js";
import { resolveShellConfig, type ShellConfig } from "./shell-resolver.js";

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

export type EventForwarder = (
  conversationId: string,
  event: AgentSessionEvent,
) => void;
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
    return {
      session: existing.session,
      sessionFilePath: existing.sessionManager.getSessionFile() ?? "",
    };
  }

  if (!sessionDir) {
    throw new Error("sessionDir not set. Call setSessionDir() at startup.");
  }
  if (!defaultModel) {
    throw new Error(
      "No model configured. Call setDefaultModel() before creating sessions.",
    );
  }

  // Resume an existing JSONL file, or start a new persisted session under sessionDir.
  const sm = opts.sessionFilePath
    ? SessionManager.open(opts.sessionFilePath, sessionDir, opts.cwd)
    : SessionManager.create(opts.cwd, sessionDir);

  // Override the built-in bash to:
  //   1. inject bundled GDAL into PATH (macOS + Windows)
  //   2. inject GDAL_DATA / PROJ_LIB so Windows-bundled GDAL finds its data
  //   3. use a bundled shell on Windows when no system bash is available
  //      (pi-coding-agent's bash tool requires a bash-compatible shell; on
  //      Windows without Git for Windows we fall back to bundled busybox-w32)
  const customTools = [];
  const gdalEnv = getBundledGdalEnv();
  const shellConfig = resolveShellConfig();
  if (gdalEnv || shellConfig) {
    customTools.push(
      createBashTool(opts.cwd, {
        shellPath: shellConfig?.shell ?? undefined,
        // BusyBox requires `sh -c` args instead of just `-c`, but
        // pi-coding-agent's getShellConfig always uses `["-c"]`.
        // Provide custom operations that use the correct args.
        ...(shellConfig && shellConfig.args.length > 1
          ? {
              operations: createBusyboxOperations(shellConfig),
            }
          : {}),
        spawnHook: (ctx) => ({
          ...ctx,
          env: {
            ...ctx.env,
            ...(gdalEnv?.extraEnv ?? {}),
            PATH: gdalEnv
              ? `${gdalEnv.path}${path.delimiter}${ctx.env.PATH ?? process.env.PATH ?? ""}`
              : ctx.env.PATH,
          },
        }),
      }),
    );
  }

  const { session } = await createAgentSession({
    cwd: opts.cwd,
    model: defaultModel,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    settingsManager,
    sessionManager: sm,
    resourceLoader: createGisResourceLoader(),
    tools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
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
    try {
      session.dispose();
    } catch {
      /* ignore */
    }
    throw new Error("SessionManager did not allocate a session file");
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

/**
 * Create bash operations for shells that need non-standard args.
 *
 * pi-coding-agent's built-in getShellConfig always passes ["-c"] as the
 * args to the shell.  This works for bash / sh but NOT for BusyBox, which
 * requires `busybox64.exe sh -c "command"` (the `sh` applet argument must
 * come before `-c`).
 *
 * This function returns an `operations` object that can be passed to
 * `createBashTool` instead of relying on the built-in shell resolution.
 */
function createBusyboxOperations(shellConfig: ShellConfig): {
  exec: (
    command: string,
    cwd: string,
    ctx: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
      env?: NodeJS.ProcessEnv;
    },
  ) => Promise<{ exitCode: number }>;
} {
  return {
    exec(command, cwd, { onData, signal, timeout, env }) {
      return new Promise((resolve, reject) => {
        const child = spawn(shellConfig.shell, [...shellConfig.args, command], {
          cwd,
          env,
          stdio: ["ignore", "pipe", "pipe"],
        });

        child.stdout?.on("data", onData);
        child.stderr?.on("data", onData);

        let timedOut = false;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeout * 1000);
        }

        const onAbort = () => {
          try {
            child.kill("SIGTERM");
          } catch {
            /* ignore */
          }
        };
        if (signal) {
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }

        child.on("error", (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (signal) signal.removeEventListener("abort", onAbort);
          reject(err);
        });

        child.on("close", (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (signal) signal.removeEventListener("abort", onAbort);
          if (signal?.aborted) {
            reject(new Error("aborted"));
            return;
          }
          if (timedOut) {
            reject(new Error(`timeout:${timeout}`));
            return;
          }
          resolve({ exitCode: code ?? 0 });
        });
      });
    },
  };
}

export { authStorage, modelRegistry };
