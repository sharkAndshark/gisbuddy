import { Agent } from '@earendil-works/pi-agent-core';
import { getModel } from '@earendil-works/pi-ai';
import { ChatPanel, AppStorage, IndexedDBStorageBackend, ProviderKeysStore, SessionsStore, SettingsStore, setAppStorage } from '@earendil-works/pi-web-ui';
import { html, render } from 'lit';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import * as path from 'path';

console.log('[GISBuddy] bundle.js loaded');

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
    setConversationSessionId: (id: string, sessionId: string) => Promise<void>;
  };
}).gisbuddy;

let currentCwd: string | null = null;

function setupAppStorage(apiKey: string) {
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
  providerKeys.set('deepseek', apiKey).catch(console.error);
}

function createTool(name: string, label: string, desc: string, params: Record<string, unknown>): AgentTool {
  return {
    name, label, description: desc, parameters: params as never,
    execute: async (_id: string, p: unknown) => {
      if (!currentCwd) throw new Error('No project selected');
      const res = await gisbuddy.toolExec(name, p, currentCwd);
      if (!res.success) throw new Error(res.error || 'Tool failed');
      return res.value as AgentToolResult;
    },
  } as AgentTool;
}

const TOOLS: AgentTool[] = [
  createTool('bash', 'Bash', 'Execute bash command', { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] }),
  createTool('read', 'Read', 'Read file', { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }),
  createTool('write', 'Write', 'Write file', { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }),
  createTool('edit', 'Edit', 'Edit file', { type: 'object', properties: { path: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } }, required: ['path', 'oldString', 'newString'] }),
];

async function initApp() {
  console.log('[GISBuddy] initApp() started');
  const app = document.getElementById('app');
  if (!app) throw new Error('App container not found');

  render(html`<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#888;">GISBuddy loading...</div>`, app);

  const apiKey = await gisbuddy.getApiKey();
  if (!apiKey) {
    const key = prompt('请输入 DeepSeek API Key');
    if (!key) throw new Error('需要配置 API Key');
    await gisbuddy.configure(key);
  }
  const key = apiKey || '';

  setupAppStorage(key);

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
  if (projectConvs.length === 0) {
    await gisbuddy.createConversation(project.id);
  }

  const agent = new Agent({
    initialState: {
      systemPrompt: 'You are GISBuddy, a helpful GIS data processing assistant.',
      model: getModel('deepseek', 'deepseek-v4-pro'),
      tools: TOOLS,
    },
    getApiKey: async () => key,
  });

  const chatPanel = document.createElement('pi-chat-panel') as ChatPanel;
  await chatPanel.setAgent(agent as AnyObj, {
    onApiKeyRequired: async () => true,
  });

  render(html`<div style="width:100%;height:100vh;display:flex;flex-direction:column;">${chatPanel}</div>`, app);
  console.log('[GISBuddy] render complete');
}

initApp().catch(err => {
  console.error('[GISBuddy] init failed:', err);
  const app = document.getElementById('app');
  if (app) {
    render(html`<div style="color:red;padding:20px;font-family:sans-serif;">启动失败：${(err as Error).message}</div>`, app);
  }
});
