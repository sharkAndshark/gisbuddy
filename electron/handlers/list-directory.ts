import * as path from 'path';
import * as fs from 'fs';

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  ext: string;
}

// Extracted from electron/main.ts list-directory IPC handler so it can be unit-tested.
// Behavior reference: behaviors.md B56-B59.
export function listDirectoryHandler(dirPath: string): DirEntry[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.filter(e => !e.name.startsWith('.'))
    .map(e => {
      const fullPath = path.join(dirPath, e.name);
      return {
        name: e.name,
        path: fullPath,
        isDirectory: e.isDirectory(),
        size: e.isFile() ? fs.statSync(fullPath).size : 0,
        ext: e.isFile() ? path.extname(e.name).toLowerCase() : '',
      };
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
