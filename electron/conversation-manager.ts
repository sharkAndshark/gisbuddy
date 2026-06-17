import * as path from 'path';
import * as fs from 'fs';

export interface Project {
  id: string;
  title: string;
  folderPath: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
  messages: unknown[];
}

export class ConversationManager {
  private projects: Project[] = [];
  private conversations: Conversation[] = [];
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.projects = (parsed.projects || []) as Project[];
        this.conversations = (parsed.conversations || []) as Conversation[];
      }
    } catch (err) {
      console.warn('[ConversationManager] failed to load, starting fresh:', err);
      this.projects = [];
      this.conversations = [];
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ projects: this.projects, conversations: this.conversations }, null, 2));
  }

  // ── Project methods ──

  getProjects(): Project[] {
    return this.projects;
  }

  getProject(id: string): Project | undefined {
    return this.projects.find(p => p.id === id);
  }

  createProject(folderPath: string): Project {
    const project: Project = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: path.basename(folderPath),
      folderPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
    };
    this.projects.push(project);
    this.save();
    return project;
  }

  renameProject(id: string, title: string) {
    const project = this.projects.find(p => p.id === id);
    if (project) {
      project.title = title;
      project.updatedAt = Date.now();
      this.save();
    }
  }

  archiveProject(id: string) {
    const project = this.projects.find(p => p.id === id);
    if (project) {
      project.archived = true;
      project.updatedAt = Date.now();
      this.save();
    }
  }

  unarchiveProject(id: string) {
    const project = this.projects.find(p => p.id === id);
    if (project) {
      project.archived = false;
      project.updatedAt = Date.now();
      this.save();
    }
  }

  moveConversation(convId: string, projectId: string) {
    const conv = this.conversations.find(c => c.id === convId);
    if (conv) {
      conv.projectId = projectId;
      conv.updatedAt = Date.now();
      this.save();
    }
  }

  // ── Conversation methods ──

  getAll() {
    return this.conversations.map(({ messages: _m, ...rest }) => rest);
  }

  get(id: string): Conversation | undefined {
    return this.conversations.find(c => c.id === id);
  }

  create(projectId: string): Conversation {
    const conv: Conversation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: '新对话',
      projectId,
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
