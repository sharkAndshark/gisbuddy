import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { ConversationManager } from './conversation-manager.js';
import { readFileHandler } from './handlers/read-file.js';
import { listDirectoryHandler } from './handlers/list-directory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let conversationManager: ConversationManager | null = null;
let isQuitting = false;
let apiKey: string | null = process.env.GISBUDDY_API_KEY || null;

// ── Tool execution helpers ──

import { toolExecHandler } from './handlers/tool-exec.js';

// ── Window & Tray ──

function getIconPath(name: string): string | undefined {
  const devPath = path.join(__dirname, '../../build/', name);
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(process.resourcesPath || '', name);
  if (fs.existsSync(prodPath)) return prodPath;
  return undefined;
}

function createTray() {
  const iconPath = getIconPath('tray-icon.png');
  if (!iconPath) return;
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('GISBuddy');

  const contextMenu = Menu.buildFromTemplate([
    { label: '退出', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow?.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

function createWindow() {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'GISBuddy',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 14, y: 13 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/index.html'));

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  createTray();
}

app.whenReady().then(() => {
  if (process.env.GISBUDDY_USER_DATA) {
    app.setPath('userData', process.env.GISBUDDY_USER_DATA);
  }
  conversationManager = new ConversationManager(path.join(app.getPath('userData'), 'conversations.json'));
  createWindow();
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {});
app.on('activate', () => { mainWindow?.show(); mainWindow?.focus(); });

ipcMain.handle('configure', async (_event, key: string) => {
  apiKey = key;
  return { success: true };
});

// ── Conversation IPC (metadata only, no messages) ──

ipcMain.handle('get-conversations', () => conversationManager?.getAll() || []);

ipcMain.handle('create-conversation', async (_event, projectId: string) => {
  const conv = conversationManager?.create(projectId) || null;
  return conv;
});

ipcMain.handle('delete-conversation', (_event, id: string) => {
  conversationManager?.delete(id);
});

ipcMain.handle('rename-conversation', (_event, id: string, title: string) => {
  conversationManager?.rename(id, title);
});

ipcMain.handle('set-conversation-session-id', (_event, id: string, sessionId: string) => {
  conversationManager?.setSessionId(id, sessionId);
});

// ── Project IPC ──

ipcMain.handle('get-projects', () => conversationManager?.getProjects() || []);

ipcMain.handle('create-project', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    message: '选择项目的工作文件夹',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return conversationManager?.createProject(result.filePaths[0]) || null;
});

ipcMain.handle('rename-project', (_event, id: string, title: string) => {
  conversationManager?.renameProject(id, title);
});

ipcMain.handle('archive-project', (_event, id: string) => {
  conversationManager?.archiveProject(id);
});

ipcMain.handle('unarchive-project', (_event, id: string) => {
  conversationManager?.unarchiveProject(id);
});

ipcMain.handle('move-conversation', (_event, convId: string, projectId: string) => {
  conversationManager?.moveConversation(convId, projectId);
});

// ── Tool Execution IPC ──

ipcMain.handle('tool-exec', (_event, { toolName, params, cwd }: { toolName: string; params: unknown; cwd: string }) =>
  toolExecHandler(toolName, params, cwd));

// ── File operations ──

ipcMain.handle('read-file', (_event, filePath: string) => readFileHandler(filePath));

ipcMain.handle('list-directory', (_event, dirPath: string) => listDirectoryHandler(dirPath));

ipcMain.handle('get-api-key', () => apiKey);
