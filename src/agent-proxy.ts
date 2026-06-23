import type { Agent, AgentEvent } from '@earendil-works/pi-agent-core';

// Subset of the gisbuddy preload API that the proxy needs.
interface GisbuddyAgentApi {
  agentPrompt: (conversationId: string, payload: string) => Promise<AgentStateSnapshot>;
  agentAbort: (conversationId: string) => Promise<void>;
  agentGetState: (conversationId: string) => Promise<AgentStateSnapshot | null>;
  onAgentEvent: (listener: (conversationId: string, event: AgentEvent) => void) => () => void;
}

export interface AgentStateSnapshot {
  messages: unknown[];
  tools: unknown[];
  model: unknown;
  thinkingLevel: string;
  systemPrompt: string;
  isStreaming: boolean;
  pendingToolCalls: string[];
}

/**
 * Renderer-side stand-in for pi-agent-core's `Agent` class.
 *
 * pi-web-ui's ChatPanel/AgentInterface was designed for a real `Agent` running
 * in the same process. In our new architecture (issue #14), the AgentSession
 * lives in Electron's main process; this proxy reproduces only the surface
 * that AgentInterface actually consumes (see AgentInterface.ts):
 *   - state.{messages, tools, pendingToolCalls, isStreaming, model, thinkingLevel, systemPrompt}
 *   - subscribe(listener) → unsubscribe
 *   - prompt(text) / abort()
 *   - streamFn and getApiKey as defensive placeholders so AgentInterface's
 *     auto-assignment branches (lines ~138, ~146) do not fire
 *
 * State is updated via two channels:
 *   1. `agentPrompt` resolves with a fresh snapshot — we replace array references
 *      so Lit's message-list re-renders (same trick as the old msgListFix).
 *   2. `agent:event` push carries streaming deltas (message_update/agent_end/etc.)
 *      so the UI can paint incrementally without round-trips.
 */
export class AgentProxy {
  readonly conversationId: string;
  state: AgentStateSnapshot & { pendingToolCalls: Set<string> };

  // `streamFn === streamSimple` is what AgentInterface.ts:138 checks before
  // overwriting. Null never equals streamSimple, so the auto-proxy branch is
  // skipped — main owns the LLM call.
  streamFn = null;

  // Truthy stub: AgentInterface.ts:146 only assigns its own getApiKey when this
  // is missing. Keys live in main's AuthStorage, never in renderer.
  getApiKey = async () => 'managed-by-main';

  private listeners = new Set<(event: AgentEvent) => void>();
  private unsubIpc: (() => void) | null = null;

  constructor(conversationId: string, initialState: AgentStateSnapshot) {
    this.conversationId = conversationId;
    this.state = {
      ...initialState,
      pendingToolCalls: new Set(initialState.pendingToolCalls ?? []),
    };
  }

  /** Subscribe to IPC events routed for this conversation. */
  connect(api: GisbuddyAgentApi): void {
    this.unsubIpc = api.onAgentEvent((convId, event) => {
      if (convId !== this.conversationId) return;
      this.dispatch(event, api);
    });
  }

  private dispatch(event: AgentEvent, api: GisbuddyAgentApi) {
    // Approximate isStreaming transitions from events so AgentInterface's
    // streaming container shows/hides correctly between snapshots.
    const t = event.type;
    if (t === 'agent_start' || t === 'turn_start') this.state.isStreaming = true;
    if (t === 'agent_end') this.state.isStreaming = false;

    // After message_end / agent_end, pull a fresh full snapshot so the stable
    // message list (not the streaming container) sees the new message with a
    // new array reference, forcing Lit to re-render. The streaming container
    // is cleared by AgentInterface itself on these events.
    if (t === 'message_end' || t === 'agent_end') {
      void api.agentGetState(this.conversationId).then((snap) => {
        if (!snap) return;
        this.state.messages = snap.messages;
        this.state.tools = snap.tools;
        this.state.model = snap.model ?? this.state.model;
        this.state.thinkingLevel = snap.thinkingLevel ?? this.state.thinkingLevel;
        this.state.isStreaming = snap.isStreaming;
        this.state.pendingToolCalls = new Set(snap.pendingToolCalls ?? []);
        // Re-dispatch a synthetic event so subscribers that already ran get
        // notified that state mutated. Use the original event type for safety.
        for (const l of this.listeners) {
          try { l(event); } catch { /* listener errors are non-fatal */ }
        }
      });
    }

    for (const l of this.listeners) {
      try { l(event); } catch { /* listener errors are non-fatal */ }
    }
  }

  subscribe(listener: (event: AgentEvent) => void | Promise<void>): () => void {
    this.listeners.add(listener as (event: AgentEvent) => void);
    return () => {
      this.listeners.delete(listener as (event: AgentEvent) => void);
    };
  }

  async prompt(payload: string): Promise<void> {
    const api = (window as unknown as { gisbuddy: GisbuddyAgentApi }).gisbuddy;
    const snap = await api.agentPrompt(this.conversationId, payload);
    this.state.messages = snap.messages;
    this.state.tools = snap.tools;
    this.state.model = snap.model ?? this.state.model;
    this.state.thinkingLevel = snap.thinkingLevel ?? this.state.thinkingLevel;
    this.state.isStreaming = snap.isStreaming;
    this.state.pendingToolCalls = new Set(snap.pendingToolCalls ?? []);
  }

  async abort(): Promise<void> {
    const api = (window as unknown as { gisbuddy: GisbuddyAgentApi }).gisbuddy;
    await api.agentAbort(this.conversationId);
  }

  dispose(): void {
    this.unsubIpc?.();
    this.unsubIpc = null;
    this.listeners.clear();
  }

  /** Narrow to the Agent shape expected by pi-web-ui's ChatPanel.setAgent(). */
  asAgent(): Agent {
    return this as unknown as Agent;
  }
}
