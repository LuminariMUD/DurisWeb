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

export type {
  EffectiveHookState,
  MudHookState,
  ResolvedHookState,
  HookStateInputs,
} from './hookResolution.js';

export { resolveHookState, isHookActive } from './hookResolution.js';

export type { MudHookStateProvider, HookStatusRow } from './hookSettingsService.js';

export {
  getHookStatus,
  getHookStatuses,
  peekWebState,
  refreshHookState,
  resetMudHookStateProvider,
  setHookEnabled,
  setMudHookStateProvider,
  HookToggleError,
} from './hookSettingsService.js';

export { isHookEnabledSync, withHookGate } from './hookGate.js';
