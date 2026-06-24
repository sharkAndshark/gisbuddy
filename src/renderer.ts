import { ChatPanel, AppStorage, IndexedDBStorageBackend, ProviderKeysStore, SettingsStore, setAppStorage } from '@earendil-works/pi-web-ui';
import { html, render } from 'lit';
import L from 'leaflet';
import { AgentProxy, type AgentStateSnapshot } from './agent-proxy.js';
import { computeAutoTitle, formatFileSize, parentDir } from './renderer-helpers.js';
import { registerGisbuddyToolRenderers } from './tool-renderers.js';

// Register Claude-Code-style box-drawing tool renderers before any chat panel
// is created. These override pi-web-ui's default card-style renderers.
registerGisbuddyToolRenderers();

console.log('[GISBuddy] bundle.js loaded');

// macOS uses a hidden native titlebar; we provide drag regions in the web content.
// On Windows/Linux the native titlebar is kept (see electron/main.ts), so drag
// regions must be no-ops there to avoid changing the layout or behavior.
const isMac = typeof process !== 'undefined' && process.platform === 'darwin';
const DRAG = isMac ? '-webkit-app-region:drag;' : '';
const NO_DRAG = isMac ? '-webkit-app-region:no-drag;' : '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

// Faux provider now lives in the main process (electron/faux.ts); the renderer
// drives it through `gisbuddy.fauxSetResponses` over IPC. No window.__faux export.

interface Conversation { id: string; title: string; folderPath: string; sessionId: string }

const gisbuddy = (window as unknown as {
  gisbuddy: {
    getApiKey: () => Promise<string | null>;
    configure: (key: string) => Promise<{ success: boolean }>;
    toggleMaximize: () => Promise<void>;
    getConversations: () => Promise<Conversation[]>;
    createConversation: () => Promise<Conversation | null>;
    deleteConversation: (id: string) => Promise<void>;
    renameConversation: (id: string, title: string) => Promise<void>;
    setConversationSessionId: (id: string, sessionId: string) => Promise<void>;
    listDirectory: (dirPath: string) => Promise<FileEntry[]>;
    readFile: (filePath: string) => Promise<FileViewData>;
    // Agent bridge (new)
    agentSwitch: (conversationId: string, cwd: string, sessionFilePath?: string) => Promise<{ sessionId: string; sessionFilePath: string; state: AgentStateSnapshot }>;
    agentPrompt: (conversationId: string, payload: string) => Promise<AgentStateSnapshot>;
    agentAbort: (conversationId: string) => Promise<void>;
    agentGetState: (conversationId: string) => Promise<AgentStateSnapshot | null>;
    agentDispose: (conversationId: string) => Promise<void>;
    onAgentEvent: (listener: (conversationId: string, event: unknown) => void) => () => void;
    fauxSetResponses: (responses: unknown[]) => Promise<void>;
    log: (level: string, scope: string, msg: string, extra?: unknown) => Promise<void>;
  };
}).gisbuddy;

// ── Logger (writes to userData/gisbuddy.log via IPC) ──
function rlog(scope: string, msg: string, extra?: unknown): void {
  try { gisbuddy.log('info', scope, msg, extra); } catch { /* IPC may not be ready */ }
  console.log(`[${scope}] ${msg}`, extra ?? '');
}
function rlogErr(scope: string, msg: string, extra?: unknown): void {
  try { gisbuddy.log('error', scope, msg, extra); } catch { /* IPC may not be ready */ }
  console.error(`[${scope}] ${msg}`, extra ?? '');
}

interface FileEntry { name: string; path: string; isDirectory: boolean; size: number; ext: string; }
interface FileViewData { type: 'text' | 'image' | 'geojson' | 'error'; content: string | Record<string, unknown>; name?: string; message?: string; }

// ── Global state ──
let apiKey = '';
let conversations: Conversation[] = [];
let currentConvId: string | null = null;
let currentCwd: string | null = null;
let chatPanel: ChatPanel | null = null;
let currentAgent: AgentProxy | null = null;

