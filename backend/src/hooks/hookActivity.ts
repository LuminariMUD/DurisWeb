/**
 * Process-local activity telemetry for the hook console.
 *
 * This is intentionally a small in-memory observation surface, not an audit
 * log. Callers record only after a hook reaches its accepted delivery or
 * application boundary. Reading status must never update activity.
 */

import { getHook } from './registry.js';
import type { HookId } from './types.js';

const lastActivityByHook = new Map<HookId, string>();

export function recordHookActivity(id: HookId, at: Date = new Date()): void {
  if (!getHook(id) || Number.isNaN(at.getTime())) return;
  lastActivityByHook.set(id, at.toISOString());
}

export function getHookLastActivity(id: string): string | null {
  const hook = getHook(id);
  return hook ? (lastActivityByHook.get(hook.id) ?? null) : null;
}

export function resetHookActivity(): void {
  lastActivityByHook.clear();
}
