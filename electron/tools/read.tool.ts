import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

const readSchema = Type.Object({
  path: Type.String({ description: '相对于工作目录的文件路径' }),
});

type ReadInput = Static<typeof readSchema>;

interface ReadDetails {
  filePath: string;
  byteLength: number;
}

export function createReadTool(cwd: string): AgentTool<typeof readSchema, ReadDetails> {
  return {
    name: 'read',
    label: '读取文件',
    description: '读取文件内容。适用于文本文件、GeoJSON、XML、JSON、CSV 等',
    parameters: readSchema,
    execute: async (_toolCallId, params: ReadInput): Promise<AgentToolResult<ReadDetails>> => {
      const filePath = path.resolve(cwd, params.path);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return {
          content: [{ type: 'text', text: content }],
          details: { filePath, byteLength: Buffer.byteLength(content, 'utf-8') },
        };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return {
          content: [{ type: 'text', text: `读取失败: ${e.message || String(err)}` }],
          details: { filePath, byteLength: 0 },
        };
      }
    },
  };
}
