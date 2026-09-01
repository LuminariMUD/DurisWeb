/**
 * Public surface of the hook registry.
 *
 * The raw definition array is intentionally not re-exported: callers go through
 * the lookup helpers so the registry stays the single source of hook ids.
 */

export type {
  HookChannel,
  HookDefinition,
  HookDirection,
  HookId,
} from './types.js';

export {
  getAllHooks,
  getHook,
  getHooksByChannel,
  getMudGatedHooks,
  getToggleableHooks,
  isHookId,
  requireHook,
} from './registry.js';
