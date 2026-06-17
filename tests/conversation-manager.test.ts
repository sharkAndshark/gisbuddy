import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConversationManager } from '../electron/conversation-manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-test-'));
const dbPath = path.join(tmpDir, 'test-conversations.json');

function freshManager(): ConversationManager {
  // ensure clean slate
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  return new ConversationManager(dbPath);
}

afterEach(() => {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

describe('ConversationManager — Project CRUD', () => {
  it('should start with no projects', () => {
    const mgr = freshManager();
    expect(mgr.getProjects()).toEqual([]);
  });

  it('should create a project with a folder path', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/Users/test/my-gis-project');
    expect(p).toBeDefined();
    expect(p.id).toBeTruthy();
    expect(p.title).toBe('my-gis-project');
    expect(p.folderPath).toBe('/Users/test/my-gis-project');
    expect(p.archived).toBe(false);
    expect(p.createdAt).toBeGreaterThan(0);
    expect(mgr.getProjects()).toHaveLength(1);
  });

  it('should get a single project by id', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/proj-a');
    const found = mgr.getProject(p.id);
    expect(found).toEqual(p);
  });

  it('should return undefined for unknown project id', () => {
    const mgr = freshManager();
    expect(mgr.getProject('nope')).toBeUndefined();
  });

  it('should rename a project', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/old-name');
    mgr.renameProject(p.id, 'new-name');
    expect(mgr.getProject(p.id)!.title).toBe('new-name');
  });

  it('should archive and unarchive a project', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/p');
    expect(p.archived).toBe(false);

    mgr.archiveProject(p.id);
    expect(mgr.getProject(p.id)!.archived).toBe(true);

    mgr.unarchiveProject(p.id);
    expect(mgr.getProject(p.id)!.archived).toBe(false);
  });

  it('should not throw on rename/archive/unarchive for unknown project', () => {
    const mgr = freshManager();
    expect(() => mgr.renameProject('nope', 'x')).not.toThrow();
    expect(() => mgr.archiveProject('nope')).not.toThrow();
    expect(() => mgr.unarchiveProject('nope')).not.toThrow();
  });
});

describe('ConversationManager — Conversation CRUD', () => {
  it('should create a conversation under a project', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/proj');
    const c = mgr.create(p.id);

    expect(c.id).toBeTruthy();
    expect(c.title).toBe('新对话');
    expect(c.projectId).toBe(p.id);
    expect(c.messages).toEqual([]);
    expect(c.createdAt).toBeGreaterThan(0);
  });

  it('should get a conversation by id', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/p');
    const c = mgr.create(p.id);
    const found = mgr.get(c.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('新对话');
    expect(found!.messages).toEqual([]);
  });

  it('should return undefined for unknown conversation id', () => {
    const mgr = freshManager();
    expect(mgr.get('nope')).toBeUndefined();
  });

  it('should rename a conversation', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/p');
    const c = mgr.create(p.id);
    mgr.rename(c.id, 'My New Title');
    expect(mgr.get(c.id)!.title).toBe('My New Title');
  });

  it('should delete a conversation', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/p');
    const c1 = mgr.create(p.id);
    const c2 = mgr.create(p.id);
    expect(mgr.getAll()).toHaveLength(2);

    mgr.delete(c1.id);
    expect(mgr.getAll()).toHaveLength(1);
    expect(mgr.get(c1.id)).toBeUndefined();
    expect(mgr.get(c2.id)).toBeDefined();
  });

  it('should return empty messages for a new conversation', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/p');
    const c = mgr.create(p.id);
    expect(mgr.getMessages(c.id)).toEqual([]);
  });

  it('should return empty messages for unknown conversation', () => {
    const mgr = freshManager();
    expect(mgr.getMessages('nope')).toEqual([]);
  });

  it('should return all conversations without messages field', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/p');
    const c = mgr.create(p.id);
    // push a message into the stored conversation (simulating chat)
    const raw = mgr.get(c.id)!;
    raw.messages.push({ role: 'user', content: 'hello' });

    const all = mgr.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).not.toHaveProperty('messages');
    expect(all[0]).toHaveProperty('id');
    expect(all[0]).toHaveProperty('title');
    expect(all[0]).toHaveProperty('projectId');
  });
});

describe('ConversationManager — moveConversation', () => {
  it('should move a conversation between projects', () => {
    const mgr = freshManager();
    const p1 = mgr.createProject('/data/p1');
    const p2 = mgr.createProject('/data/p2');
    const c = mgr.create(p1.id);
    expect(c.projectId).toBe(p1.id);

    mgr.moveConversation(c.id, p2.id);
    expect(mgr.get(c.id)!.projectId).toBe(p2.id);
  });

  it('should not throw on moving unknown conversation', () => {
    const mgr = freshManager();
    const p = mgr.createProject('/data/p');
    expect(() => mgr.moveConversation('nope', p.id)).not.toThrow();
  });
});

describe('ConversationManager — persistence', () => {
  it('should save and reload data', () => {
    const mgr1 = freshManager();
    const p = mgr1.createProject('/data/my-proj');
    mgr1.create(p.id);
    mgr1.create(p.id);

    const mgr2 = new ConversationManager(dbPath);
    expect(mgr2.getProjects()).toHaveLength(1);
    expect(mgr2.getProjects()[0].folderPath).toBe('/data/my-proj');
    expect(mgr2.getAll()).toHaveLength(2);
  });

  it('should handle non-existent file on load', () => {
    const nonExistent = path.join(tmpDir, 'no-such-file.json');
    const mgr = new ConversationManager(nonExistent);
    expect(mgr.getProjects()).toEqual([]);
    expect(mgr.getAll()).toEqual([]);
  });

  it('should handle corrupt JSON gracefully', () => {
    fs.writeFileSync(dbPath, 'not valid json {{{');
    const mgr = new ConversationManager(dbPath);
    expect(mgr.getProjects()).toEqual([]);
    expect(mgr.getAll()).toEqual([]);
  });

  it('should create parent directories if they do not exist', () => {
    const deepPath = path.join(tmpDir, 'deeply', 'nested', 'conversations.json');
    const mgr = new ConversationManager(deepPath);
    mgr.createProject('/data/p');
    expect(fs.existsSync(deepPath)).toBe(true);
    // cleanup
    fs.rmSync(path.join(tmpDir, 'deeply'), { recursive: true, force: true });
  });
});
