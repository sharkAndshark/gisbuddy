import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Agent, AgentEvent } from './agent';

interface Conversation {
  id: string;
  title: string;
  folderPath: string;
  createdAt: number;
  updatedAt: number;
  messages: unknown[];
}

class ConversationManager {
  private conversations: Conversation[] = [];
  private filePath: string;

  constructor() {
    this.filePath = path.join(app.getPath('userData'), 'conversations.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        this.conversations = JSON.parse(raw);
      }
    } catch {
      this.conversations = [];
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.conversations, null, 2));
  }

  getAll() {
    return this.conversations.map(({ messages: _m, ...rest }) => rest);
  }

  get(id: string): Conversation | undefined {
    return this.conversations.find(c => c.id === id);
  }

  create(folderPath: string): Conversation {
    const conv: Conversation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: path.basename(folderPath),
      folderPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    this.conversations.unshift(conv);
    this.save();
    return conv;
  }

  delete(id: string) {
    this.conversations = this.conversations.filter(c => c.id !== id);
    this.save();
  }

  rename(id: string, title: string) {
    const conv = this.get(id);
    if (conv) {
      conv.title = title;
      conv.updatedAt = Date.now();
      this.save();
    }
  }

  getMessages(id: string): unknown[] {
    return this.get(id)?.messages || [];
  }
}

let mainWindow: BrowserWindow | null = null;
let agent: Agent | null = null;
let conversationManager: ConversationManager | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'GISBuddy',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/index.html'));

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('configure', async (_event, apiKey: string) => {
  agent = new Agent(apiKey);
  conversationManager = new ConversationManager();
  return { success: true };
});

ipcMain.handle('get-conversations', () => {
  return conversationManager?.getAll() || [];
});

ipcMain.handle('create-conversation', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    message: '选择对话的工作文件夹',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return conversationManager?.create(result.filePaths[0]) || null;
});

ipcMain.handle('delete-conversation', (_event, id: string) => {
  conversationManager?.delete(id);
});

ipcMain.handle('rename-conversation', (_event, id: string, title: string) => {
  conversationManager?.rename(id, title);
});

ipcMain.handle('get-messages', (_event, id: string) => {
  return conversationManager?.getMessages(id) || [];
});


ipcMain.handle('chat', async (event, { convId, text }: { convId: string; text: string }) => {
  if (!agent || !conversationManager) {
    throw new Error('请先配置 API Key');
  }

  const conv = conversationManager.get(convId);
  if (!conv) throw new Error('对话不存在');

  conv.messages.push({ role: 'user', content: text });
  conv.updatedAt = Date.now();

  let finalReply = '';

  await agent.chat(
    conv.messages as Parameters<typeof agent.chat>[0],
    conv.folderPath,
    (eventData: AgentEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-event', eventData);
      }
      if (eventData.type === 'text') {
        finalReply = eventData.data;
      }
    },
  );

  conversationManager.save();

  if (conv.title === path.basename(conv.folderPath) && finalReply) {
    const firstWords = text.slice(0, 30).replace(/\s+/g, ' ').trim();
    if (firstWords) {
      conv.title = firstWords + (text.length > 30 ? '...' : '');
      conversationManager.save();
    }
  }

  return { reply: finalReply, updatedTitle: conv.title };
});
