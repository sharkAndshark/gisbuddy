import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { ConversationManager } from './conversation-manager.js';
import { readFileHandler } from './handlers/read-file.js';
import { listDirectoryHandler } from './handlers/list-directory.js';
import { registerAgentIpc } from './handlers/agent.js';
import { authStorage, setDefaultModel, disposeSession as disposeSessionById, disposeAllSessions, setSessionDir } from './agent-session-manager.js';
import { ensureFauxRegistered, getFauxModelId } from './faux.js';
import { getModel } from '@earendil-works/pi-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let conversationManager: ConversationManager | null = null;
let isQuitting = false;
let apiKey: string | null = process.env.GISBUDDY_API_KEY || null;

const isTestMode = !!process.env.GISBUDDY_TEST;

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
  const isMac = process.platform === 'darwin';
  if (isMac) {
    app.dock.hide();
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'GISBuddy',
    titleBarStyle: isMac ? 'hidden' : 'default',
    ...(isMac ? { trafficLightPosition: { x: 14, y: 13 } } : {}),
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

app.whenReady().then(async () => {
  if (process.env.GISBUDDY_USER_DATA) {
    app.setPath('userData', process.env.GISBUDDY_USER_DATA);
  }
  conversationManager = new ConversationManager(path.join(app.getPath('userData'), 'conversations.json'));
  setSessionDir(path.join(app.getPath('userData'), 'sessions'));
  fs.mkdirSync(path.join(app.getPath('userData'), 'sessions'), { recursive: true });

  // Choose model + API key BEFORE creating the window, so the renderer's first
  // `agent:switch` IPC (during its initApp) cannot race past setup.
  if (isTestMode) {
    const reg = await ensureFauxRegistered();
    const fauxModel = reg.getModel(getFauxModelId());
    if (!fauxModel) throw new Error('faux model missing after registration');
    authStorage.setRuntimeApiKey('faux', 'faux-dummy-key');
    setDefaultModel(fauxModel as never);
    console.log('[GISBuddy] test mode: faux provider registered');
  } else {
    const deepseekModel = getModel('deepseek', 'deepseek-v4-pro');
    if (!deepseekModel) throw new Error('DeepSeek model not found in registry');
    setDefaultModel(deepseekModel);
    if (apiKey) {
      authStorage.setRuntimeApiKey('deepseek', apiKey);
    }
  }

  registerAgentIpc(() => mainWindow);
  createWindow();
}).catch((err) => {
  console.error('[GISBuddy] startup failed:', err);
});

app.on('before-quit', () => {
  isQuitting = true;
  // Best-effort cleanup of AgentSession handles before the process exits.
  try { disposeAllSessions(); } catch { /* ignore */ }
});
app.on('window-all-closed', () => {});
app.on('activate', () => { mainWindow?.show(); mainWindow?.focus(); });

ipcMain.handle('configure', async (_event, key: string) => {
  apiKey = key;
  // Forward to AuthStorage so the AgentSession picks it up on the next prompt.
  if (!isTestMode) {
    authStorage.setRuntimeApiKey('deepseek', key);
  }
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
  // Dispose the agent session so main's cache doesn't leak the conversation.
  try {
    disposeSessionById(id);
  } catch {
    // ignore — best effort
  }
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

ipcMain.handle('delete-project', (_event, id: string) => {
  const removedConvIds = conversationManager?.deleteProject(id) || [];
  // Dispose agent sessions for the conversations that were removed so main's
  // cache doesn't leak. JSONL session files are retained on disk as history.
  for (const convId of removedConvIds) {
    try { disposeSessionById(convId); } catch { /* best effort */ }
  }
  return removedConvIds;
});

ipcMain.handle('move-conversation', (_event, convId: string, projectId: string) => {
  conversationManager?.moveConversation(convId, projectId);
});

// ── File operations ──

ipcMain.handle('read-file', (_event, filePath: string) => readFileHandler(filePath));

ipcMain.handle('list-directory', (_event, dirPath: string) => listDirectoryHandler(dirPath));

ipcMain.handle('get-api-key', () => apiKey);

// ── Window control ──
// macOS with titleBarStyle:'hidden' loses native double-click-to-zoom on the
// title bar. The renderer's drag regions (–webkit-app-region:drag) only provide
// dragging, so we expose a manual toggle for double-click handlers.
ipcMain.handle('toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
