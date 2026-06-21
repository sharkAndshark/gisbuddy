import { Agent } from '@earendil-works/pi-agent-core';
import { getModel } from '@earendil-works/pi-ai';
import { ChatPanel, AppStorage, IndexedDBStorageBackend, ProviderKeysStore, SessionsStore, SettingsStore, setAppStorage, getAppStorage } from '@earendil-works/pi-web-ui';
import { registerFauxProvider, fauxAssistantMessage, fauxText, fauxToolCall, fauxThinking } from '@earendil-works/pi-ai/faux';
import { html, render } from 'lit';
import L from 'leaflet';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { generateSessionId, computeAutoTitle, formatFileSize, parentDir } from './renderer-helpers.js';

console.log('[GISBuddy] bundle.js loaded');

const isTestMode = typeof process !== 'undefined' && process.env?.GISBUDDY_TEST === '1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

// ── Faux provider (E2E test mode) ──
let fauxModel: ReturnType<typeof getModel> | null = null;
if (isTestMode) {
  const reg = registerFauxProvider({
    models: [{ id: 'deepseek-v4-pro', name: 'Faux DeepSeek V4 Pro', contextWindow: 1000000, maxTokens: 384000 }],
    tokensPerSecond: 1000,
  });
  fauxModel = reg.getModel();
  if (!fauxModel) throw new Error('[GISBuddy] test mode enabled but faux provider failed to register');
  (window as AnyObj).__faux = {
    fauxText, fauxThinking, fauxToolCall, fauxAssistantMessage,
    setResponses: (r: unknown[]) => reg.setResponses(r),
  };
  console.log('[GISBuddy] test mode: faux provider registered');
}

interface Project { id: string; title: string; folderPath: string; createdAt: number; archived: boolean }
interface Conversation { id: string; title: string; projectId: string; sessionId: string }

const gisbuddy = (window as unknown as {
  gisbuddy: {
    toolExec: (toolName: string, params: unknown, cwd: string) => Promise<{ success: boolean; value?: AgentToolResult; error?: string }>;
    getApiKey: () => Promise<string | null>;
    configure: (key: string) => Promise<{ success: boolean }>;
    getProjects: () => Promise<Project[]>;
    createProject: () => Promise<Project | null>;
    renameProject: (id: string, title: string) => Promise<void>;
    archiveProject: (id: string) => Promise<void>;
    unarchiveProject: (id: string) => Promise<void>;
    getConversations: () => Promise<Conversation[]>;
    createConversation: (projectId: string) => Promise<Conversation | null>;
    deleteConversation: (id: string) => Promise<void>;
    renameConversation: (id: string, title: string) => Promise<void>;
    moveConversation: (convId: string, projectId: string) => Promise<void>;
    setConversationSessionId: (id: string, sessionId: string) => Promise<void>;
    listDirectory: (dirPath: string) => Promise<FileEntry[]>;
    readFile: (filePath: string) => Promise<FileViewData>;
  };
}).gisbuddy;

interface FileEntry { name: string; path: string; isDirectory: boolean; size: number; ext: string; }
interface FileViewData { type: 'text' | 'image' | 'geojson' | 'error'; content: string | Record<string, unknown>; name?: string; message?: string; }

// ── Global state ──
let apiKey = '';
let projects: Project[] = [];
let conversations: Conversation[] = [];
let currentProjectId: string | null = null;
let currentConvId: string | null = null;
let currentCwd: string | null = null;
let chatPanel: ChatPanel | null = null;
let currentAgent: Agent | null = null;
let msgListFixUnsub: (() => void) | null = null;

// ── File tree state ──
let currentDir = '';
let fileTreeEntries: FileEntry[] = [];
let activeFilePath: string | null = null;
let fileViewData: FileViewData | null = null;
let mapInstance: AnyObj | null = null;
let mapRafHandle = 0;

// ── AppStorage (required by pi-web-ui AgentInterface) ──
async function setupAppStorage(key: string) {
  const settings = new SettingsStore();
  const providerKeys = new ProviderKeysStore();
  const sessions = new SessionsStore();
  const stores = [settings.getConfig(), providerKeys.getConfig(), sessions.getConfig(), SessionsStore.getMetadataConfig()];
  const backend = new IndexedDBStorageBackend({ dbName: 'gisbuddy-pi', version: 1, stores: stores as AnyObj });
  settings.setBackend(backend);
  providerKeys.setBackend(backend);
  sessions.setBackend(backend);
  const storage = new AppStorage(settings, providerKeys, sessions, undefined as AnyObj, backend);
  setAppStorage(storage);
  await providerKeys.set('deepseek', key);
}

