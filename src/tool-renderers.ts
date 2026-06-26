// Claude-Code-style tool call renderers for GISBuddy.
//
// Each tool call is rendered as a box-drawing block instead of a card:
//
//   ⏺ Ran command
//     │ $ grep -n "..." ...
//     │ 73: class="..."
//     └ Exited with code 0
//
// Only typography + hairline characters: a status dot, a title, a vertical
// rule prefixing each content line, and a closing corner with a summary.
// No filled color blocks, no rounded corners, no shadows — print aesthetic.
//
// Registered via pi-web-ui's `registerToolRenderer`, returning isCustom:true
// so `tool-message` does not wrap the output in its default card frame.

import type { ToolResultMessage } from '@earendil-works/pi-ai';
import { html, type TemplateResult } from 'lit';
import { registerToolRenderer, type ToolRenderer, type ToolRenderResult } from '@earendil-works/pi-web-ui';

// ── Palette ──────────────────────────────────────────────────────────────
// Aligned with the warm paper theme in index.html. Status dots and the
// closing rule pick up these colors; everything else is foreground/muted.
const COLOR_OK = '#6b7d5e';      // sage green — success
const COLOR_ERR = '#b15a5a';     // muted brick — error
const COLOR_PENDING = '#a08a4e'; // ochre — in progress
const COLOR_RULE = '#c4bca8';    // hairline — vertical/closing rules
const COLOR_MUTED = '#8a8270';   // secondary text
const COLOR_FG = '#5a544a';      // primary text

// ── Helpers ──────────────────────────────────────────────────────────────

type ToolState = 'inprogress' | 'complete' | 'error';

function stateOf(result: ToolResultMessage | undefined, isStreaming?: boolean): ToolState {
  if (result) return result.isError ? 'error' : 'complete';
  return isStreaming ? 'inprogress' : 'complete';
}

function dotColor(state: ToolState): string {
  return state === 'error' ? COLOR_ERR : state === 'inprogress' ? COLOR_PENDING : COLOR_OK;
}

/** Split a string into lines, dropping a trailing empty line. */
function lines(s: string): string[] {
  if (!s) return [];
  const arr = s.split('\n');
  if (arr.length > 1 && arr[arr.length - 1] === '') arr.pop();
  return arr;
}

