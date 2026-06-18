import { Agent } from '@earendil-works/pi-agent-core';
import { getModel } from '@earendil-works/pi-ai';
import { ChatPanel, AppStorage, IndexedDBStorageBackend, ProviderKeysStore, SessionsStore, SettingsStore, setAppStorage } from '@earendil-works/pi-web-ui';
import { html, render } from 'lit';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import * as path from 'path';

// pi-coding-agent is Node.js-specific — use require() to avoid bundling import.meta.url issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SessionManager, SettingsManager, AgentSession } = require('@earendil-works/pi-coding-agent');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

const gisbuddy = (window as unknown as {
  gisbuddy: {
    toolExec: (toolName: string, params: unknown, cwd: string) => Promise<{ success: boolean; value?: AgentToolResult; error?: string }>;
    getApiKey: () => Promise<string | null>;
    configure: (key: string) => Promise<{ success: boolean }>;
    getProjects: () => Promise<Array<{ id: string; title: string; folderPath: string; createdAt: number; archived: boolean }>>;
    createProject: () => Promise<{ id: string; title: string; folderPath: string } | null>;
    getConversations: () => Promise<Array<{ id: string; title: string; projectId: string; sessionId: string }>>;
    createConversation: (projectId: string) => Promise<{ id: string } | null>;
    deleteConversation: (id: string) => Promise<void>;
    renameConversation: (id: string, title: string) => Promise<void>;
    setConversationSessionId: (id: string, sessionId: string) => Promise<void>;
    listDirectory: (dirPath: string) => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
  };
}).gisbuddy;

let currentCwd: string | null = null;
let chatPanel: ChatPanel | null = null;

// ── Set up AppStorage (required by pi-web-ui AgentInterface) ──
function setupAppStorage(apiKey: string) {
  const settings = new SettingsStore();
  const providerKeys = new ProviderKeysStore();
  const sessions = new SessionsStore();

  const stores = [
    settings.getConfig(),
    providerKeys.getConfig(),
    sessions.getConfig(),
    SessionsStore.getMetadataConfig(),
  ];

  const backend = new IndexedDBStorageBackend({
    dbName: 'gisbuddy-pi',
    version: 1,
    stores: stores as AnyObj,
  });

  settings.setBackend(backend);
  providerKeys.setBackend(backend);
  sessions.setBackend(backend);

  const storage = new AppStorage(settings, providerKeys, sessions, undefined as AnyObj, backend);
  setAppStorage(storage);

  providerKeys.set('deepseek', apiKey).catch(console.error);
}

// ── Tool factory (IPC-bridged) ──
function createTool(name: string, label: string, desc: string, params: Record<string, unknown>): AgentTool {
  type ParamType = typeof params;
  return {
    name,
    label,
    description: desc,
    parameters: params as never,
    execute: async (_id: string, p: unknown) => {
      if (!currentCwd) throw new Error('No project selected');
      const res = await gisbuddy.toolExec(name, p, currentCwd);
      if (!res.success) throw new Error(res.error || 'Tool failed');
      return res.value as AgentToolResult;
    },
  } as AgentTool<ParamType>;
}

const TOOLS: AgentTool[] = [
  createTool('bash', 'Bash', 'Execute a bash command', {
    type: 'object', properties: { command: { type: 'string' } }, required: ['command'],
  }),
  createTool('read', 'Read File', 'Read file contents', {
    type: 'object', properties: { path: { type: 'string' } }, required: ['path'],
  }),
  createTool('write', 'Write File', 'Write content to a file', {
    type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'],
  }),
  createTool('edit', 'Edit File', 'Edit file by replacing text', {
    type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['path', 'oldString', 'newString'],
  }),
];

const SYSTEM_PROMPT = `You are GISBuddy, a helpful GIS data processing assistant. You have tools to execute bash commands, read files, write files, and edit files.`;

// ── Initialization ──
async function initApiKey(): Promise<string> {
  const stored = await gisbuddy.getApiKey();
  if (stored) return stored;
  const key = prompt('请输入 DeepSeek API Key');
  if (!key) throw new Error('需要配置 API Key');
  await gisbuddy.configure(key);
  return key;
}

async function createAgentSession(cwd: string, apiKey: string) {
  const sessionsDir = path.join(cwd, '.gisbuddy', 'sessions');
  const sessionManager = SessionManager.create(cwd, sessionsDir);
  const settingsManager = SettingsManager.create(cwd);

  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: getModel('deepseek', 'deepseek-v4-pro'),
      tools: TOOLS,
    },
    getApiKey: async () => apiKey,
  });

  const session = new AgentSession({
    agent: agent as AnyObj,
    sessionManager: sessionManager as AnyObj,
    settingsManager: settingsManager as AnyObj,
    cwd,
    modelRegistry: { getApiKeyAndHeaders: async () => ({ ok: true, apiKey }) } as AnyObj,
    resourceLoader: {
      cwd,
      reload: async () => {},
    } as AnyObj,
    initialActiveToolNames: ['bash', 'read', 'write', 'edit'],
  });

  return { session, agent };
}

async function renderApp() {
  const app = document.getElementById('app');
  if (!app || !chatPanel) return;
  render(html`<div style="width:100%;height:100vh;display:flex;flex-direction:column;">${chatPanel}</div>`, app);
}

async function initApp() {
  const app = document.getElementById('app');
  if (!app) throw new Error('App container not found');

  render(html`<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">GISBuddy loading...</div>`, app);

  const apiKey = await initApiKey();
  setupAppStorage(apiKey);

  const projects = await gisbuddy.getProjects();
  if (projects.length === 0) {
    const newP = await gisbuddy.createProject();
    if (!newP) throw new Error('请选择一个项目文件夹');
    projects.push(newP);
  }
  const project = projects[0];
  currentCwd = project.folderPath;

  const conversations = await gisbuddy.getConversations();
  const projectConvs = conversations.filter(c => c.projectId === project.id);

  let convId: string;
  if (projectConvs.length > 0) {
    convId = projectConvs[0].id;
  } else {
    const newConv = await gisbuddy.createConversation(project.id);
    if (!newConv) throw new Error('Failed to create conversation');
    convId = newConv.id;
  }

  const { session } = await createAgentSession(project.folderPath, apiKey);
  await gisbuddy.setConversationSessionId(convId, session.sessionId);

  chatPanel = document.createElement('pi-chat-panel') as ChatPanel;
  await chatPanel.setAgent(session.agent as AnyObj, {
    onApiKeyRequired: async () => {
      try { await initApiKey(); return true; } catch { return false; }
    },
  });

  renderApp();
}

initApp().catch(err => {
  console.error('GISBuddy init failed:', err);
  const app = document.getElementById('app');
  if (app) {
    render(html`<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:red;">启动失败：${(err as Error).message}</div>`, app);
  }
});
