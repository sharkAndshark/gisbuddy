import { Agent } from '@earendil-works/pi-agent-core';
import { getModel } from '@earendil-works/pi-ai';
import { ChatPanel, AppStorage, IndexedDBStorageBackend, ProviderKeysStore, SessionsStore, SettingsStore, setAppStorage } from '@earendil-works/pi-web-ui';
import { html, render } from 'lit';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

console.log('[GISBuddy] bundle.js loaded');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

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
    setConversationSessionId: (id: string, sessionId: string) => Promise<void>;
  };
}).gisbuddy;

// ── Global state ──
let apiKey = '';
let projects: Project[] = [];
let conversations: Conversation[] = [];
let currentProjectId: string | null = null;
let currentConvId: string | null = null;
let currentCwd: string | null = null;
let chatPanel: ChatPanel | null = null;
let currentAgent: Agent | null = null;

// ── AppStorage (required by pi-web-ui AgentInterface) ──
function setupAppStorage(key: string) {
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
  providerKeys.set('deepseek', key).catch(console.error);
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
    makeTool('bash', 'Bash', 'Execute bash command', { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }),
    makeTool('read', 'Read', 'Read file', { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }),
    makeTool('write', 'Write', 'Write file', { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }),
    makeTool('edit', 'Edit', 'Edit file', { type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['path', 'oldString', 'newString'] }),
  ];
}

const SYSTEM_PROMPT = 'You are GISBuddy, a helpful GIS data processing assistant. You have tools to execute bash commands, read files, write files, and edit files.';

// ── Chat panel management ──
let switchSeq = 0;

async function switchToConversation(convId: string) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  const project = projects.find(p => p.id === conv.projectId);
  if (!project) return;

  currentConvId = convId;
  currentProjectId = conv.projectId;
  currentCwd = project.folderPath;

  // Abort previous Agent to stop any in-flight streaming
  const seq = ++switchSeq;
  try { currentAgent?.abort(); } catch { /* ignore */ }

  // Create fresh Agent with tools bound to this project's cwd
  currentAgent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: getModel('deepseek', 'deepseek-v4-pro'),
      tools: createTools(currentCwd),
    },
    getApiKey: async () => apiKey,
  });

  // Reuse ChatPanel element, only update the agent
  if (!chatPanel) {
    chatPanel = document.createElement('pi-chat-panel') as ChatPanel;
  }
  // Drop stale invocation before expensive setAgent call
  if (seq !== switchSeq) return;
  await chatPanel.setAgent(currentAgent as AnyObj, {
    onApiKeyRequired: async () => true,
  });

  if (seq !== switchSeq) return;
  renderApp();
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
  currentProjectId = projectId;
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
    renderApp();
    return;
  }
  conversations = await gisbuddy.getConversations();
  await switchToConversation(newConv.id);
}

async function handleDeleteConversation(convId: string) {
  await gisbuddy.deleteConversation(convId);
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
    <div style="width:240px;height:100vh;border-right:1px solid #e0e0e0;display:flex;flex-direction:column;background:#fafafa;font-family:system-ui,sans-serif;">
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

// ── Main render ──
function renderApp() {
  const app = document.getElementById('app');
  if (!app) return;

  render(html`
    <div style="display:flex;width:100vw;height:100vh;overflow:hidden;">
      ${renderSidebar()}
      <div style="flex:1;height:100vh;display:flex;flex-direction:column;min-width:0;">
        ${chatPanel ?? html`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;">选择一个对话</div>`}
      </div>
    </div>
  `, app);
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
    const key = prompt('请输入 DeepSeek API Key');
    if (!key) throw new Error('需要配置 API Key');
    await gisbuddy.configure(key);
    apiKey = key;
  }

  setupAppStorage(apiKey);

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
