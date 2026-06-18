import { Agent } from '@earendil-works/pi-agent-core';
import { getModel } from '@earendil-works/pi-ai';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { createBashTool } from './tools/bash.tool.js';
import { createReadTool } from './tools/read.tool.js';
import { createWriteTool } from './tools/write.tool.js';
import { createEditTool } from './tools/edit.tool.js';

export function createGisbuddyAgent(cwd: string, apiKey: string): Agent {
  return new Agent({
    initialState: {
      systemPrompt: SYSTEM_PROMPT,
      model: getModel('deepseek', 'deepseek-v4-pro'),
      tools: [createBashTool(cwd), createReadTool(cwd), createWriteTool(cwd), createEditTool(cwd)],
    },
    getApiKey: () => apiKey,
  });
}