// ── Tools ──
function createTools(cwd: string): AgentTool[] {
  function makeTool(name: string, label: string, desc: string, params: Record<string, unknown>): AgentTool {
    return {
      name, label, description: desc, parameters: params as never,
      execute: async (_id: string, p: unknown) => {
        const res = await gisbuddy.toolExec(name, p, cwd);
        if (!res.success) throw new Error(res.error || 'Tool failed');
        return res.value as AgentToolResult;
      },
    } as AgentTool;
  }

  return [
    makeTool('bash', 'Bash', 'Execute shell command in the project working directory. Use ls to list files, gdalinfo/ogrinfo to inspect geospatial data.', { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }),
    makeTool('read', 'Read', 'Read file content. Path is relative to the project working directory.', { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }),
    makeTool('write', 'Write', 'Write file content. Path is relative to the project working directory.', { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }),
    makeTool('edit', 'Edit', 'Edit file by replacing oldString with newString. Path is relative to the project working directory.', { type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['path', 'oldString', 'newString'] }),
  ];
}

// ── Chat panel management ──
let switchSeq = 0;

async function restoreSession(conv: Conversation): Promise<{ sessionId: string; messages: AnyObj[] }> {
  let sessionId = conv.sessionId;
  let messages: AnyObj[] = [];

  if (sessionId && !isTestMode) {
    try {
      const saved = await getAppStorage().sessions.loadSession(sessionId);
      if (saved?.messages?.length) {
        // Filter out error/aborted messages — they are not useful to restore
        // and can confuse the UI (e.g. stale "Connection error" from a previous run)
        messages = saved.messages.filter((m: AnyObj) => {
          if (m.role === 'assistant' && (m.stopReason === 'error' || m.stopReason === 'aborted')) {
            return false;
          }
          return true;
        });
      }
    } catch { /* IndexedDB may not be ready */ }
  }

  if (!sessionId) {
    sessionId = generateSessionId();
    conv.sessionId = sessionId;
    try { await gisbuddy.setConversationSessionId(conv.id, sessionId); }
    catch { /* IPC may fail */ }
  }

  return { sessionId, messages };
}

async function handleAutoTitle(conv: Conversation, agent: Agent) {
  if (conv.title !== '新对话') return;
  const title = computeAutoTitle(agent.state.messages);
  if (!title) return;
  try {
    await gisbuddy.renameConversation(conv.id, title);
    conv.title = title;
    renderApp();
  } catch { /* IPC may fail — title stays '新对话', retries next agent_end */ }
}

async function switchToConversation(convId: string) {
  if (convId === currentConvId) return;
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  const project = projects.find(p => p.id === conv.projectId);
  if (!project) return;

  currentConvId = convId;
  currentProjectId = conv.projectId;
  currentCwd = project.folderPath;

  // Initialize file tree
  currentDir = currentCwd;
  activeFilePath = null;
  fileViewData = null;
  if (mapRafHandle) { cancelAnimationFrame(mapRafHandle); mapRafHandle = 0; }
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }

  // Abort previous Agent to stop any in-flight streaming
  const seq = ++switchSeq;
  try { currentAgent?.abort(); } catch { /* ignore */ }
  msgListFixUnsub?.();
  msgListFixUnsub = null;

  const { sessionId, messages: initialMessages } = await restoreSession(conv);

  // Create fresh Agent with tools bound to this project's cwd
  const systemPrompt = `You are GISBuddy, a helpful GIS data processing assistant.

The user's project working directory is: ${currentCwd}

You have these tools:
- bash: Execute shell commands (use "ls" to list files, "gdalinfo"/"ogrinfo" to inspect geospatial data)
- read: Read a file (path is relative to the working directory)
- write: Write a file (path is relative to the working directory)
- edit: Edit a file by string replacement (path is relative to the working directory)

When the user asks about files or data in the directory, ALWAYS use the bash tool with "ls" first to see what files exist. Do not guess file names. Do not use the read tool on directories.`;

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: fauxModel ?? getModel('deepseek', 'deepseek-v4-pro'),
      tools: createTools(currentCwd),
      messages: initialMessages,
    },
    sessionId: isTestMode ? undefined : sessionId,
    getApiKey: async () => apiKey,
  });
  currentAgent = agent;

  // Reuse ChatPanel element, only update the agent
  if (!chatPanel) {
    chatPanel = document.createElement('pi-chat-panel') as ChatPanel;
  }
  // Drop stale invocation before expensive setAgent call
  if (seq !== switchSeq) return;
  await chatPanel.setAgent(agent as AnyObj, {
    onApiKeyRequired: async () => true,
    toolsFactory: () => createTools(currentCwd!),
  });
  // Drop stale invocation before subscribing
  if (seq !== switchSeq) return;

  msgListFixUnsub = agent.subscribe(async (event: Record<string, unknown>) => {
    if (event.type === 'message_end' || event.type === 'agent_end') {
      const msgList = chatPanel?.querySelector('message-list') as AnyObj;
      if (msgList) msgList.messages = [...(agent.state.messages)];
    }
    if (event.type === 'agent_end' && sessionId && !isTestMode) {
      try {
        await getAppStorage().sessions.saveSession(sessionId, agent.state);
      } catch { /* IndexedDB save may fail */ }
      await handleAutoTitle(conv, agent);
    }
  });

  renderApp();
  refreshFileTree();
}

