import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { getBundledGdalPath } from '../gdal-path.js';

const execAsync = promisify(exec);

const bashSchema = Type.Object({
  command: Type.String({ description: '要执行的 shell 命令' }),
});

type BashInput = Static<typeof bashSchema>;

interface BashDetails {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function createBashTool(cwd: string): AgentTool<typeof bashSchema, BashDetails> {
  return {
    name: 'bash',
    label: '执行命令',
    description:
      '在工作目录下执行 shell 命令。适合文件操作（ls, cp, mv, rm）、调用 GDAL 工具（gdalinfo, ogrinfo, ogr2ogr, gdal_translate, gdalwarp 等）、运行脚本',
    parameters: bashSchema,
    execute: async (_toolCallId, params: BashInput, signal): Promise<AgentToolResult<BashDetails>> => {
      const gdalPath = getBundledGdalPath();
      const env: NodeJS.ProcessEnv = { ...process.env };
      if (gdalPath) {
        env.PATH = `${gdalPath}${path.delimiter}${env.PATH || ''}`;
      }

      try {
        const { stdout, stderr } = await execAsync(params.command, {
          cwd,
          env,
          timeout: 300000,
          signal,
          maxBuffer: 10 * 1024 * 1024,
        });
        const text = stdout.trim() || stderr.trim();
        return {
          content: [{ type: 'text', text }],
          details: { exitCode: 0, stdout: stdout.trim(), stderr: stderr.trim() },
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; message?: string; killed?: boolean };
        if (signal?.aborted) {
          return {
            content: [{ type: 'text', text: '命令被用户取消' }],
            details: { exitCode: -1, stdout: '', stderr: '命令被用户取消' },
          };
        }
        const stdout = (e.stdout || '').trim();
        const stderr = (e.stderr || e.message || String(err)).trim();
        const output = stderr || stdout || '命令执行失败，无输出';
        const exitCode = (e as { code?: number }).code ?? 1;
        return {
          content: [{ type: 'text', text: `命令执行失败:\n${output}` }],
          details: { exitCode, stdout, stderr },
        };
      }
    },
  };
}
