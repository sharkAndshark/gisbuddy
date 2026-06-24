import { describe, it, expect, afterEach } from 'vitest';
import { ApiKeyStore } from '../electron/api-key-store.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gisbuddy-apikey-test-'));
const filePath = path.join(tmpDir, 'api-key.json');

afterEach(() => {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
});

describe('ApiKeyStore', () => {
  it('returns null when the file does not exist', () => {
    const store = new ApiKeyStore(filePath);
    expect(store.get()).toBeNull();
  });

  it('saves and reloads the key across instances', () => {
    const store = new ApiKeyStore(filePath);
    store.save('sk-test-123');
    expect(store.get()).toBe('sk-test-123');

    // A fresh instance reads from disk — simulates an app restart.
    const reloaded = new ApiKeyStore(filePath);
    expect(reloaded.get()).toBe('sk-test-123');
  });

  it('creates the parent directory if missing', () => {
    const nested = path.join(tmpDir, 'nested', 'deep', 'api-key.json');
    const store = new ApiKeyStore(nested);
    store.save('sk-nested');
    expect(fs.existsSync(nested)).toBe(true);
    expect(new ApiKeyStore(nested).get()).toBe('sk-nested');
    fs.unlinkSync(nested);
  });

  it('clears the key and removes the file', () => {
    const store = new ApiKeyStore(filePath);
    store.save('sk-clear-me');
    store.clear();
    expect(store.get()).toBeNull();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('degrades to null on corrupt JSON', () => {
    fs.writeFileSync(filePath, '{ not valid json');
    const store = new ApiKeyStore(filePath);
    expect(store.get()).toBeNull();
  });

  it('ignores a non-string / empty apiKey field', () => {
    fs.writeFileSync(filePath, JSON.stringify({ apiKey: '' }));
    expect(new ApiKeyStore(filePath).get()).toBeNull();
    fs.writeFileSync(filePath, JSON.stringify({ apiKey: 123 }));
    expect(new ApiKeyStore(filePath).get()).toBeNull();
  });
});
