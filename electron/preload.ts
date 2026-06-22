import { ipcRenderer, type IpcRendererEvent } from 'electron';

declare const window: Record<string, unknown> & typeof globalThis;

window.gisbuddy = {
  // ── Config ──
  configure: (apiKey: string) => ipcRenderer.invoke('configure', apiKey),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),

  // ── Project management ──
  getProjects: () => ipcRenderer.invoke('get-projects'),
  createProject: () => ipcRenderer.invoke('create-project'),
  renameProject: (id: string, title: string) => ipcRenderer.invoke('rename-project', id, title),
  archiveProject: (id: string) => ipcRenderer.invoke('archive-project', id),
  unarchiveProject: (id: string) => ipcRenderer.invoke('unarchive-project', id),
  moveConversation: (convId: string, projectId: string) => ipcRenderer.invoke('move-conversation', convId, projectId),

  // ── Conversation metadata ──
  getConversations: () => ipcRenderer.invoke('get-conversations'),
  createConversation: (projectId: string) => ipcRenderer.invoke('create-conversation', projectId),
  deleteConversation: (id: string) => ipcRenderer.invoke('delete-conversation', id),
  renameConversation: (id: string, title: string) => ipcRenderer.invoke('rename-conversation', id, title),
  setConversationSessionId: (id: string, sessionId: string) => ipcRenderer.invoke('set-conversation-session-id', id, sessionId),

  // ── Agent bridge (pi-coding-agent SDK in main) ──
    agentSwitch: (conversationId: string, cwd: string, sessionFilePath?: string) =>
      ipcRenderer.invoke('agent:switch', { conversationId, cwd, sessionFilePath }),
  agentPrompt: (conversationId: string, payload: string) =>
    ipcRenderer.invoke('agent:prompt', { conversationId, payload }),
  agentAbort: (conversationId: string) =>
    ipcRenderer.invoke('agent:abort', conversationId),
  agentGetState: (conversationId: string) =>
    ipcRenderer.invoke('agent:get-state', conversationId),
  agentDispose: (conversationId: string) =>
    ipcRenderer.invoke('agent:dispose', conversationId),
  onAgentEvent: (listener: (conversationId: string, event: unknown) => void) => {
    const handler = (_e: IpcRendererEvent, payload: { conversationId: string; event: unknown }) =>
      listener(payload.conversationId, payload.event);
    ipcRenderer.on('agent:event', handler);
    return () => ipcRenderer.off('agent:event', handler);
  },

  // ── Test mode (only valid when GISBUDDY_TEST=1) ──
  fauxSetResponses: (responses: unknown[]) =>
    ipcRenderer.invoke('faux:set-responses', responses),

  // ── File operations ──
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),
};
