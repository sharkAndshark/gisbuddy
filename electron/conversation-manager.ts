import * as path from 'path';
import * as fs from 'fs';

export interface Conversation {
  id: string;
  title: string;
  folderPath: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
}

// Legacy project shape kept for migration only (not exported).
interface LegacyProject {
  id: string;
  title: string;
  folderPath: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

interface LegacyConversation {
  id: string;
  title: string;
  projectId: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  folderPath?: string;
}

export class ConversationManager {
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
        const legacyProjects = (parsed.projects || []) as LegacyProject[];
        const rawConvs = (parsed.conversations || []) as Record<string, unknown>[];

        // Build a lookup from legacy projectId → folderPath for migration.
        const projectFolderMap = new Map<string, string>();
        for (const p of legacyProjects) {
          projectFolderMap.set(p.id, p.folderPath);
        }

        // Normalize + migrate: each conversation inherits its project's
        // folderPath if it doesn't already have one. Strip legacy fields.
        const migrated: Conversation[] = [];
        for (const c of rawConvs) {
          if (!c.sessionId) c.sessionId = '';
          delete c.messages;
          delete c.legacyMessages;
          delete c.sessionPath;

          const legacy = c as unknown as LegacyConversation;
          const folderPath = c.folderPath as string | undefined
            || projectFolderMap.get(legacy.projectId)
            || '';

          migrated.push({
            id: c.id as string,
            title: c.title as string,
            folderPath,
            sessionId: c.sessionId as string,
            createdAt: c.createdAt as number,
            updatedAt: c.updatedAt as number,
          });
        }
        this.conversations = migrated;

        // If migration occurred (legacy projects existed), save the new format
        // so we don't need to migrate again.
        if (legacyProjects.length > 0) {
          this.save();
        }
      }
    } catch (err) {
      console.warn('[ConversationManager] failed to load, starting fresh:', err);
      this.conversations = [];
    }
  }

  save() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ conversations: this.conversations }, null, 2));
  }

  // ── Conversation methods ──

  getAll() {
    return [...this.conversations];
  }

  get(id: string): Conversation | undefined {
    return this.conversations.find(c => c.id === id);
  }

  create(folderPath: string): Conversation {
    const conv: Conversation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: '新对话',
      folderPath,
      sessionId: '', // filled after AgentSession is created
      createdAt: Date.now(),
      updatedAt: Date.now(),
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

  setSessionId(id: string, sessionId: string) {
    const conv = this.get(id);
    if (conv) {
      conv.sessionId = sessionId;
      conv.updatedAt = Date.now();
      this.save();
    }
  }
}
