import OpenAI from 'openai';
import { execSync, ExecSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type AgentEvent =
  | { type: 'status'; data: string }
  | { type: 'thinking'; data: string }
  | { type: 'text_delta'; data: string }
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
      let fullContent = '';
      let fullReasoning = '';

      let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
      try {
        const resp = await this.client.chat.completions.create({
          model: 'deepseek-v4-pro',
          messages: apiMessages,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          stream: true,
          ...({ thinking: { type: 'enabled' } } as any),
        }) as any;
        stream = resp as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
      } catch (err: unknown) {
        const error = err as { message?: string };
        onEvent({ type: 'error', data: `调用 AI 服务失败: ${error.message || String(err)}` });
        return '';
      }

      const toolCallAccum: Map<number, {
        id: string;
        index: number;
        function: { name: string; arguments: string };
      }> = new Map();

      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta as any;
        const reasoning = delta?.reasoning_content as string | undefined;

        if (reasoning) {
          fullReasoning += reasoning;
          onEvent({ type: 'thinking', data: reasoning });
        }

        if (delta?.content) {
          fullContent += delta.content;
          onEvent({ type: 'text_delta', data: delta.content });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCallAccum.has(idx)) {
              toolCallAccum.set(idx, { id: '', index: idx, function: { name: '', arguments: '' } });
            }
            const acc = toolCallAccum.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.function.name = tc.function.name;
            if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
          }
        }

        const finish = chunk.choices[0]?.finish_reason;
        if (finish) {
          finishReason = finish;
        }
      }

      if (finishReason === 'tool_calls') {
        const toolCalls = Array.from(toolCallAccum.values()).sort((a, b) => a.index - b.index);

        apiMessages.push({
          role: 'assistant',
          content: fullContent || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        });

        for (const tc of toolCalls) {
          let parsedArgs: Record<string, unknown>;
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch {
            parsedArgs = {};
          }

          onEvent({
            type: 'tool_start',
            data: { name: tc.function.name, args: parsedArgs },
          });

          const result = executeTool(tc.function.name, parsedArgs, cwd);

          onEvent({
            type: 'tool_result',
            data: {
              name: tc.function.name,
              success: result.success,
              output: result.success ? result.stdout : `错误: ${result.stderr}`,
            },
          });

          apiMessages.push({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: result.success
              ? result.stdout
              : `执行失败:\nSTDERR: ${result.stderr}\nSTDOUT: ${result.stdout}`,
          });

          messages.push({
            role: 'assistant' as const,
            content: null,
            tool_calls: [{
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            }],
          });

          messages.push({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: result.success
              ? `工具执行成功:\n${result.stdout}`
              : `工具执行失败:\n${result.stderr}`,
          });
        }
        continue;
      }

      messages.push({ role: 'assistant' as const, content: fullContent });
      onEvent({ type: 'text', data: fullContent });
      return fullContent;
    }

    onEvent({ type: 'error', data: '工具调用次数过多，请简化指令或检查数据' });
    return '';
  }
}
