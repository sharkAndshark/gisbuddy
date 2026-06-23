import { ipcMain, type BrowserWindow } from 'electron';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  disposeSession,
  getOrCreateSession,
  getSession,
  setEventForwarder,
} from '../agent-session-manager.js';
import { setFauxResponses } from '../faux.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface AgentStateSnapshot {
  messages: unknown[];
  tools: unknown[];
  model: unknown;
  thinkingLevel: string;
  systemPrompt: string;
  isStreaming: boolean;
  pendingToolCalls: string[];
}

function snapshotState(session: AgentSession): AgentStateSnapshot {
  const s = session.agent.state;
  // Tools carry `execute` functions that cannot survive IPC structured clone.
  // Strip to plain metadata — renderer only needs name/label/description to
  // render tool-call cards; execution stays in main.
  const tools = s.tools.map((t: Any) => ({
    name: t.name,
    label: t.label,
    description: t.description,
    parameters: t.parameters,
  }));
  // Model is a plain data object (provider/id/api/baseUrl/cost/...) but be
  // defensive in case future versions add methods.
  const model = s.model
    ? { ...s.model }
    : null;
  return {
    messages: s.messages,
    tools,
    model,
    thinkingLevel: s.thinkingLevel,
    systemPrompt: s.systemPrompt,
    isStreaming: s.isStreaming,
    // Set<string> does not survive IPC structured clone; convert to array.
    pendingToolCalls: Array.from((s as Any).pendingToolCalls ?? []) as string[],
  };
}

/**
 * Register all agent IPC handlers and wire the session-event forwarder.
 * Call once from main.ts after the BrowserWindow is created.
 */
export function registerAgentIpc(getWindow: () => BrowserWindow | null): void {
  setEventForwarder((conversationId, event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('agent:event', { conversationId, event });
    }
  });

  ipcMain.handle('agent:switch', async (_e, args: { conversationId: string; cwd: string; sessionFilePath?: string }) => {
    const { session, sessionFilePath } = await getOrCreateSession({
      conversationId: args.conversationId,
      cwd: args.cwd,
      sessionFilePath: args.sessionFilePath,
    });
    return {
      sessionId: session.sessionId,
      sessionFilePath,
      state: snapshotState(session),
    };
  });

  ipcMain.handle('agent:prompt', async (_e, args: { conversationId: string; payload: string }) => {
    const session = getSession(args.conversationId);
    if (!session) throw new Error('No session for conversation: ' + args.conversationId);
    await session.prompt(args.payload);
    // Return fresh state so the renderer can reconcile without a separate round-trip.
    return snapshotState(session);
  });

  ipcMain.handle('agent:abort', async (_e, conversationId: string) => {
    const session = getSession(conversationId);
    if (session) await session.abort();
  });

  ipcMain.handle('agent:get-state', (_e, conversationId: string): AgentStateSnapshot | null => {
    const session = getSession(conversationId);
    if (!session) return null;
    return snapshotState(session);
  });

  ipcMain.handle('agent:dispose', (_e, conversationId: string) => {
    disposeSession(conversationId);
  });

  ipcMain.handle('faux:set-responses', (_e, responses: unknown[]) => {
    setFauxResponses(responses);
  });
}