// ── Sidebar collapse state ──
let sidebarCollapsed = false;

// ── File tree state ──
let currentDir = '';
let fileTreeEntries: FileEntry[] = [];
let activeFilePath: string | null = null;
let fileViewData: FileViewData | null = null;
let mapInstance: AnyObj | null = null;
let mapRafHandle = 0;

// ── AppStorage (required by pi-web-ui AgentInterface) ──
// Only SettingsStore + ProviderKeysStore remain in IndexedDB. Sessions moved
// to main's SessionManager JSONL (issue #14). dbName bumped to v2 to drop the
// legacy `sessions` object store without an in-place schema migration.
async function setupAppStorage(key: string) {
  const settings = new SettingsStore();
  const providerKeys = new ProviderKeysStore();
  const stores = [settings.getConfig(), providerKeys.getConfig()];
  const backend = new IndexedDBStorageBackend({ dbName: 'gisbuddy-pi-v2', version: 1, stores: stores as AnyObj });
  settings.setBackend(backend);
  providerKeys.setBackend(backend);
  const storage = new AppStorage(settings, providerKeys, undefined as AnyObj, undefined as AnyObj, backend);
  setAppStorage(storage);
  await providerKeys.set('deepseek', key);
}

// ── Chat panel management ──
let switchSeq = 0;

async function handleAutoTitle(conv: Conversation, proxy: AgentProxy) {
  if (conv.title !== '新对话') return;
  const title = computeAutoTitle(proxy.state.messages as AnyObj[]);
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

  currentConvId = convId;
  currentCwd = conv.folderPath;

  // Initialize file tree
  currentDir = currentCwd;
  activeFilePath = null;
  fileViewData = null;
  if (mapRafHandle) { cancelAnimationFrame(mapRafHandle); mapRafHandle = 0; }
  if (mapInstance) { mapInstance.remove(); mapInstance = null; }

  // Tear down previous AgentProxy: stop IPC subscription and abort any in-flight run.
  const seq = ++switchSeq;
  if (currentAgent) {
    try { await currentAgent.abort(); } catch { /* ignore */ }
    currentAgent.dispose();
    currentAgent = null;
  }

  // Ask main to spin up (or return cached) AgentSession for this conversation.
  // Main owns tools, model, and system prompt — renderer only mirrors state.
  // `conv.sessionId` carries the JSONL file path on resume (empty for new).
  const switched = await gisbuddy.agentSwitch(conv.id, currentCwd, conv.sessionId || undefined);
  if (seq !== switchSeq) return;

  // Persist the JSONL path back to the conversation so the next switch resumes.
  if (switched.sessionFilePath && switched.sessionFilePath !== conv.sessionId) {
    conv.sessionId = switched.sessionFilePath;
    try { await gisbuddy.setConversationSessionId(conv.id, switched.sessionFilePath); }
    catch { /* IPC may fail — next switch will retry */ }
  }

  const proxy = new AgentProxy(conv.id, switched.state);
  proxy.connect(gisbuddy);
  currentAgent = proxy;
  if (seq !== switchSeq) return;

  // Subscribe to agent_end for auto-title. Message rendering is handled by
  // AgentInterface (it subscribes internally via setAgent), so we only need
  // our own subscription for GISBuddy-specific side effects.
  proxy.subscribe(async (event: Record<string, unknown>) => {
    if (event.type === 'agent_end') {
      await handleAutoTitle(conv, proxy);
    }
  });

  // Reuse ChatPanel element, only update the agent.
  if (!chatPanel) {
    chatPanel = document.createElement('pi-chat-panel') as ChatPanel;
  }
  if (seq !== switchSeq) return;
  await chatPanel.setAgent(proxy.asAgent() as AnyObj, {
    onApiKeyRequired: async () => true,
    // toolsFactory intentionally empty — main owns the tool list.
    // ChatPanel will still inject its `artifacts` tool; that's harmless (no
    // artifact messages are produced in GISBuddy's flows today).
    toolsFactory: () => [],
  });
  if (seq !== switchSeq) return;

  renderApp();
  refreshFileTree();
}

