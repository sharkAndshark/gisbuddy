import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gisbuddy', {
  configure: (apiKey: string) => ipcRenderer.invoke('configure', apiKey),

  getConversations: () => ipcRenderer.invoke('get-conversations'),

  createConversation: (projectId: string) => ipcRenderer.invoke('create-conversation', projectId),

  deleteConversation: (id: string) => ipcRenderer.invoke('delete-conversation', id),

  renameConversation: (id: string, title: string) => ipcRenderer.invoke('rename-conversation', id, title),

  getMessages: (id: string) => ipcRenderer.invoke('get-messages', id),

  getProjects: () => ipcRenderer.invoke('get-projects'),

  createProject: () => ipcRenderer.invoke('create-project'),

  renameProject: (id: string, title: string) => ipcRenderer.invoke('rename-project', id, title),

  archiveProject: (id: string) => ipcRenderer.invoke('archive-project', id),

  unarchiveProject: (id: string) => ipcRenderer.invoke('unarchive-project', id),

  moveConversation: (convId: string, projectId: string) => ipcRenderer.invoke('move-conversation', convId, projectId),

  chat: (convId: string, text: string) => ipcRenderer.invoke('chat', { convId, text }),

  cancelChat: (convId: string) => ipcRenderer.invoke('cancel-chat', convId),

  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),

  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),

  onAgentEvent: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('agent-event', handler);
    return () => ipcRenderer.removeListener('agent-event', handler);
  },
});
