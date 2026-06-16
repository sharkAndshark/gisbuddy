import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gisbuddy', {
  configure: (apiKey: string) => ipcRenderer.invoke('configure', apiKey),

  getConversations: () => ipcRenderer.invoke('get-conversations'),

  createConversation: () => ipcRenderer.invoke('create-conversation'),

  deleteConversation: (id: string) => ipcRenderer.invoke('delete-conversation', id),

  renameConversation: (id: string, title: string) => ipcRenderer.invoke('rename-conversation', id, title),

  getMessages: (id: string) => ipcRenderer.invoke('get-messages', id),

  chat: (convId: string, text: string) => ipcRenderer.invoke('chat', { convId, text }),

  openFolder: (id: string) => ipcRenderer.invoke('open-folder', id),

  onAgentEvent: (callback: (data: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('agent-event', handler);
    return () => ipcRenderer.removeListener('agent-event', handler);
  },
});
