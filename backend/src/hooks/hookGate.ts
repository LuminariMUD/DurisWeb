/**
 * Event-path enforcement.
 *
 * Synchronous by design: an event handler must not await a database read to
 * decide whether to deliver. Callers ensure state is loaded once at startup
 * (and after each toggle) via `refreshHookState`.
 */

import logger from '../utils/logger.js';
import { getHook } from './registry.js';
import { peekWebState } from './hookSettingsService.js';

/**
 * Whether a hook should carry data right now.
 *
 * Returns false for an unregistered id. An unknown hook is a bug, not an open
 * gate, and silently delivering for it would defeat the point of the registry.
 *
 * Before the first state load this returns true for registered, non-always-on
 * hooks: the store's own read failure policy is enabled-by-default, and a
 * not-yet-loaded cache is the same situation - absence of knowledge, not
 * knowledge of a disagreement.
 */
export function isHookEnabledSync(id: string): boolean {
  const hook = getHook(id);

  if (!hook) {
    logger.warn(`[hooks] Gate consulted for unregistered hook id: ${id}`);
    return false;
  }

  if (hook.alwaysOn) {
    return true;
  }

  const state = peekWebState();
  if (!state) {
    return true;
  }

  return state.get(hook.id) ?? true;
}

/**
 * Guard helper for a delivery path. Logs once at debug when it suppresses, so a
 * disabled hook is diagnosable without flooding the log on a busy stream.
 */
export function withHookGate<T>(id: string, deliver: () => T): T | undefined {
  if (!isHookEnabledSync(id)) {
    return undefined;
  }
  return deliver();
}
