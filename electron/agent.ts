import OpenAI from 'openai';
import { execSync, ExecSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type AgentEvent =
  | { type: 'status'; data: string }
  | { type: 'tool_start'; data: { name: string; args: Record<string, unknown> } }
  | { type: 'tool_result'; data: { name: string; success: boolean; output: string } }
  | { type: 'text'; data: string }
  | { type: 'error'; data: string };

type EventCallback = (event: AgentEvent) => void;

const SYSTEM_PROMPT = `你是一个专业的 GIS 数据处理助手，名叫 GISBuddy。
你的工作目录中存放了用户的空间数据文件。工作目录路径由用户在创建对话时指定。

## 环境

系统已安装 GDAL (Geospatial Data Abstraction Library) 工具集，你可以通过 bash 调用：
- gdalinfo — 查看栅格/矢量数据元数据
- ogrinfo — 查看矢量数据图层和属性
- ogr2ogr — 矢量格式转换、重投影、属性/空间过滤
- gdal_translate — 栅格格式转换、裁剪、重采样
- gdalwarp — 栅格重投影、拼接、裁剪
- gdal_calc.py — 栅格计算器
- gdal_merge.py — 栅格拼接
- 以及其他 GDAL 工具

## 工具

1. bash — 执行 shell 命令，包括调用 GDAL 工具和文件操作（ls, cp, mv, rm 等）
2. read — 读取文本文件内容
3. write — 将内容写入文件（覆盖模式）
4. edit — 精确替换文件中的文本段落

## 使用规则

1. 使用中文与用户交流
2. 处理数据前先用 ls / gdalinfo / ogrinfo 探查数据
3. 每次工具调用后向用户解释结果
4. 文件路径使用相对于工作目录的路径
5. 如果命令执行出错，分析错误原因并建议修正`;

const TOOL_DEFINITIONS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'bash',
      description: '在工作目录下执行 shell 命令。适合文件操作（ls, cp, mv, rm）、调用 GDAL 工具（gdalinfo, ogrinfo, ogr2ogr, gdal_translate, gdalwarp 等）、运行脚本',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '要执行的 shell 命令' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read',
      description: '读取文件内容。适用于文本文件、GeoJSON、XML、JSON、CSV 等',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作目录的文件路径' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: '创建或覆盖写入文件',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作目录的文件路径' },
          content: { type: 'string', description: '文件内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: '替换文件中的指定文本。适用于修改配置文件、少量数据调整',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对于工作目录的文件路径' },
          oldString: { type: 'string', description: '要被替换的原文' },
          newString: { type: 'string', description: '替换后的新文本' },
        },
        required: ['path', 'oldString', 'newString'],
      },
    },
  },
];

function getBundledGdalPath(): string | null {
  const candidates = [
    path.join(__dirname, '../../gdal-bin'),
    process.resourcesPath ? path.join(process.resourcesPath, 'gdal-bin') : '',
    path.join(process.cwd(), 'gdal-bin'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function executeTool(name: string, args: Record<string, unknown>, cwd: string) {
  switch (name) {
    case 'bash': {
      const command = args.command as string;
      const gdalPath = getBundledGdalPath();
      const env = { ...process.env };
      if (gdalPath) {
        env.PATH = `${gdalPath}:${env.PATH || ''}`;
      }
      const options: ExecSyncOptions = {
        encoding: 'utf-8' as const,
        timeout: 300000,
        cwd,
        env,
      };
      try {
        const stdout = execSync(command, options).toString().trim();
        return { success: true as const, stdout, stderr: '' };
      } catch (err: unknown) {
        const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
        return {
          success: false as const,
          stdout: (e.stdout || '').toString().trim(),
          stderr: (e.stderr || e.message || String(err)).toString().trim(),
        };
      }
    }

    case 'read': {
      const filePath = path.resolve(cwd, args.path as string);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return { success: true as const, stdout: content, stderr: '' };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return { success: false as const, stdout: '', stderr: `读取失败: ${e.message || String(err)}` };
      }
    }

    case 'write': {
      const filePath = path.resolve(cwd, args.path as string);
      const content = args.content as string;
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        const size = Buffer.byteLength(content, 'utf-8');
        return { success: true as const, stdout: `已写入 ${args.path} (${size} bytes)`, stderr: '' };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return { success: false as const, stdout: '', stderr: `写入失败: ${e.message || String(err)}` };
      }
    }

    case 'edit': {
      const filePath = path.resolve(cwd, args.path as string);
      const oldStr = args.oldString as string;
      const newStr = args.newString as string;
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content.includes(oldStr)) {
          return {
            success: false as const,
            stdout: '',
            stderr: `未找到匹配文本，无法替换:\n"${oldStr.slice(0, 200)}"`,
          };
        }
        const updated = content.replace(oldStr, newStr);
        fs.writeFileSync(filePath, updated, 'utf-8');
        return { success: true as const, stdout: `已替换 ${args.path} 中的文本`, stderr: '' };
      } catch (err: unknown) {
        const e = err as { message?: string };
        return { success: false as const, stdout: '', stderr: `编辑失败: ${e.message || String(err)}` };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export class Agent {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey: apiKey,
    });
  }

  async chat(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    cwd: string,
    onEvent: EventCallback,
  ): Promise<string> {
    const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const maxIterations = 10;
    for (let i = 0; i < maxIterations; i++) {
      onEvent({ type: 'status', data: i === 0 ? '思考中...' : '分析工具执行结果...' });

      let response: OpenAI.Chat.ChatCompletion;
      try {
        response = await this.client.chat.completions.create({
          model: 'deepseek-chat',
          messages: apiMessages,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
        });
      } catch (err: unknown) {
        const error = err as { message?: string };
        onEvent({ type: 'error', data: `调用 AI 服务失败: ${error.message || String(err)}` });
        return '';
      }

      const choice = response.choices[0];
      const msg = choice.message;

      if (choice.finish_reason === 'tool_calls' && msg.tool_calls) {
        apiMessages.push({
          role: 'assistant' as const,
          content: null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: tc.function,
          })),
        });

        for (const toolCall of msg.tool_calls) {
          let parsedArgs: Record<string, unknown>;
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            parsedArgs = {};
          }

          onEvent({
            type: 'tool_start',
            data: { name: toolCall.function.name, args: parsedArgs },
          });

          const result = executeTool(toolCall.function.name, parsedArgs, cwd);

          onEvent({
            type: 'tool_result',
            data: {
              name: toolCall.function.name,
              success: result.success,
              output: result.success ? result.stdout : `错误: ${result.stderr}`,
            },
          });

          apiMessages.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: result.success
              ? result.stdout
              : `执行失败:\nSTDERR: ${result.stderr}\nSTDOUT: ${result.stdout}`,
          });

          messages.push({
            role: 'assistant' as const,
            content: null,
            tool_calls: [{
              id: toolCall.id,
              type: 'function' as const,
              function: toolCall.function,
            }],
          });

          messages.push({
            role: 'tool' as const,
            tool_call_id: toolCall.id,
            content: result.success
              ? `工具执行成功:\n${result.stdout}`
              : `工具执行失败:\n${result.stderr}`,
          });
        }
        continue;
      }

      const content = msg.content || '';
      messages.push({ role: 'assistant' as const, content });
      onEvent({ type: 'text', data: content });
      return content;
    }

    onEvent({ type: 'error', data: '工具调用次数过多，请简化指令或检查数据' });
    return '';
  }
}
