import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

// ── File-backed logger ──
// Writes timestamped lines to userData/gisbuddy.log so debugging can happen
// without a human copying console output. The file is rotated once per session
// (truncated on startup) to keep it small.

let logStream: fs.WriteStream | null = null;
const LOG_FILE = path.join(app.getPath('userData'), 'gisbuddy.log');

function ensureStream(): fs.WriteStream {
  if (logStream) return logStream;
  // Truncate on startup so each run starts fresh.
  try { fs.truncateSync(LOG_FILE, 0); } catch { /* file may not exist yet */ }
  logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  return logStream;
}

function fmt(level: string, scope: string, msg: string, extra?: unknown): string {
  const ts = new Date().toISOString();
  let line = `[${ts}] [${level}] [${scope}] ${msg}`;
  if (extra !== undefined) {
    try {
      line += ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra));
    } catch {
      line += ' [unserializable]';
    }
  }
  return line;
}

export function logInfo(scope: string, msg: string, extra?: unknown): void {
  const line = fmt('INFO', scope, msg, extra);
  console.log(line);
  try { ensureStream().write(line + '\n'); } catch { /* ignore */ }
}

export function logError(scope: string, msg: string, extra?: unknown): void {
  const line = fmt('ERROR', scope, msg, extra);
  console.error(line);
  try { ensureStream().write(line + '\n'); } catch { /* ignore */ }
}

export function getLogPath(): string {
  return LOG_FILE;
}
