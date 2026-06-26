import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the shell executable to use for the agent's bash tool.
 *
 * Resolution order on Windows:
 *   1. Git Bash in standard install locations (Program Files\Git\bin\bash.exe)
 *   2. bash.exe found on PATH (Cygwin, MSYS2, WSL, etc.)
 *   3. Bundled busybox64.exe (ash shell, always available)
 *
 * On macOS / Linux:
 *   1. /bin/bash
 *   2. bash on PATH
 *   3. /bin/sh fallback
 *   (no bundled shell needed — Unix always has one)
 *
 * Returns an absolute path to the shell executable, or null if the platform
 * doesn't need a bundled fallback and the system shell should be used as-is
 * (i.e. let pi-coding-agent's getShellConfig handle it).
 */
export function resolveShellPath(): string | null {
  // On non-Windows, let pi-coding-agent's built-in getShellConfig handle it.
  // It already checks /bin/bash → bash on PATH → /bin/sh, which is sufficient.
  if (process.platform !== 'win32') return null;

  // 1. Git Bash in standard locations
  const candidates: string[] = [];
  const programFiles = process.env.ProgramFiles;
  if (programFiles) candidates.push(path.join(programFiles, 'Git', 'bin', 'bash.exe'));
  const programFilesX86 = process.env['ProgramFiles(x86)'];
  if (programFilesX86) candidates.push(path.join(programFilesX86, 'Git', 'bin', 'bash.exe'));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 2. bash.exe on PATH
  try {
    const result = spawnSync('where', ['bash.exe'], { encoding: 'utf-8', timeout: 5000 });
    if (result.status === 0 && result.stdout) {
      const first = result.stdout.trim().split(/\r?\n/)[0];
      if (first && fs.existsSync(first)) return first;
    }
  } catch {
    // ignore
  }

  // 3. Bundled busybox64.exe
  //    In dev: <repo>/build/busybox64.exe
  //    In packaged app: <resources>/busybox64.exe
  const bundledCandidates = [
    path.join(__dirname, '../../build/busybox64.exe'),
    process.resourcesPath ? path.join(process.resourcesPath, 'busybox64.exe') : '',
  ];
  for (const p of bundledCandidates) {
    if (p && fs.existsSync(p)) return p;
  }

  return null;
}
