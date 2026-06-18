import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

const writeSchema = Type.Object({
  path: Type.String({ description: '相对于工作目录的文件路径' }),
  content: Type.String({ description: '文件内容' }),
});

type WriteInput = Static<typeof writeSchema>;

interface WriteDetails {
  filePath: string;
  byteLength: number;
}

export function createWriteTool(cwd: string): AgentTool<typeof writeSchema, WriteDetails> {
  return {
    name: 'write',
    label: '写入文件',
    description: '创建或覆盖写入文件',
    parameters: writeSchema,
    execute: async (_toolCallId, params: WriteInput): Promise<AgentToolResult<WriteDetails>> => {
      const filePath = path.resolve(cwd, params.path);
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, params.content, 'utf-8');
        const size = Buffer.byteLength(params.content, 'utf-8');
        return {
          content: [{ type: 'text', text: `已写入 ${params.path} (${size} bytes)` }],
          details: { filePath, byteLength: size },
        };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return {
          content: [{ type: 'text', text: `写入失败: ${e.message || String(err)}` }],
          details: { filePath, byteLength: 0 },
        };
      }
    },
  };
}