// ── Actions ──
// macOS hidden titlebar: double-click on a drag region toggles maximize.
// On Windows/Linux the native titlebar handles this, so the handler is a no-op.
function handleDragDblClick() {
  if (!isMac) return;
  gisbuddy.toggleMaximize();
}

async function handleNewConversation() {
  const newConv = await gisbuddy.createConversation();
  if (!newConv) {
    // User cancelled folder dialog
    renderApp();
    return;
  }
  conversations = await gisbuddy.getConversations();
  await switchToConversation(newConv.id);
}

async function handleDeleteConversation(convId: string) {
  await gisbuddy.deleteConversation(convId);
  // Main's disposeSession (invoked by the delete-conversation IPC) cleans up
  // the AgentSession; the JSONL file is retained on disk as history.
  conversations = await gisbuddy.getConversations();
  if (convId === currentConvId) {
    if (currentAgent) {
      try { await currentAgent.abort(); } catch { /* ignore */ }
      currentAgent.dispose();
      currentAgent = null;
    }
    currentConvId = null;
    currentCwd = null;
    activeFilePath = null;
    fileViewData = null;
    if (mapRafHandle) { cancelAnimationFrame(mapRafHandle); mapRafHandle = 0; }
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }
    if (conversations.length > 0) {
      await switchToConversation(conversations[0].id);
    } else {
      renderApp();
    }
  } else {
    renderApp();
  }
}

// ── Sidebar rendering ──
function handleToggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  rlog('sidebar', 'toggle', { collapsed: sidebarCollapsed });
  renderApp();
}

