import { createBashTool } from '../tools/bash.tool.js';
import { createReadTool } from '../tools/read.tool.js';
import { createWriteTool } from '../tools/write.tool.js';
import { createEditTool } from '../tools/edit.tool.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolExecutor = { execute: (toolCallId: string, params: any, signal?: AbortSignal) => Promise<any> };

export interface ToolExecResult {
  success: boolean;
  value?: unknown;
  error?: string;
}

// Build the tool registry for a given cwd. Extracted so the dispatch
// logic can be tested without Electron's ipcMain.
export function getToolFactory(cwd: string): Record<string, ToolExecutor> {
  const bash: any = createBashTool(cwd);
  const read: any = createReadTool(cwd);
  const write: any = createWriteTool(cwd);
  const edit: any = createEditTool(cwd);
  return { bash, read, write, edit };
}

// Dispatch a tool call by name. Behavior reference: B34-B43.
export async function toolExecHandler(
  toolName: string,
  params: unknown,
  cwd: string,
): Promise<ToolExecResult> {
  try {
    const tools = getToolFactory(cwd);
    const tool = tools[toolName];
    if (!tool) return { success: false, error: 'Unknown tool: ' + toolName };
    const result = await tool.execute(toolName, params);
    return { success: true, value: result };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
