/**
 * MUD-reported hook state.
 *
 * Holds what the MUD last told us about its own toggles and exposes it as a
 * `MudHookStateProvider` for the resolution engine. Kept separate from
 * `mudAuctionClient.ts` so the state logic can be tested without a socket.
 *
 * The governing rule is that absence is not knowledge. Anything the MUD has not
 * told us is UNKNOWN, which resolution treats as inactive but distinguishable
 * from a deliberate off.
 */

import logger from '../utils/logger.js';
import { getHook, getMudGatedHooks } from './registry.js';
import type { MudHookState, MudHookStateProvider } from './hookSettingsService.js';
import type { HookDefinition } from './types.js';

/** The only frame schema this client understands. */
const SUPPORTED_SCHEMA_VERSION = 1;

/** What the MUD last reported, by hook id. Absent means unknown. */
let reportedState = new Map<string, boolean>();

/** True once a frame has been applied on the current connection. */
let hasReport = false;

interface HookStateEntry {
  enabled?: unknown;
}

interface HookStateFrame {
  type?: unknown;
  schema_version?: unknown;
  hooks?: unknown;
}

/**
 * Validate and apply a `hook_state` frame.
 *
 * Returns false and applies nothing when the frame is malformed or carries an
 * unrecognised schema version. A partially applied frame would leave some hooks
 * fresh and others stale with no way to tell them apart, so validation happens
 * fully before any mutation.
 */
export function applyHookStateFrame(frame: unknown): boolean {
  if (typeof frame !== 'object' || frame === null) {
    logger.warn('[MUD hooks] Ignoring non-object hook_state frame');
    return false;
  }

  const { schema_version: schemaVersion, hooks } = frame as HookStateFrame;

  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    // Refuse rather than guess: a future frame may carry a different shape, and
    // misreading it could mark a disabled hook as enabled.
    logger.warn(
      `[MUD hooks] Ignoring hook_state frame with unsupported schema_version: ${String(schemaVersion)}`,
    );
    return false;
  }

  if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) {
    logger.warn('[MUD hooks] Ignoring hook_state frame with malformed hooks map');
    return false;
  }

  const parsed = new Map<string, boolean>();

  for (const [id, raw] of Object.entries(hooks as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) {
      logger.warn(`[MUD hooks] Ignoring malformed entry for hook: ${id}`);
      return false;
    }

    const { enabled } = raw as HookStateEntry;
    if (typeof enabled !== 'boolean') {
      logger.warn(`[MUD hooks] Ignoring entry with non-boolean enabled for hook: ${id}`);
      return false;
    }

    const hook = getHook(id);
    if (!hook) {
      // The MUD reported a hook this build does not know. Log it - the two
      // repositories have drifted - but do not fail the whole frame over it.
      logger.warn(`[MUD hooks] MUD reported an unregistered hook id: ${id}`);
      continue;
    }

    parsed.set(id, enabled);
  }

  // Replace wholesale. A hook omitted from the frame becomes unknown rather
  // than retaining its previous value: the MUD no longer reporting a hook is
  // information, not a reason to keep trusting a stale reading.
  reportedState = parsed;
  hasReport = true;
  return true;
}

/**
 * Forget everything the MUD told us.
 *
 * Called when the bridge drops. Retaining state across a disconnect would let
 * the console show a hook as ON that the MUD may have disabled while we were
 * away - precisely the silent disagreement this phase exists to remove.
 */
export function clearMudHookState(): void {
  reportedState = new Map();
  hasReport = false;
}

/** Whether a report has been received on the current connection. */
export function hasMudReport(): boolean {
  return hasReport;
}

/** Read-only view, for diagnostics and tests. */
export function peekMudHookState(): ReadonlyMap<string, boolean> {
  return reportedState;
}

function stateFor(hook: HookDefinition): MudHookState {
  // A hook with no MUD-side gate is never "unknown" - there is nothing on the
  // MUD to know. Reporting unknown here would permanently deactivate the five
  // website-side hooks.
  if (hook.mudPropertyKey === null) {
    return 'not_gated';
  }

  if (!hasReport) {
    return 'unknown';
  }

  const reported = reportedState.get(hook.id);
  if (reported === undefined) {
    return 'unknown';
  }

  return reported ? 'enabled' : 'disabled';
}

export const mudHookStateProvider: MudHookStateProvider = {
  getState: stateFor,
};

/** The frame the MUD expects in order to report its state. */
export function buildHookStateRequest(): string {
  return JSON.stringify({ type: 'cmd', cmd: 'durisweb_hook_state', data: {} });
}

/** Hook ids the MUD is expected to report, for diagnostics. */
export function expectedMudGatedHookIds(): string[] {
  return getMudGatedHooks().map((hook) => hook.id);
}
