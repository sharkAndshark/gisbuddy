// Pure helpers extracted from src/renderer.ts so they can be unit-tested
// without DOM/IPC/IndexedDB/Agent dependencies.
// Behavior reference: B66 (sessionId generation), B68 (auto-title),
// file tree helpers (formatFileSize, parentDir).

// Generates a unique session ID for IndexedDB persistence.
// Format: <base36 timestamp>_<6-char random suffix>
export function generateSessionId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Computes the auto-title for a conversation based on the first assistant
// message's first text block. Returns null if no title can be derived.
// The caller is responsible for persisting the title via IPC.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeAutoTitle(messages: any[]): string | null {
  const firstReply = messages.find((m) => m.role === 'assistant');
  if (!firstReply) return null;
  const textBlock = firstReply.content?.find((b: { type: string }) => b.type === 'text');
  if (!textBlock?.text) return null;
  const title = textBlock.text.slice(0, 30);
  return title || null;
}

// Formats a byte count as a human-readable string.
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Returns the parent directory path of a file path (POSIX-style).
export function parentDir(filePath: string): string {
  const i = filePath.lastIndexOf('/');
  return i > 0 ? filePath.slice(0, i) : '/';
}
