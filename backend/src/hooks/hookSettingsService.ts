/**
 * Website-side hook toggle store and effective-state assembly.
 *
 * Toggles live in `web_settings`, reusing the existing cached read path so an
 * event-path check never touches the database. MUD state arrives through an
 * injectable provider, so this module is complete and testable before the
 * bridge exists (Session 04).
 */

import { pool } from '../db/connection.js';
import crypto from 'node:crypto';
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
import { getFlatfileHookHealth, type FlatfileHookHealth } from './flatfileHookState.js';
import { getHookLastActivity } from './hookActivity.js';
import {
  commitHookChange,
  HookToggleError,
  wakeHookAuditWorker,
  type HookChangeReceipt,
} from './hookToggleJournal.js';
export { HookToggleError } from './hookToggleJournal.js';

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
let webProvenanceCache: Map<string, HookProvenance> | null = null;
let cacheGeneration = 0;

export interface HookProvenance {
  readonly actor: string | null;
  readonly changedAt: string | null;
}

interface WebStateSnapshot {
  readonly state: Map<string, boolean>;
  readonly provenance: Map<string, HookProvenance>;
}

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
async function loadWebState(): Promise<WebStateSnapshot> {
  const state = new Map<string, boolean>();
  const provenance = new Map<string, HookProvenance>();

  for (const hook of getToggleableHooks()) {
    state.set(hook.id, true);
    provenance.set(hook.id, { actor: null, changedAt: null });
  }

  try {
    const [rows] = (await pool.query(
      `SELECT setting_key, setting_value, updated_by, UNIX_TIMESTAMP(updated_at) AS updated_at_epoch
       FROM web_settings WHERE setting_key IN (?)`,
      [getToggleableHooks().map((hook) => hook.webSettingKey)],
    )) as [
      Array<{
        setting_key: string;
        setting_value: string;
        updated_by?: unknown;
        updated_at_epoch?: unknown;
      }>,
      unknown,
    ];

    for (const hook of getToggleableHooks()) {
      const row = rows.find((r) => r.setting_key === hook.webSettingKey);
      if (!row) {
        // No row yet - the hook postdates the seed migration. Enabled is the
        // documented default for an absent key, matching the MUD side.
        continue;
      }
      const parsed = parseSettingValue(row.setting_value);
      if (parsed === null) {
        logger.warn(`[hooks] Unparseable value for ${hook.webSettingKey}; treating as enabled`);
        continue;
      }
      state.set(hook.id, parsed);
      provenance.set(hook.id, {
        actor: typeof row.updated_by === 'string' && row.updated_by.trim() ? row.updated_by : null,
        changedAt:
          row.updated_at_epoch === null || !Number.isFinite(Number(row.updated_at_epoch))
            ? null
            : new Date(Number(row.updated_at_epoch) * 1000).toISOString(),
      });
    }
  } catch {
    logger.error('[hooks] Failed to read hook toggles; defaulting all to enabled', {
      reason: 'settings_unavailable',
      reference: crypto.randomUUID(),
    });
  }

  return { state, provenance };
}

export async function refreshHookState(): Promise<void> {
  await populateCache();
}

async function populateCache(): Promise<Map<string, boolean>> {
  for (;;) {
    const generation = cacheGeneration;
    const snapshot = await loadWebState();
    if (generation !== cacheGeneration) continue;
    webStateCache = snapshot.state;
    webProvenanceCache = snapshot.provenance;
    return webStateCache;
  }
}
function invalidateCaches(): void {
  cacheGeneration++;
  webStateCache = null;
  webProvenanceCache = null;
  clearWebSettingsCache();
}

async function ensureLoaded(): Promise<Map<string, boolean>> {
  if (!webStateCache || !webProvenanceCache) {
    return populateCache();
  }
  return webStateCache;
}

/** Synchronous cached view for event paths. Null before the first load. */
export function peekWebState(): ReadonlyMap<string, boolean> | null {
  return webStateCache;
}

export interface HookStatusRow {
  readonly change?: HookChangeReceipt;
  readonly hook: HookDefinition;
  readonly webEnabled: boolean;
  readonly mudState: MudHookState;
  readonly webProvenance: HookProvenance;
  readonly lastActivityAt: string | null;
  readonly resource: FlatfileHookHealth | null;
  readonly effective: EffectiveHookState;
  readonly active: boolean;
  readonly reason: string;
}

function statusFor(hook: HookDefinition, webState: ReadonlyMap<string, boolean>): HookStatusRow {
  const webEnabled = hook.alwaysOn ? true : (webState.get(hook.id) ?? true);
  const resource = getFlatfileHookHealth(hook.id);
  const mudState =
    resource?.availability === 'unavailable' ? 'unavailable' : mudStateProvider.getState(hook);
  const resolved: ResolvedHookState = resolveHookState({
    hook,
    webEnabled,
    mudState,
  });

  return {
    hook,
    webEnabled,
    mudState,
    webProvenance: webProvenanceCache?.get(hook.id) ?? {
      actor: null,
      changedAt: null,
    },
    lastActivityAt: getHookLastActivity(hook.id),
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
  requestId?: string,
): Promise<HookStatusRow> {
  const hook = getHook(id);
  if (!hook) {
    throw new HookToggleError(`Unknown hook id: ${id}`, 'unknown_hook');
  }
  if (hook.alwaysOn || !hook.webSettingKey) {
    throw new HookToggleError(`Hook ${hook.id} is always on and cannot be toggled.`, 'always_on');
  }

  let receipt: HookChangeReceipt;
  try {
    receipt = await commitHookChange(hook, enabled, actor, requestId);
  } catch (error) {
    if (error instanceof HookToggleError && error.acknowledgementUnknown) invalidateCaches();
    throw error;
  }
  invalidateCaches();
  const status = await getHookStatus(hook.id);
  wakeHookAuditWorker();
  return { ...status, change: receipt };
}

export type { EffectiveHookState, MudHookState, HookId };