// ── Actions ──
async function handleNewProject() {
  const newP = await gisbuddy.createProject();
  if (!newP) {
    // User cancelled dialog — re-render to update sidebar/loading state
    renderApp();
    return;
  }
  projects = await gisbuddy.getProjects();
  await handleSelectProject(newP.id);
}

async function handleSelectProject(projectId: string) {
  conversations = await gisbuddy.getConversations();
  const projectConvs = conversations.filter(c => c.projectId === projectId);
  if (projectConvs.length > 0) {
    await switchToConversation(projectConvs[0].id);
  } else {
    await handleNewConversation(projectId);
  }
}

async function handleNewConversation(projectId: string) {
  const newConv = await gisbuddy.createConversation(projectId);
  if (!newConv) {
    currentConvId = null;
    renderApp();
    return;
  }
  conversations = await gisbuddy.getConversations();
  await switchToConversation(newConv.id);
}

async function handleDeleteConversation(convId: string) {
  const conv = conversations.find(c => c.id === convId);
  await gisbuddy.deleteConversation(convId);
  // Clean up persisted session data
  if (conv?.sessionId) {
    try { await getAppStorage().sessions.deleteSession(conv.sessionId); }
    catch { /* IndexedDB may fail */ }
  }
  conversations = await gisbuddy.getConversations();
  if (convId === currentConvId) {
    const projectConvs = conversations.filter(c => c.projectId === currentProjectId);
    if (projectConvs.length > 0) {
      await switchToConversation(projectConvs[0].id);
    } else if (currentProjectId) {
      await handleNewConversation(currentProjectId);
    } else {
      renderApp();
    }
  } else {
    renderApp();
  }
}

// ── Sidebar rendering ──
function renderSidebar() {
  const activeProjects = projects.filter(p => !p.archived);
  const projectConvs = currentProjectId ? conversations.filter(c => c.projectId === currentProjectId) : [];

  return html`
    <div data-testid="sidebar" style="width:240px;height:100vh;border-right:1px solid #e0e0e0;display:flex;flex-direction:column;background:#fafafa;font-family:system-ui,sans-serif;">
      <!-- Header -->
      <div style="padding:12px 16px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:14px;font-weight:600;color:#333;">GISBuddy</span>
        <button @click=${handleNewProject}
          style="border:none;background:#4a90d9;color:white;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;"
          title="新建项目">+ 项目</button>
      </div>

      <!-- Project & conversation list -->
      <div style="flex:1;overflow-y:auto;padding:8px 0;">
        ${activeProjects.map(project => html`
          <div>
            <!-- Project header -->
            <div
              @click=${() => handleSelectProject(project.id)}
              style="padding:6px 16px;cursor:pointer;font-size:13px;font-weight:500;color:${project.id === currentProjectId ? '#4a90d9' : '#555'};display:flex;align-items:center;gap:6px;background:${project.id === currentProjectId ? '#e8f0fe' : 'transparent'};"
            >
              <span>📁</span>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${project.title}</span>
            </div>
            <!-- Conversations under selected project -->
            ${project.id === currentProjectId ? html`
              <div style="margin-left:20px;">
                ${projectConvs.map(conv => html`
                  <div
                    @click=${() => switchToConversation(conv.id)}
                    style="padding:5px 16px;cursor:pointer;font-size:12px;color:${conv.id === currentConvId ? '#4a90d9' : '#777'};background:${conv.id === currentConvId ? '#e8f0fe' : 'transparent'};display:flex;align-items:center;gap:4px;"
                  >
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${conv.title || '新对话'}</span>
                    <button
                      @click=${(e: Event) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                      style="border:none;background:none;color:#ccc;cursor:pointer;font-size:11px;padding:0 2px;"
                      title="删除对话">✕</button>
                  </div>
                `)}
                <button
                  @click=${() => handleNewConversation(project.id)}
                  style="margin-left:16px;border:none;background:none;color:#999;cursor:pointer;font-size:12px;padding:5px 16px;"
                >+ 对话</button>
              </div>
            ` : ''}
          </div>
        `)}
      </div>

      <!-- Footer -->
      <div style="padding:8px 16px;border-top:1px solid #e0e0e0;">
        <span style="font-size:11px;color:#aaa;">${activeProjects.length} 个项目</span>
      </div>
    </div>
  `;
}

// ── File tree ──
const FILE_ICONS: Record<string, string> = {
  '.tif': '🖼️', '.tiff': '🖼️', '.shp': '🗺️', '.geojson': '📋',
  '.json': '📋', '.gpkg': '🗄️', '.csv': '📊', '.xml': '📄',
  '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️',
};

async function refreshFileTree(dir?: string) {
  if (dir !== undefined) currentDir = dir;
  if (!currentDir) return;
  try {
    fileTreeEntries = await gisbuddy.listDirectory(currentDir);
  } catch {
    fileTreeEntries = [];
  }
  renderApp();
}

function handleDirClick(dirPath: string) {
  refreshFileTree(dirPath);
}

async function handleFileClick(filePath: string) {
  activeFilePath = filePath;
  fileViewData = null;
  if (mapRafHandle) { cancelAnimationFrame(mapRafHandle); mapRafHandle = 0; }
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  renderApp();
  try {
    const data = await gisbuddy.readFile(filePath);
    if (activeFilePath === filePath) {
      fileViewData = data;
      renderApp();
      // Leaflet map needs a tick to render after DOM update
      if (data.type === 'geojson') {
        mapRafHandle = requestAnimationFrame(() => initMap(data.content));
      }
    }
  } catch {
    if (activeFilePath === filePath) {
      fileViewData = { type: 'error', content: '', message: '读取文件失败' };
      renderApp();
    }
  }
}

function handleCloseFile() {
  activeFilePath = null;
  fileViewData = null;
  if (mapRafHandle) { cancelAnimationFrame(mapRafHandle); mapRafHandle = 0; }
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }
  renderApp();
}

