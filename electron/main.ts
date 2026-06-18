import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import type { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { isCompatibleCRS, extractEPSG } from './utils.js';
import { read as readShapefile } from 'shapefile';
import { ConversationManager } from './conversation-manager.js';
import { createGisbuddyAgent } from './gisbuddy-agent.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let conversationManager: ConversationManager | null = null;
let isQuitting = false;
let apiKey: string | null = null;
let activeAgent: Agent | null = null;

function buildAgent(cwd: string): Agent {
  return createGisbuddyAgent(cwd, apiKey!);
}

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
    {
      label: '退出',
      click: () => app.quit(),
    },
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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
  conversationManager = new ConversationManager(path.join(app.getPath('userData'), 'conversations.json'));
  createWindow();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // tray keeps app alive
});

app.on('activate', () => {
  mainWindow?.show();
  mainWindow?.focus();
});

ipcMain.handle('configure', async (_event, key: string) => {
  apiKey = key;
  activeAgent = null;
  return { success: true };
});

// ── Conversation IPC ──

ipcMain.handle('get-conversations', () => {
  return conversationManager?.getAll() || [];
});

ipcMain.handle('create-conversation', async (_event, projectId: string) => {
  console.log('[IPC] create-conversation projectId=', projectId);
  const conv = conversationManager?.create(projectId) || null;
  console.log('[IPC] create-conversation: created id=', conv?.id);
  return conv;
});

ipcMain.handle('delete-conversation', (_event, id: string) => {
  conversationManager?.delete(id);
});

ipcMain.handle('rename-conversation', (_event, id: string, title: string) => {
  conversationManager?.rename(id, title);
});

// ── Project IPC ──

ipcMain.handle('get-projects', () => {
  return conversationManager?.getProjects() || [];
});

ipcMain.handle('create-project', async () => {
  console.log('[IPC] create-project');
  if (!mainWindow) {
    console.warn('[IPC] create-project: mainWindow is null');
    return null;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    message: '选择项目的工作文件夹',
  });
  if (result.canceled || result.filePaths.length === 0) {
    console.log('[IPC] create-project: cancelled');
    return null;
  }
  console.log('[IPC] create-project: folder=', result.filePaths[0]);
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

ipcMain.handle('get-messages', (_event, id: string) => {
  return conversationManager?.getMessages(id) || [];
});

const TEXT_EXTS = new Set(['.json','.xml','.csv','.txt','.md','.yml','.yaml','.js','.py','.sh','.env','.gitignore','.log','.html','.css','.ts','.jsx','.tsx','.toml','.cfg','.conf','.ini','.sql','.glsl','.r','.m']);
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp']);

ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);

    if (IMAGE_EXTS.has(ext)) {
      if (stat.size > 10 * 1024 * 1024) {
        return { type: 'error', message: '图片文件超过 10MB，建议使用 Agent 处理' };
      }
      const buf = fs.readFileSync(filePath);
      const mime = ext === '.svg' ? 'image/svg+xml' : 'image/' + ext.slice(1);
      return { type: 'image', content: `data:${mime};base64,${buf.toString('base64')}`, name: path.basename(filePath) };
    }

    if (ext === '.geojson') {
      if (stat.size > 50 * 1024 * 1024) {
        return { type: 'error', message: 'GeoJSON 文件超过 50MB，建议使用 Agent 处理' };
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        if (isCompatibleCRS(parsed)) {
          return { type: 'geojson', content: parsed, name: path.basename(filePath) };
        }
      } catch { console.warn('[read-file] GeoJSON CRS parse failed:', filePath); }
      try {
        return { type: 'text', content: JSON.stringify(JSON.parse(raw), null, 2), name: path.basename(filePath) };
      } catch {
        return { type: 'text', content: raw, name: path.basename(filePath) };
      }
    }

    if (ext === '.shp') {
      if (stat.size > 500 * 1024 * 1024) {
        return { type: 'error', message: 'Shapefile 超过 500MB，建议使用 Agent 处理' };
      }
      const dbfPath = filePath.slice(0, -4) + '.dbf';
      const prjPath = filePath.slice(0, -4) + '.prj';
      let crsCompatible = true;
      try {
        if (fs.existsSync(prjPath)) {
          const prjContent = fs.readFileSync(prjPath, 'utf-8');
          const epsg = extractEPSG(prjContent);
          if (epsg !== null && epsg !== 4326 && epsg !== 3857) {
            crsCompatible = false;
          }
        }
      } catch { console.warn('[read-file] .prj read failed:', filePath); }
      if (!crsCompatible) {
        return { type: 'error', message: 'Shapefile 坐标系非 4326/3857，无法叠加地图预览' };
      }
      try {
        const geojson = await readShapefile(
          filePath,
          fs.existsSync(dbfPath) ? dbfPath : null,
          { encoding: 'utf-8' },
        );
        return { type: 'geojson', content: geojson, name: path.basename(filePath) };
      } catch (e) {
        return { type: 'error', message: 'Shapefile 解析失败: ' + (e as Error).message };
      }
    }

    if (TEXT_EXTS.has(ext) || !ext) {
      if (stat.size > 512 * 1024) {
        return { type: 'error', message: '文本文件超过 512KB，建议使用 Agent 查看' };
      }
      let content = fs.readFileSync(filePath, 'utf-8');
      if (ext === '.json') {
        try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* not valid JSON, return raw */ }
      }
      return { type: 'text', content, name: path.basename(filePath) };
    }

    return { type: 'error', message: '无法预览此文件类型，可尝试在对话中让 Agent 处理' };
  } catch (err) {
    return { type: 'error', message: '读取文件失败: ' + (err as Error).message };
  }
});

