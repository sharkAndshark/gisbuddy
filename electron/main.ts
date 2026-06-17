import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { Agent, AgentEvent } from './agent';
import { read as readShapefile } from 'shapefile';

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
let tray: Tray | null = null;
let agent: Agent | null = null;
let conversationManager: ConversationManager | null = null;
let isQuitting = false;

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
      label: '显示 GISBuddy',
      click: () => { mainWindow?.show(); mainWindow?.focus(); },
    },
    { type: 'separator' },
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

app.whenReady().then(createWindow);

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

ipcMain.handle('configure', async (_event, apiKey: string) => {
  agent = new Agent(apiKey);
  conversationManager = new ConversationManager();
  return { success: true };
});

ipcMain.handle('get-conversations', () => {
  return conversationManager?.getAll() || [];
});

ipcMain.handle('create-conversation', async () => {
  console.log('[IPC] create-conversation');
  if (!mainWindow) {
    console.warn('[IPC] create-conversation: mainWindow is null');
    return null;
  }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    message: '选择对话的工作文件夹',
  });
  if (result.canceled || result.filePaths.length === 0) {
    console.log('[IPC] create-conversation: cancelled');
    return null;
  }
  console.log('[IPC] create-conversation: folder=', result.filePaths[0]);
  const conv = conversationManager?.create(result.filePaths[0]) || null;
  console.log('[IPC] create-conversation: created id=', conv?.id);
  return conv;
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

const TEXT_EXTS = new Set(['.json','.xml','.csv','.txt','.md','.yml','.yaml','.js','.py','.sh','.env','.gitignore','.log','.html','.css','.ts','.jsx','.tsx','.toml','.cfg','.conf','.ini','.sql','.glsl','.r','.m']);

function isCompatibleCRS(geojson: any): boolean {
  if (!geojson || typeof geojson !== 'object') return false;
  const crs = geojson.crs;
  if (!crs) return true; // RFC 7946: no crs → WGS84
  const name = crs?.properties?.name;
  if (!name || typeof name !== 'string') return true;
  const m = name.match(/(\d+)/);
  if (!m) return false;
  const code = parseInt(m[1], 10);
  return code === 4326 || code === 3857;
}
const IMAGE_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp']);

function extractEPSG(prjContent: string): number | null {
  const m = prjContent.match(/AUTHORITY\["EPSG","(\d+)"\]/);
  return m ? parseInt(m[1], 10) : null;
}

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
      } catch {}
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
      } catch {}
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
        try { content = JSON.stringify(JSON.parse(content), null, 2); } catch {}
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