function initMap(geojson: string) {
  const mapEl = document.getElementById('gisbuddy-map');
  if (!mapEl) return;
  const map = L.map(mapEl, { zoomControl: true });
  mapInstance = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);
  let layer: AnyObj;
  try {
    const geo = typeof geojson === 'string' ? JSON.parse(geojson) : geojson;
    layer = L.geoJSON(geo, {
      pointToLayer: (_f: AnyObj, latlng: AnyObj) =>
        L.circleMarker(latlng, {
          radius: 6, fillColor: '#3388ff', color: '#fff', weight: 2, fillOpacity: 0.8,
        }),
    }).addTo(map);
  } catch {
    map.remove();
    mapInstance = null;
    return;
  }
  if (layer.getLayers().length > 0) {
    map.fitBounds(layer.getBounds(), { padding: [20, 20] });
  } else {
    map.setView([0, 0], 2);
  }
  requestAnimationFrame(() => map.invalidateSize());
}

function renderFileTree() {
  const upOne = currentDir && currentDir !== currentCwd;
  return html`
    <div style="width:220px;height:100vh;border-left:1px solid #e0e0e0;display:flex;flex-direction:column;background:#fafafa;font-family:system-ui,sans-serif;font-size:13px;">
      <div style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        📂 ${currentDir ? currentDir.slice(currentDir.lastIndexOf('/') + 1) || currentDir : '—'}
      </div>
      <div style="flex:1;overflow-y:auto;padding:4px 0;">
        ${upOne ? html`
          <div @click=${() => handleDirClick(parentDir(currentDir))}
            style="padding:4px 12px;cursor:pointer;color:#4a90d9;display:flex;align-items:center;gap:6px;font-size:12px;">
            <span>📁</span><span>..</span>
          </div>
        ` : ''}
        ${fileTreeEntries.map(entry => html`
          <div @click=${() => entry.isDirectory ? handleDirClick(entry.path) : handleFileClick(entry.path)}
            style="padding:4px 12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:12px;color:${entry.isDirectory ? '#555' : '#333'};"
          >
            <span>${entry.isDirectory ? '📁' : (FILE_ICONS[entry.ext] || '📄')}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${entry.name}</span>
            ${entry.isDirectory ? '' : html`<span style="color:#aaa;font-size:10px;">${formatFileSize(entry.size)}</span>`}
          </div>
        `)}
      </div>
    </div>
  `;
}

