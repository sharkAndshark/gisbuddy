import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { isCompatibleCRS, extractEPSG } from './utils.js';
import { read as readShapefile } from 'shapefile';
import { ConversationManager } from './conversation-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let conversationManager: ConversationManager | null = null;
let isQuitting = false;
let apiKey: string | null = null;

// ── Tool execution helpers ──

import { createBashTool } from './tools/bash.tool.js';
import { createReadTool } from './tools/read.tool.js';
import { createWriteTool } from './tools/write.tool.js';
import { createEditTool } from './tools/edit.tool.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getToolFactory(cwd: string): Record<string, { execute: (toolCallId: string, params: any, signal?: AbortSignal) => Promise<any> }> {
  const bash: any = createBashTool(cwd);
  const read: any = createReadTool(cwd);
  const write: any = createWriteTool(cwd);
  const edit: any = createEditTool(cwd);
  return { bash, read, write, edit };
}

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

ipcMain.handle('tool-exec', async (_event, { toolName, params, cwd }: { toolName: string; params: unknown; cwd: string }) => {
  try {
    const tools = getToolFactory(cwd);
    const tool = tools[toolName as keyof typeof tools];
    if (!tool) return { success: false, error: 'Unknown tool: ' + toolName };
    const result = await tool.execute(toolName, params);
    return { success: true, value: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

// ── File operations ──

const TEXT_EXTS = new Set(['.json','.xml','.csv','.txt','.md','.yml','.yaml','.js','.py','.sh','.env','.gitignore','.log','.html','.css','.ts','.jsx','.tsx','.toml','.cfg','.conf','.ini','.sql','.glsl','.r','.m']);
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp']);

ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const stat = fs.statSync(filePath);

    if (IMAGE_EXTS.has(ext)) {
      if (stat.size > 10 * 1024 * 1024) return { type: 'error', message: '图片文件超过 10MB，建议使用 Agent 处理' };
      const buf = fs.readFileSync(filePath);
      const mime = ext === '.svg' ? 'image/svg+xml' : 'image/' + ext.slice(1);
      return { type: 'image', content: 'data:' + mime + ';base64,' + buf.toString('base64'), name: path.basename(filePath) };
    }

    if (ext === '.geojson') {
      if (stat.size > 50 * 1024 * 1024) return { type: 'error', message: 'GeoJSON 文件超过 50MB，建议使用 Agent 处理' };
      const raw = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        if (isCompatibleCRS(parsed)) return { type: 'geojson', content: parsed, name: path.basename(filePath) };
      } catch { /* not valid JSON, return raw */ }
      try {
        return { type: 'text', content: JSON.stringify(JSON.parse(raw), null, 2), name: path.basename(filePath) };
      } catch { return { type: 'text', content: raw, name: path.basename(filePath) }; }
    }

    if (ext === '.shp') {
      if (stat.size > 500 * 1024 * 1024) return { type: 'error', message: 'Shapefile 超过 500MB，建议使用 Agent 处理' };
      const dbfPath = filePath.slice(0, -4) + '.dbf';
      const prjPath = filePath.slice(0, -4) + '.prj';
      let crsCompatible = true;
      try {
        if (fs.existsSync(prjPath)) {
          const epsg = extractEPSG(fs.readFileSync(prjPath, 'utf-8'));
          if (epsg !== null && epsg !== 4326 && epsg !== 3857) crsCompatible = false;
        }
      } catch { /* ignore */ }
      if (!crsCompatible) return { type: 'error', message: 'Shapefile 坐标系非 4326/3857，无法叠加地图预览' };
      try {
        const geojson = await readShapefile(filePath, fs.existsSync(dbfPath) ? dbfPath : null, { encoding: 'utf-8' });
        return { type: 'geojson', content: geojson, name: path.basename(filePath) };
      } catch (e) { return { type: 'error', message: 'Shapefile 解析失败: ' + (e as Error).message }; }
    }

    if (TEXT_EXTS.has(ext) || !ext) {
      if (stat.size > 512 * 1024) return { type: 'error', message: '文本文件超过 512KB，建议使用 Agent 查看' };
      let content = fs.readFileSync(filePath, 'utf-8');
      if (ext === '.json') { try { content = JSON.stringify(JSON.parse(content), null, 2); } catch { /* ignore */ } }
      return { type: 'text', content, name: path.basename(filePath) };
    }

    return { type: 'error', message: '无法预览此文件类型，可尝试在对话中让 Agent 处理' };
  } catch (err) { return { type: 'error', message: '读取文件失败: ' + (err as Error).message }; }
});

ipcMain.handle('list-directory', async (_event, dirPath: string) => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.filter(e => !e.name.startsWith('.'))
    .map(e => {
      const fullPath = path.join(dirPath, e.name);
      return { name: e.name, path: fullPath, isDirectory: e.isDirectory(), size: e.isFile() ? fs.statSync(fullPath).size : 0, ext: e.isFile() ? path.extname(e.name).toLowerCase() : '' };
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
});

ipcMain.handle('get-api-key', () => apiKey);
