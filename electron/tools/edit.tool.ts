import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

const editSchema = Type.Object({
  path: Type.String({ description: '相对于工作目录的文件路径' }),
  oldString: Type.String({ description: '要被替换的原文' }),
  newString: Type.String({ description: '替换后的新文本' }),
});

type EditInput = Static<typeof editSchema>;

interface EditDetails {
  filePath: string;
  found: boolean;
}

export function createEditTool(cwd: string): AgentTool<typeof editSchema, EditDetails> {
  return {
    name: 'edit',
    label: '编辑文件',
    description: '替换文件中的指定文本。适用于修改配置文件、少量数据调整',
    parameters: editSchema,
    execute: async (_toolCallId, params: EditInput): Promise<AgentToolResult<EditDetails>> => {
      const filePath = path.resolve(cwd, params.path);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(params.oldString)) {
          return {
            content: [
              {
                type: 'text',
                text: `未找到匹配文本，无法替换:\n"${params.oldString.slice(0, 200)}"`,
              },
            ],
            details: { filePath, found: false },
          };
        }
        const updated = content.replace(params.oldString, params.newString);
        fs.writeFileSync(filePath, updated, 'utf-8');
        return {
          content: [{ type: 'text', text: `已替换 ${params.path} 中的文本` }],
          details: { filePath, found: true },
        };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return {
          content: [{ type: 'text', text: `编辑失败: ${e.message || String(err)}` }],
          details: { filePath, found: false },
        };
      }
    },
  };
}
