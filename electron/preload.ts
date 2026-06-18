import { ipcRenderer } from 'electron';

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

  // ── Tool execution bridge ──
  toolExec: (toolName: string, params: unknown, cwd: string) =>
    ipcRenderer.invoke('tool-exec', { toolName, params, cwd }),

  // ── File operations ──
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),
};
