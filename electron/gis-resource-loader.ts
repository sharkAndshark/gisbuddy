import { createExtensionRuntime, type ResourceLoader } from '@earendil-works/pi-coding-agent';
import { SYSTEM_PROMPT } from './system-prompt.js';

/**
 * Bare ResourceLoader for GISBuddy.
 *
 * Unlike DefaultResourceLoader, this does no filesystem discovery — GISBuddy
 * owns its system prompt and does not (yet) load extensions, skills, prompts,
 * themes, or AGENTS.md files from disk. Keeping the surface explicit avoids
 * surprising pi-side discovery (e.g. picking up ~/.pi/agent/skills).
 */
export function createGisResourceLoader(): ResourceLoader {
  return {
    getExtensions: () => ({
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => SYSTEM_PROMPT,
    getAppendSystemPrompt: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
}
