import { describe, it, expect, afterEach } from 'vitest';
import { ConversationManager } from '../electron/conversation-manager.js';
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

describe('ConversationManager — Conversation CRUD', () => {
  it('should start with no conversations', () => {
    const mgr = freshManager();
    expect(mgr.getAll()).toEqual([]);
  });

  it('should create a conversation with a folder path', () => {
    const mgr = freshManager();
    const c = mgr.create('/Users/test/my-gis-project');

    expect(c.id).toBeTruthy();
    expect(c.title).toBe('新对话');
    expect(c.folderPath).toBe('/Users/test/my-gis-project');
    expect(c.sessionId).toBe('');
    expect(c.createdAt).toBeGreaterThan(0);
    expect(mgr.getAll()).toHaveLength(1);
  });

  it('should get a conversation by id', () => {
    const mgr = freshManager();
    const c = mgr.create('/data/p');
    const found = mgr.get(c.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('新对话');
    expect(found!.sessionId).toBe('');
  });

  it('should return undefined for unknown conversation id', () => {
    const mgr = freshManager();
    expect(mgr.get('nope')).toBeUndefined();
  });

  it('should rename a conversation', () => {
    const mgr = freshManager();
    const c = mgr.create('/data/p');
    mgr.rename(c.id, 'My New Title');
    expect(mgr.get(c.id)!.title).toBe('My New Title');
  });

  it('should delete a conversation', () => {
    const mgr = freshManager();
    const c1 = mgr.create('/data/p');
    const c2 = mgr.create('/data/p');
    expect(mgr.getAll()).toHaveLength(2);

    mgr.delete(c1.id);
    expect(mgr.getAll()).toHaveLength(1);
    expect(mgr.get(c1.id)).toBeUndefined();
    expect(mgr.get(c2.id)).toBeDefined();
  });

  it('should have sessionId field on new conversation', () => {
    const mgr = freshManager();
    const c = mgr.create('/data/p');
    expect(c.sessionId).toBe('');
  });

  it('should set and get sessionId', () => {
    const mgr = freshManager();
    const c = mgr.create('/data/p');
    mgr.setSessionId(c.id, 'abc-123');
    expect(mgr.get(c.id)!.sessionId).toBe('abc-123');
  });

  it('should return all conversations without legacy messages field', () => {
    const mgr = freshManager();
    mgr.create('/data/p');

    const all = mgr.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).not.toHaveProperty('messages');
    expect(all[0]).not.toHaveProperty('legacyMessages');
    expect(all[0]).toHaveProperty('id');
    expect(all[0]).toHaveProperty('title');
    expect(all[0]).toHaveProperty('folderPath');
    expect(all[0]).toHaveProperty('sessionId');
  });
});

describe('ConversationManager — persistence', () => {
  it('should save and reload data', () => {
    const mgr1 = freshManager();
    mgr1.create('/data/my-proj');
    mgr1.create('/data/another');

    const mgr2 = new ConversationManager(dbPath);
    expect(mgr2.getAll()).toHaveLength(2);
    // create() uses unshift, so /data/another is first after reload
    expect(mgr2.getAll()[0].folderPath).toBe('/data/another');
    expect(mgr2.getAll()[1].folderPath).toBe('/data/my-proj');
  });

  it('should handle non-existent file on load', () => {
    const nonExistent = path.join(tmpDir, 'no-such-file.json');
    const mgr = new ConversationManager(nonExistent);
    expect(mgr.getAll()).toEqual([]);
  });

  it('should handle corrupt JSON gracefully', () => {
    fs.writeFileSync(dbPath, 'not valid json {{{');
    const mgr = new ConversationManager(dbPath);
    expect(mgr.getAll()).toEqual([]);
  });

  it('should create parent directories if they do not exist', () => {
    const deepPath = path.join(tmpDir, 'deeply', 'nested', 'conversations.json');
    const mgr = new ConversationManager(deepPath);
    mgr.create('/data/p');
    expect(fs.existsSync(deepPath)).toBe(true);
    // cleanup
    fs.rmSync(path.join(tmpDir, 'deeply'), { recursive: true, force: true });
  });
});

describe('ConversationManager — legacy migration', () => {
  it('should migrate legacy project/conversation format to flat conversations', () => {
    // Write a legacy-format file with projects + conversations using projectId
    fs.writeFileSync(dbPath, JSON.stringify({
      projects: [{
        id: 'p1',
        title: 'my-project',
        folderPath: '/data/legacy-proj',
        createdAt: 1000,
        updatedAt: 1000,
        archived: false,
      }],
      conversations: [{
        id: 'c1',
        title: 'old chat',
        projectId: 'p1',
        sessionId: '',
        createdAt: 2000,
        updatedAt: 2000,
      }],
    }));

    const mgr = new ConversationManager(dbPath);
    const all = mgr.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('c1');
    expect(all[0].title).toBe('old chat');
    expect(all[0].folderPath).toBe('/data/legacy-proj');
    expect(all[0]).not.toHaveProperty('projectId');
  });

  it('should persist migrated format on load (no projects key in saved file)', () => {
    fs.writeFileSync(dbPath, JSON.stringify({
      projects: [{
        id: 'p1',
        title: 'my-project',
        folderPath: '/data/legacy-proj',
        createdAt: 1000,
        updatedAt: 1000,
        archived: false,
      }],
      conversations: [{
        id: 'c1',
        title: 'old chat',
        projectId: 'p1',
        sessionId: '',
        createdAt: 2000,
        updatedAt: 2000,
      }],
    }));

    new ConversationManager(dbPath); // triggers migration + save

    // Read the raw file — should no longer have a "projects" key
    const raw = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    expect(raw).not.toHaveProperty('projects');
    expect(raw.conversations).toHaveLength(1);
    expect(raw.conversations[0].folderPath).toBe('/data/legacy-proj');
  });
});
