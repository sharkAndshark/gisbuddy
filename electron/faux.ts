// Test-only faux provider wiring for the main process.
//
// pi-ai 0.74.x does not declare './faux' in its package.json exports, so we
// load the file directly via a file URL (same trick the renderer's esbuild
// plugin plays). This module is only imported when GISBUDDY_TEST=1; the file
// path resolves through node_modules in both `npm start` and packaged paths.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

type FauxModule = {
  registerFauxProvider: (opts?: {
    models?: Array<{ id: string; name?: string; contextWindow?: number; maxTokens?: number }>;
    tokensPerSecond?: number;
  }) => FauxRegistration;
};

type FauxRegistration = {
  api: string;
  models: ReadonlyArray<{ id: string; provider: string }>;
  getModel: (id?: string) => { id: string; provider: string; api: string } | undefined;
  setResponses: (responses: unknown[]) => void;
  appendResponses: (responses: unknown[]) => void;
  getPendingResponseCount: () => number;
  unregister: () => void;
};

// Resolve via process.cwd() — faux is only loaded under GISBUDDY_TEST=1, where
// the process is launched from the project root (`npm start`, `vitest`).
const FAUX_RELATIVE = 'node_modules/@earendil-works/pi-ai/dist/providers/faux.js';

let fauxModulePromise: Promise<FauxModule> | null = null;
async function loadFauxModule(): Promise<FauxModule> {
  if (!fauxModulePromise) {
    const file = path.resolve(process.cwd(), FAUX_RELATIVE);
    fauxModulePromise = import(pathToFileURL(file).href) as Promise<FauxModule>;
  }
  return fauxModulePromise;
}

// Model id matches what GISBuddy historically used in the renderer-side faux setup,
// so existing E2E fixtures (which reference `faux-pro` model metadata) keep working.
const FAUX_MODEL_ID = 'faux-pro';

let registration: FauxRegistration | null = null;

export async function ensureFauxRegistered(): Promise<FauxRegistration> {
  if (registration) return registration;
  const mod = await loadFauxModule();
  registration = mod.registerFauxProvider({
    models: [
      { id: FAUX_MODEL_ID, name: 'Faux Pro', contextWindow: 200000, maxTokens: 8192 },
    ],
    tokensPerSecond: 1000,
  });
  return registration;
}

export function getFauxModelId(): string {
  return FAUX_MODEL_ID;
}

// Setter for the IPC handler; renderer pushes response sequences during E2E tests.
export function setFauxResponses(responses: unknown[]): void {
  if (!registration) throw new Error('faux provider not registered (call ensureFauxRegistered first)');
  registration.setResponses(responses);
}
