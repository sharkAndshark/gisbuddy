import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolved shell configuration for pi-coding-agent's bash tool.
 *
 * `shell` is the executable to spawn. `args` are the arguments
 * prepended before the user's command string — pi-coding-agent
 * already appends the command as the final argument, so args must
 * end with `-c` for POSIX shells.
 */
export interface ShellConfig {
  shell: string;
  args: string[];
}

/**
 * Check if the given shell path points to a BusyBox binary.
 * BusyBox requires the `sh` applet argument before `-c`:
 *   busybox64.exe sh -c "command"
 * instead of the standard:
 *   bash.exe -c "command"
 */
function isBusyboxShell(shellPath: string): boolean {
  return path.basename(shellPath).toLowerCase().startsWith("busybox");
}

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
  if (process.platform !== "win32") return null;

  // 1. Git Bash in standard locations
  const candidates: string[] = [];
  const programFiles = process.env.ProgramFiles;
  if (programFiles)
    candidates.push(path.join(programFiles, "Git", "bin", "bash.exe"));
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (programFilesX86)
    candidates.push(path.join(programFilesX86, "Git", "bin", "bash.exe"));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 2. bash.exe on PATH (exclude WSL redirect and BusyBox here — we handle those separately)
  try {
    const result = spawnSync("where", ["bash.exe"], {
      encoding: "utf-8",
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout) {
      for (const line of result.stdout.trim().split(/\r?\n/)) {
        const p = line.trim();
        if (!p) continue;
        // Skip the WSL launcher stub (C:\Windows\System32\bash.exe) — it
        // redirects to Microsoft Store when WSL isn't installed.
        if (
          p
            .toLowerCase()
            .startsWith(
              path
                .join(process.env.SystemRoot ?? "C:\\Windows", "System32", "")
                .toLowerCase(),
            )
        )
          continue;
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {
    // ignore
  }

  // 3. Bundled busybox64.exe
  //    In dev: <repo>/build/busybox64.exe
  //    In packaged app: <resources>/busybox64.exe
  const bundledCandidates = [
    path.join(__dirname, "../../build/busybox64.exe"),
    process.resourcesPath
      ? path.join(process.resourcesPath, "busybox64.exe")
      : "",
  ];
  for (const p of bundledCandidates) {
    if (p && fs.existsSync(p)) return p;
  }

  return null;
}

/**
 * Return the shell + args tuple for pi-coding-agent's bash tool.
 *
 * Use this instead of passing shellPath directly when configuring
 * createBashTool — it handles BusyBox (which needs a `sh` applet
 * arg before `-c`) and filters the WSL stub.
 */
export function resolveShellConfig(): ShellConfig | null {
  if (process.platform !== "win32") return null;

  const shellPath = resolveShellPath();
  if (!shellPath) return null;

  // BusyBox needs `sh -c`, not just `-c`
  if (isBusyboxShell(shellPath)) {
    return { shell: shellPath, args: ["sh", "-c"] };
  }

  return { shell: shellPath, args: ["-c"] };
}
