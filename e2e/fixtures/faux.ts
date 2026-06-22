// E2E helper for building faux responses and forwarding them to main via IPC.
//
// fafaux now lives in the main process (electron/faux.ts), so the renderer
// no longer exposes `window.__faux`. Tests build plain response payloads here
// and ship them through `gisbuddy.fauxSetResponses`, which forwards to main.
// `cloneMessage` in faux.js fills in api/provider/model/timestamp/usage, so
// tests only need to provide role/content/stopReason.

import type { Page } from '@playwright/test';

export function fauxText(text: string) {
  return { type: 'text', text };
}

export function fauxThinking(thinking: string) {
  return { type: 'thinking', thinking };
}

export function fauxToolCall(name: string, args: Record<string, unknown>, id?: string) {
  return {
    type: 'toolCall',
    id: id ?? `tc-${Math.random().toString(36).slice(2, 10)}`,
    name,
    arguments: args,
  };
}

export interface FauxAssistantOptions {
  stopReason?: string;
  errorMessage?: string;
}

export function fauxAssistantMessage(content: unknown[], options: FauxAssistantOptions = {}) {
  return {
    role: 'assistant',
    content,
    stopReason: options.stopReason ?? 'stop',
    errorMessage: options.errorMessage,
  };
}

export async function setFauxResponses(page: Page, responses: unknown[]): Promise<void> {
  await page.evaluate((rs) => (window as unknown as { gisbuddy: { fauxSetResponses: (r: unknown[]) => Promise<void> } }).gisbuddy.fauxSetResponses(rs), responses);
}