/** Extract the text content from a tool result message. */
function resultText(result: ToolResultMessage | undefined): string {
  if (!result?.content) return '';
  return result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

// ── Layout primitive ─────────────────────────────────────────────────────
// Builds the box-drawing block. `title` is the past-tense action; `bodyLines`
// are the content rows (each prefixed with `│`); `footer` is the closing
// `└` summary (omit while in progress). The block is monospace so the box
// characters align vertically.

function block(
  state: ToolState,
  title: string,
  bodyLines: string[],
  footer: string | null,
): TemplateResult {
  const dot = dotColor(state);
  const dotChar = state === 'inprogress' ? '◯' : '⏺';
  const dotStyle = state === 'inprogress'
    ? `color:${dot};animation:gisbuddy-dot-pulse 1.2s ease-in-out infinite;`
    : `color:${dot};`;

  return html`
    <div class="gisbuddy-tool-block" style="font-family:var(--font-mono);font-size:12px;line-height:1.55;color:${COLOR_FG};margin:2px 0;">
      <div style="display:flex;align-items:baseline;gap:6px;">
        <span style="${dotStyle}">${dotChar}</span>
        <span style="font-weight:600;">${title}</span>
      </div>
      ${bodyLines.length > 0
        ? html`<div class="gisbuddy-tool-body">
            ${bodyLines.map((l) => html`<div style="white-space:pre-wrap;word-break:break-word;"><span style="color:${COLOR_RULE};">  │ </span><span>${l}</span></div>`)}
          </div>`
        : null}
      ${footer
        ? html`<div style="white-space:pre-wrap;word-break:break-word;"><span style="color:${state === 'error' ? COLOR_ERR : COLOR_RULE};">  └ </span><span style="color:${state === 'error' ? COLOR_ERR : COLOR_MUTED};">${footer}</span></div>`
        : null}
    </div>
  `;
}

// ── Per-tool renderers ───────────────────────────────────────────────────

interface BashParams { command: string; timeout?: number }
class BashToolRenderer implements ToolRenderer<BashParams> {
  render(params: BashParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const state = stateOf(result, isStreaming);
    const title = 'Ran command';
    const body: string[] = [];
    if (params?.command) body.push(`$ ${params.command}`);
    const out = resultText(result);
    if (out) body.push(...lines(out));

    let footer: string | null = null;
    if (state === 'complete') footer = 'Done';
    else if (state === 'error') footer = `Failed: ${out.split('\n')[0] || 'error'}`;

    return { content: block(state, title, body, footer), isCustom: true };
  }
}

interface ReadParams { path: string; offset?: number; limit?: number }
class ReadToolRenderer implements ToolRenderer<ReadParams> {
  render(params: ReadParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const state = stateOf(result, isStreaming);
    const title = 'Read file';
    const body: string[] = [];
    if (params?.path) body.push(params.path);
    const out = resultText(result);
    if (out) body.push(...lines(out));

    let footer: string | null = null;
    if (state === 'complete') {
      const n = out ? lines(out).length : 0;
      footer = n > 0 ? `${n} lines` : 'Done';
    } else if (state === 'error') {
      footer = `Failed: ${out.split('\n')[0] || 'error'}`;
    }

    return { content: block(state, title, body, footer), isCustom: true };
  }
}

interface EditParams { path: string; edits: Array<{ oldText: string; newText: string }> }
class EditToolRenderer implements ToolRenderer<EditParams> {
  render(params: EditParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const state = stateOf(result, isStreaming);
    const title = 'Edited file';
    const body: string[] = [];
    if (params?.path) body.push(params.path);
    if (params?.edits?.length) body.push(`${params.edits.length} edit(s)`);
    const out = resultText(result);
    // The edit tool returns a diff in `details`; the text content is a summary.
    // Show the diff if present, otherwise the text output.
    const diff = (result as { details?: { diff?: string } })?.details?.diff;
    if (diff) body.push(...lines(diff));
    else if (out) body.push(...lines(out));

    let footer: string | null = null;
    if (state === 'complete') footer = `Applied ${params?.edits?.length ?? 0} edit(s)`;
    else if (state === 'error') footer = `Failed: ${out.split('\n')[0] || 'error'}`;

    return { content: block(state, title, body, footer), isCustom: true };
  }
}

interface WriteParams { path: string; content: string }
class WriteToolRenderer implements ToolRenderer<WriteParams> {
  render(params: WriteParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const state = stateOf(result, isStreaming);
    const title = 'Wrote file';
    const body: string[] = [];
    if (params?.path) body.push(params.path);
    const out = resultText(result);
    if (out) body.push(...lines(out));

    let footer: string | null = null;
    if (state === 'complete') {
      const bytes = params?.content?.length ?? 0;
      footer = `${bytes} bytes`;
    } else if (state === 'error') {
      footer = `Failed: ${out.split('\n')[0] || 'error'}`;
    }

    return { content: block(state, title, body, footer), isCustom: true };
  }
}

interface GrepParams { pattern: string; path?: string; glob?: string; ignoreCase?: boolean; literal?: boolean; context?: number; limit?: number }
class GrepToolRenderer implements ToolRenderer<GrepParams> {
  render(params: GrepParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const state = stateOf(result, isStreaming);
    const title = 'Searched';
    const body: string[] = [];
    if (params?.pattern) {
      const flags = params.ignoreCase ? ' -i' : '';
      const where = params.path ? ` ${params.path}` : '';
      body.push(`$ grep${flags} "${params.pattern}"${where}`);
    }
    const out = resultText(result);
    if (out) body.push(...lines(out));

    let footer: string | null = null;
    if (state === 'complete') {
      const n = out ? lines(out).length : 0;
      footer = `${n} match(es)`;
    } else if (state === 'error') {
      footer = `Failed: ${out.split('\n')[0] || 'error'}`;
    }

    return { content: block(state, title, body, footer), isCustom: true };
  }
}

interface FindParams { pattern: string; path?: string; limit?: number }
class FindToolRenderer implements ToolRenderer<FindParams> {
  render(params: FindParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const state = stateOf(result, isStreaming);
    const title = 'Found files';
    const body: string[] = [];
    if (params?.pattern) {
      const where = params.path ? ` ${params.path}` : '';
      body.push(`$ find "${params.pattern}"${where}`);
    }
    const out = resultText(result);
    if (out) body.push(...lines(out));

    let footer: string | null = null;
    if (state === 'complete') {
      const n = out ? lines(out).length : 0;
      footer = `${n} result(s)`;
    } else if (state === 'error') {
      footer = `Failed: ${out.split('\n')[0] || 'error'}`;
    }

    return { content: block(state, title, body, footer), isCustom: true };
  }
}

interface LsParams { path?: string; limit?: number }
class LsToolRenderer implements ToolRenderer<LsParams> {
  render(params: LsParams | undefined, result: ToolResultMessage | undefined, isStreaming?: boolean): ToolRenderResult {
    const state = stateOf(result, isStreaming);
    const title = 'Listed directory';
    const body: string[] = [];
    if (params?.path) body.push(`$ ls ${params.path}`);
    const out = resultText(result);
    if (out) body.push(...lines(out));

    let footer: string | null = null;
    if (state === 'complete') {
      const n = out ? lines(out).length : 0;
      footer = `${n} entries`;
    } else if (state === 'error') {
      footer = `Failed: ${out.split('\n')[0] || 'error'}`;
    }

    return { content: block(state, title, body, footer), isCustom: true };
  }
}

// ── Registration ─────────────────────────────────────────────────────────
// Called once from renderer.ts before chatPanel.setAgent. Overwrites the
// built-in bash renderer and provides renderers for the rest of the coding
// agent's tools. Tools not listed here fall back to pi-web-ui's default
// JSON renderer.

let registered = false;
export function registerGisbuddyToolRenderers(): void {
  if (registered) return;
  registered = true;
  registerToolRenderer('bash', new BashToolRenderer());
  registerToolRenderer('read', new ReadToolRenderer());
  registerToolRenderer('edit', new EditToolRenderer());
  registerToolRenderer('write', new WriteToolRenderer());
  registerToolRenderer('grep', new GrepToolRenderer());
  registerToolRenderer('find', new FindToolRenderer());
  registerToolRenderer('ls', new LsToolRenderer());
}