function renderSidebar() {
  // Collapsed: float the + and expand buttons over the main content, right
  // next to the macOS traffic lights. No sidebar panel is rendered, so the
  // conversation list disappears completely for full immersion.
  if (sidebarCollapsed) {
    return html`
      <div data-testid="sidebar" @dblclick=${handleDragDblClick} style="position:absolute;top:0;left:0;z-index:9999;${isMac ? 'height:38px;padding-left:80px;padding-right:16px;' : 'padding:12px 16px;'}display:flex;justify-content:flex-start;align-items:center;gap:2px;${DRAG}">
        <button @click=${() => handleNewConversation()}
          style="border:none;background:none;color:#5a544a;cursor:pointer;font-size:15px;padding:0 4px;line-height:1;${NO_DRAG}"
          title="新建对话">+</button>
        <button @click=${() => handleToggleSidebar()}
          style="border:none;background:none;color:#5a544a;cursor:pointer;font-size:13px;padding:0 4px;line-height:1;${NO_DRAG}"
          title="展开侧边栏">»</button>
      </div>
    `;
  }
  return html`
    <div data-testid="sidebar" style="width:240px;height:100vh;border-right:1px solid #d8d0c2;display:flex;flex-direction:column;background:#e8e3d8;font-family:system-ui,sans-serif;">
      <!-- Header -->
      <div @dblclick=${handleDragDblClick} style="height:38px;flex-shrink:0;${isMac ? 'padding-left:80px;' : ''}padding-right:16px;display:flex;justify-content:flex-end;align-items:center;gap:2px;${DRAG}">
        <button @click=${handleNewConversation}
          class="new-project-btn"
          style="border:none;background:none;color:#5a544a;cursor:pointer;font-size:16px;padding:0 4px;line-height:1;${NO_DRAG}"
          title="新建对话">+</button>
        <button @click=${() => handleToggleSidebar()}
          style="border:none;background:none;color:#5a544a;cursor:pointer;font-size:14px;padding:0 4px;line-height:1;${NO_DRAG}"
          title="收起侧边栏">«</button>
      </div>

      <!-- Conversation list (flat, single-level) -->
      <div style="flex:1;overflow-y:auto;padding:8px 0;">
        ${conversations.map(conv => html`
          <div
            @click=${() => switchToConversation(conv.id)}
            class="project-row"
            style="padding:6px 16px;cursor:pointer;font-size:13px;font-weight:500;color:${conv.id === currentConvId ? '#6b7d5e' : '#5a544a'};display:flex;align-items:center;gap:6px;"
          >
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${conv.title || '新对话'}</span>
            <button
              @click=${(e: Event) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
              class="project-action-btn"
              style="border:none;background:none;color:#a09886;cursor:pointer;font-size:11px;padding:0 4px;${NO_DRAG}"
              title="删除对话">✕</button>
          </div>
        `)}
      </div>

      <!-- Footer -->
      <div style="padding:8px 16px;border-top:1px solid #d8d0c2;">
        <span style="font-size:11px;color:#a09886;">${conversations.length} 个对话</span>
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
          radius: 6, fillColor: '#6b7d5e', color: '#ece8de', weight: 2, fillOpacity: 0.8,
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
    <div style="width:220px;height:100vh;border-left:1px solid #d8d0c2;display:flex;flex-direction:column;background:#e8e3d8;font-family:system-ui,sans-serif;font-size:13px;">
      <div @dblclick=${handleDragDblClick} style="height:38px;flex-shrink:0;display:flex;align-items:center;padding:0 12px;border-bottom:1px solid #d8d0c2;font-size:11px;color:#7a7468;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${DRAG}">
        📂 ${currentDir ? currentDir.slice(currentDir.lastIndexOf('/') + 1) || currentDir : '—'}
      </div>
      <div style="flex:1;overflow-y:auto;padding:4px 0;">
        ${upOne ? html`
          <div @click=${() => handleDirClick(parentDir(currentDir))}
            style="padding:4px 12px;cursor:pointer;color:#6b7d5e;display:flex;align-items:center;gap:6px;font-size:12px;">
            <span>📁</span><span>..</span>
          </div>
        ` : ''}
        ${fileTreeEntries.map(entry => html`
          <div @click=${() => entry.isDirectory ? handleDirClick(entry.path) : handleFileClick(entry.path)}
            style="padding:4px 12px;cursor:pointer;display:flex;align-items:center;gap:6px;font-size:12px;color:${entry.isDirectory ? '#5a544a' : '#7a7468'};"
          >
            <span>${entry.isDirectory ? '📁' : (FILE_ICONS[entry.ext] || '📄')}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${entry.name}</span>
            ${entry.isDirectory ? '' : html`<span style="color:#a09886;font-size:10px;">${formatFileSize(entry.size)}</span>`}
          </div>
        `)}
      </div>
    </div>
  `;
}

function renderFileView() {
  if (!activeFilePath) {
    // Only show the chat panel when a conversation is actually selected.
    // After deleting the last project/conversation, currentConvId is null and
    // the stale chatPanel (a persistent web component) must not be rendered.
    const inner = (currentConvId && chatPanel)
      ? chatPanel
      : html`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#7a7468;">选择一个对话</div>`;
    // Title bar: same height as the sidebar & file-tree headers (38px).
    // On macOS the native titlebar is hidden; this bar doubles as a drag region
    // and prevents the traffic lights from overlapping chat content.
    const currentConv = conversations.find(c => c.id === currentConvId);
    const titleText = currentConv ? (currentConv.title || '新对话') : '';
    return html`
      <div style="display:flex;flex-direction:column;height:100%;">
        <div @dblclick=${handleDragDblClick} style="position:relative;height:38px;flex-shrink:0;display:flex;align-items:center;padding:0 16px;border-bottom:1px solid #d8d0c2;background:#ece8de;font-size:13px;color:#5a544a;font-family:system-ui,sans-serif;${sidebarCollapsed ? '' : DRAG}">
          ${isMac ? html`<span style="width:${sidebarCollapsed ? '140px' : '64px'};flex-shrink:0;"></span>` : ''}
          <span style="position:absolute;left:0;right:0;text-align:center;pointer-events:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 16px;">${titleText}</span>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column;">${inner}</div>
      </div>
    `;
  }

  const name = activeFilePath.slice(activeFilePath.lastIndexOf('/') + 1);
  const header = html`
    <div @dblclick=${handleDragDblClick} style="display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid #d8d0c2;background:#ece8de;${DRAG}">
      <button @click=${handleCloseFile} style="border:none;background:none;cursor:pointer;font-size:14px;color:#7a7468;${NO_DRAG}">← 返回</button>
      <span style="font-size:13px;color:#5a544a;">${name}</span>
    </div>
  `;

  if (!fileViewData) {
    return html`${header}<div style="display:flex;align-items:center;justify-content:center;flex:1;color:#7a7468;">加载中...</div>`;
  }

  const data = fileViewData;
  let body;
  switch (data.type) {
    case 'text':
      body = html`<pre style="flex:1;overflow:auto;margin:0;padding:16px;background:#e2ddd0;font-family:monospace;font-size:13px;white-space:pre-wrap;">${data.content}</pre>`;
      break;
    case 'image':
      body = html`<div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#d6d0c2;">
        <img src="${data.content}" alt="${data.name}" style="max-width:100%;max-height:100%;" />
      </div>`;
      break;
    case 'geojson':
      body = html`<div id="gisbuddy-map" style="flex:1;width:100%;"></div>`;
      break;
    case 'error':
    default:
      body = html`<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#a09886;font-size:14px;">${data.message || '无法预览此文件'}</div>`;
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
    <div style="display:flex;width:100vw;height:100vh;overflow:hidden;position:relative;">
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
    form.style.cssText = 'display:flex;flex-direction:column;gap:12px;width:360px;max-width:90vw;padding:24px;background:#ece8de;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.15);font-family:sans-serif;';

    const title = document.createElement('h3');
    title.textContent = '请输入 DeepSeek API Key';
    title.style.cssText = 'margin:0;font-size:16px;color:#5a544a;';
    form.appendChild(title);

    const hint = document.createElement('p');
    hint.textContent = 'Key 将保存在本地，用于调用 DeepSeek 模型。';
    hint.style.cssText = 'margin:0;font-size:12px;color:#7a7468;';
    form.appendChild(hint);

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'sk-...';
    input.required = true;
    input.style.cssText = 'padding:8px 10px;border:1px solid #d8d0c2;border-radius:4px;font-size:14px;outline:none;background:#e8e3d8;color:#5a544a;';
    form.appendChild(input);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:6px 12px;border:1px solid #d8d0c2;background:#e8e3d8;color:#5a544a;border-radius:4px;cursor:pointer;font-size:14px;';
    cancelBtn.onclick = () => done(null);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = '保存';
    submitBtn.style.cssText = 'padding:6px 12px;border:none;background:#6b7d5e;color:#fff;border-radius:4px;cursor:pointer;font-size:14px;';

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
  rlog('init', 'initApp start');

  // Catch async errors from sidebar click handlers etc.
  window.addEventListener('unhandledrejection', (e) => {
    rlogErr('init', 'unhandled rejection', e.reason);
  });

  render(html`<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#7a7468;">GISBuddy loading...</div>`, app);

  apiKey = (await gisbuddy.getApiKey()) || '';
  rlog('init', 'api key loaded', { hasKey: !!apiKey });
  if (!apiKey) {
    const key = await promptApiKey(app);
    if (!key) throw new Error('需要配置 API Key');
    await gisbuddy.configure(key);
    apiKey = key;
    rlog('init', 'api key configured');
  }

  await setupAppStorage(apiKey);

  conversations = await gisbuddy.getConversations();
  rlog('init', 'conversations loaded', { count: conversations.length });

  if (conversations.length > 0) {
    await switchToConversation(conversations[0].id);
  } else {
    renderApp();
  }

  rlog('init', 'init complete');
}

initApp().catch(err => {
  rlogErr('init', 'init failed', err);
  const app = document.getElementById('app');
  if (app) {
    render(html`<div style="color:red;padding:20px;font-family:sans-serif;">启动失败：${(err as Error).message}</div>`, app);
  }
});