ipcMain.handle('list-directory', async (_event, dirPath: string) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter(e => !e.name.startsWith('.'))
    .map(e => {
      const fullPath = path.join(dirPath, e.name);
      return {
        name: e.name,
        path: fullPath,
        isDirectory: e.isDirectory(),
        size: e.isFile() ? fs.statSync(fullPath).size : 0,
        ext: e.isFile() ? path.extname(e.name).toLowerCase() : '',
      };
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
});

function safeSend(eventData: unknown) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent-event', eventData);
    }
  } catch { console.warn('[safeSend] failed to send event, window likely destroyed'); }
}

ipcMain.handle('chat', async (_event, { convId, text }: { convId: string; text: string }) => {
  if (!conversationManager || !apiKey) {
    throw new Error('请先配置 API Key');
  }

  const conv = conversationManager.get(convId);
  if (!conv) throw new Error('对话不存在');

  const project = conversationManager.getProject(conv.projectId);
  if (!project) throw new Error('对话所属项目不存在');

  if (project.archived) {
    conversationManager.unarchiveProject(project.id);
  }

  // Abort any in-progress agent run
  if (activeAgent) {
    activeAgent.abort();
    await activeAgent.waitForIdle();
  }

  const cwd = project.folderPath;
  const currentAgent = buildAgent(cwd);
  activeAgent = currentAgent;

  // Load existing conversation messages into agent state
  currentAgent.state.messages = conv.messages as AgentMessage[];

  // Subscribe to events and forward to renderer
  let finalReply = '';
  const unsubscribe = currentAgent.subscribe((event) => {
    safeSend(event);

    if (event.type === 'message_update') {
      const ame = event.assistantMessageEvent;
      if (ame.type === 'text_delta') {
        finalReply += ame.delta;
      }
    }
  });

  try {
    const userMsg: AgentMessage = {
      role: 'user',
      content: [{ type: 'text', text }],
      timestamp: Date.now(),
    };
    await currentAgent.prompt(userMsg);
  } finally {
    unsubscribe();
    if (activeAgent === currentAgent) {
      activeAgent = null;
    }
  }

  // Sync messages back to ConversationManager
  conv.messages = currentAgent.state.messages as unknown[];
  conv.updatedAt = Date.now();
  conversationManager.save();

  // Auto-title new conversations
  if (conv.title === '新对话' && finalReply) {
    const firstWords = text.slice(0, 30).replace(/\s+/g, ' ').trim();
    if (firstWords) {
      conv.title = firstWords + (text.length > 30 ? '...' : '');
      conversationManager.save();
    }
  }

  return { reply: finalReply, updatedTitle: conv.title };
});

ipcMain.handle('cancel-chat', async (_event, _convId: string) => {
  if (activeAgent) {
    console.log('[cancel-chat] aborting agent');
    activeAgent.abort();
  }
});