function renderFileView() {
  if (!activeFilePath) {
    return chatPanel ?? html`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">选择一个对话</div>`;
  }

  const name = activeFilePath.slice(activeFilePath.lastIndexOf('/') + 1);
  const header = html`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid #e0e0e0;background:#fff;">
      <button @click=${handleCloseFile} style="border:none;background:none;cursor:pointer;font-size:14px;color:#888;">← 返回</button>
      <span style="font-size:13px;color:#555;">${name}</span>
    </div>
  `;

  if (!fileViewData) {
    return html`${header}<div style="display:flex;align-items:center;justify-content:center;flex:1;color:#888;">加载中...</div>`;
  }

  const data = fileViewData;
  let body;
  switch (data.type) {
    case 'text':
      body = html`<pre style="flex:1;overflow:auto;margin:0;padding:16px;background:#f6f8fa;font-family:monospace;font-size:13px;white-space:pre-wrap;">${data.content}</pre>`;
      break;
    case 'image':
      body = html`<div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f0f0f0;">
        <img src="${data.content}" alt="${data.name}" style="max-width:100%;max-height:100%;" />
      </div>`;
      break;
    case 'geojson':
      body = html`<div id="gisbuddy-map" style="flex:1;width:100%;"></div>`;
      break;
    case 'error':
    default:
      body = html`<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#999;font-size:14px;">${data.message || '无法预览此文件'}</div>`;
      break;
  }

  return html`
    <div style="display:flex;flex-direction:column;height:100%;">
      ${header}${body}
    </div>
  `;
}

// ── Main render ──
function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;

  render(html`
    <div style="display:flex;width:100vw;height:100vh;overflow:hidden;">
      ${renderSidebar()}
      <div style="flex:1;height:100vh;display:flex;flex-direction:column;min-width:0;">
        ${renderFileView()}
      </div>
      ${renderFileTree()}
    </div>
  `, app);
}

// ── API Key prompt (Electron disables window.prompt) ──
function promptApiKey(container: HTMLElement): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const form = document.createElement('form');
    form.style.cssText = 'display:flex;flex-direction:column;gap:12px;width:360px;max-width:90vw;padding:24px;background:#fff;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.15);font-family:sans-serif;';

    const title = document.createElement('h3');
    title.textContent = '请输入 DeepSeek API Key';
    title.style.cssText = 'margin:0;font-size:16px;color:#222;';
    form.appendChild(title);

    const hint = document.createElement('p');
    hint.textContent = 'Key 将保存在本地，用于调用 DeepSeek 模型。';
    hint.style.cssText = 'margin:0;font-size:12px;color:#888;';
    form.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'sk-...';
    input.required = true;
    input.style.cssText = 'padding:8px 10px;border:1px solid #ccc;border-radius:4px;font-size:14px;outline:none;';
    form.appendChild(input);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:6px 12px;border:1px solid #ccc;background:#f5f5f5;border-radius:4px;cursor:pointer;font-size:14px;';
    cancelBtn.onclick = () => done(null);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = '保存';
    submitBtn.style.cssText = 'padding:6px 12px;border:none;background:#2563eb;color:#fff;border-radius:4px;cursor:pointer;font-size:14px;';

    row.appendChild(cancelBtn);
    row.appendChild(submitBtn);
    form.appendChild(row);

    form.onsubmit = (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (v) done(v);
    };

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);z-index:9999;';
    overlay.appendChild(form);
    container.appendChild(overlay);

    setTimeout(() => input.focus(), 0);
  });
}

// ── Init ──
async function initApp() {
  const app = document.getElementById('app');
  if (!app) throw new Error('App container not found');

  // Catch async errors from sidebar click handlers etc.
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[GISBuddy] unhandled rejection:', e.reason);
  });

  render(html`<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">GISBuddy loading...</div>`, app);

  apiKey = (await gisbuddy.getApiKey()) || '';
  if (!apiKey) {
    const key = await promptApiKey(app);
    if (!key) throw new Error('需要配置 API Key');
    await gisbuddy.configure(key);
    apiKey = key;
  }

  await setupAppStorage(apiKey);
  if (isTestMode) (window as AnyObj).__storage = getAppStorage();

  projects = await gisbuddy.getProjects();
  conversations = await gisbuddy.getConversations();

  if (projects.length === 0) {
    await handleNewProject();
  } else {
    await handleSelectProject(projects[0].id);
  }

  console.log('[GISBuddy] init complete');
}

initApp().catch(err => {
  console.error('[GISBuddy] init failed:', err);
  const app = document.getElementById('app');
  if (app) {
    render(html`<div style="color:red;padding:20px;font-family:sans-serif;">启动失败：${(err as Error).message}</div>`, app);
  }
});
