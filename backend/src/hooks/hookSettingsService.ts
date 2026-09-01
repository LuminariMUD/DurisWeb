/**
 * Website-side hook toggle store and effective-state assembly.
 *
 * Toggles live in `web_settings`, reusing the existing cached read path so an
 * event-path check never touches the database. MUD state arrives through an
 * injectable provider, so this module is complete and testable before the
 * bridge exists (Session 04).
 */

import { pool } from '../db/connection.js';
import logger from '../utils/logger.js';
import { clearWebSettingsCache } from '../services/webSettingsService.js';
import { getHook, getToggleableHooks, requireHook } from './registry.js';
import {
  resolveHookState,
  type EffectiveHookState,
  type MudHookState,
  type ResolvedHookState,
} from './hookResolution.js';
import type { HookDefinition, HookId } from './types.js';
import {
  getFlatfileHookHealth,
  type FlatfileHookHealth,
} from './flatfileHookState.js';

/** Supplies what the MUD currently reports. Session 04 replaces the default. */
export interface MudHookStateProvider {
  getState(hook: HookDefinition): MudHookState;
}

/**
 * Default provider: every MUD-gated hook is UNKNOWN because no bridge is
 * wired yet. Deliberately not "enabled" - claiming knowledge we do not have
 * would let a hook read as ON while the MUD has it off.
 */
const unknownMudStateProvider: MudHookStateProvider = {
  getState(hook) {
    return hook.mudPropertyKey === null ? 'not_gated' : 'unknown';
  },
};

let mudStateProvider: MudHookStateProvider = unknownMudStateProvider;

export function setMudHookStateProvider(provider: MudHookStateProvider): void {
  mudStateProvider = provider;
}

export function resetMudHookStateProvider(): void {
  mudStateProvider = unknownMudStateProvider;
}

/** In-memory view of the website toggles, refreshed on read and on write. */
let webStateCache: Map<string, boolean> | null = null;

function parseSettingValue(raw: unknown): boolean | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return null;
}

/**
 * Load website toggles into memory.
 *
 * A read failure resolves to enabled for every hook. Fail-closed governs a
 * *known* disagreement between the two ends; an unreadable settings table is
 * not knowledge, and defaulting it to disabled would take the entire
 * integration surface down on a transient database error.
 */
async function loadWebState(): Promise<Map<string, boolean>> {
  const state = new Map<string, boolean>();

  for (const hook of getToggleableHooks()) {
    state.set(hook.id, true);
  }

  try {
    const [rows] = (await pool.query(
      'SELECT setting_key, setting_value FROM web_settings WHERE setting_key LIKE ?',
      ['hook_enabled_%'],
    )) as [Array<{ setting_key: string; setting_value: string }>, unknown];

    for (const hook of getToggleableHooks()) {
      const row = rows.find((r) => r.setting_key === hook.webSettingKey);
      if (!row) {
        // No row yet - the hook postdates the seed migration. Enabled is the
        // documented default for an absent key, matching the MUD side.
        continue;
      }
      const parsed = parseSettingValue(row.setting_value);
      if (parsed === null) {
        logger.warn(
          `[hooks] Unparseable value for ${hook.webSettingKey}; treating as enabled`,
        );
        continue;
      }
      state.set(hook.id, parsed);
    }
  } catch (error) {
    logger.error(
      '[hooks] Failed to read hook toggles; defaulting all to enabled',
      error,
    );
  }

  return state;
}

export async function refreshHookState(): Promise<void> {
  webStateCache = await loadWebState();
}

async function ensureLoaded(): Promise<Map<string, boolean>> {
  if (!webStateCache) {
    webStateCache = await loadWebState();
  }
  return webStateCache;
}

/** Synchronous cached view for event paths. Null before the first load. */
export function peekWebState(): ReadonlyMap<string, boolean> | null {
  return webStateCache;
}

export interface HookStatusRow {
  readonly hook: HookDefinition;
  readonly webEnabled: boolean;
  readonly mudState: MudHookState;
  readonly resource: FlatfileHookHealth | null;
  readonly effective: EffectiveHookState;
  readonly active: boolean;
  readonly reason: string;
}

function statusFor(
  hook: HookDefinition,
  webState: ReadonlyMap<string, boolean>,
): HookStatusRow {
  const webEnabled = hook.alwaysOn ? true : webState.get(hook.id) ?? true;
  const resource = getFlatfileHookHealth(hook.id);
  const mudState = resource?.availability === 'unavailable'
    ? 'unavailable'
    : mudStateProvider.getState(hook);
  const resolved: ResolvedHookState = resolveHookState({
    hook,
    webEnabled,
    mudState,
  });

  return {
    hook,
    webEnabled,
    mudState,
    resource,
    effective: resolved.effective,
    active: resolved.active,
    reason: resolved.reason,
  };
}

/** Full status for every registered hook, including the always-on terminal. */
export async function getHookStatuses(): Promise<HookStatusRow[]> {
  const webState = await ensureLoaded();
  const { getAllHooks } = await import('./registry.js');
  return getAllHooks().map((hook) => statusFor(hook, webState));
}

export async function getHookStatus(id: string): Promise<HookStatusRow> {
  const hook = requireHook(id);
  const webState = await ensureLoaded();
  return statusFor(hook, webState);
}

export class HookToggleError extends Error {
  constructor(
    message: string,
    readonly code: 'unknown_hook' | 'always_on',
  ) {
    super(message);
    this.name = 'HookToggleError';
  }
}

/**
 * Set a website toggle, invalidate both caches, and record the change.
 *
 * The cache is cleared before returning, so the change is in effect for the
 * caller's next read rather than after a TTL expiry.
 */
export async function setHookEnabled(
  id: string,
  enabled: boolean,
  actor: string,
): Promise<HookStatusRow> {
  const hook = getHook(id);
  if (!hook) {
    throw new HookToggleError(`Unknown hook id: ${id}`, 'unknown_hook');
  }
  if (hook.alwaysOn || !hook.webSettingKey) {
    throw new HookToggleError(
      `Hook ${hook.id} is always on and cannot be toggled.`,
      'always_on',
    );
  }

  const previous = (await ensureLoaded()).get(hook.id) ?? true;
  const nextValue = enabled ? 'true' : 'false';

  await pool.query(
    `INSERT INTO web_settings (setting_key, setting_value, updated_by, updated_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
                             updated_by = VALUES(updated_by),
                             updated_at = NOW()`,
    [hook.webSettingKey, nextValue, actor],
  );

  // Invalidate before returning so the next read cannot serve a stale value.
  webStateCache = null;
  clearWebSettingsCache();

  // Audit. `action_type` is a fixed ENUM on a table shared with the MUD
  // database, so rather than ALTER it we reuse `property_change` and namespace
  // the target, which keeps hook toggles filterable. No IP is recorded.
  try {
    await pool.query(
      `INSERT INTO admin_action_log (account_name, action_type, target, old_value, new_value, notes)
       VALUES (?, 'property_change', ?, ?, ?, ?)`,
      [
        actor,
        `hook:${hook.id}`,
        previous ? 'enabled' : 'disabled',
        enabled ? 'enabled' : 'disabled',
        `DurisWeb hook toggle (${hook.channel})`,
      ],
    );
  } catch (error) {
    // The toggle already applied; losing its audit row must not be silent.
    logger.error(
      `[hooks] Toggle for ${hook.id} applied but audit log write failed`,
      error,
    );
  }

  return getHookStatus(hook.id);
}

export type { EffectiveHookState, MudHookState, HookId };
