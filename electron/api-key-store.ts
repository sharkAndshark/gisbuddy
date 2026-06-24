import * as path from 'path';
import * as fs from 'fs';

// Persists the DeepSeek API key to userData so the user isn't re-prompted
// on every launch. The on-disk shape is `{ "apiKey": "sk-..." }`.
//
// Env var `GISBUDDY_API_KEY` (read in main.ts) takes precedence over disk —
// that's how CI / e2e fixtures inject a key without touching the filesystem.
export class ApiKeyStore {
  private key: string | null = null;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw) as { apiKey?: string };
        this.key = typeof parsed.apiKey === 'string' && parsed.apiKey ? parsed.apiKey : null;
      }
    } catch (err) {
      console.warn('[ApiKeyStore] failed to load, starting without persisted key:', err);
      this.key = null;
    }
  }

  save(key: string) {
    this.key = key;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify({ apiKey: key }, null, 2));
  }

  clear() {
    this.key = null;
    try {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
    } catch {
      // ignore — best effort
    }
  }

  get(): string | null {
    return this.key;
  }
}
