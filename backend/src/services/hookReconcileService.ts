/** Coordinate an explicit set-both-ends operation without ever failing open. */

import {
  getHookStatus,
  setHookEnabled,
  HookToggleError,
  type HookStatusRow,
} from '../hooks/hookSettingsService.js';
import { getHook } from '../hooks/registry.js';

const OBSERVATION_TIMEOUT_MS = 9_000;
const OBSERVATION_INTERVAL_MS = 50;

export interface ReconcileDependencies {
  readonly getStatus: typeof getHookStatus;
  readonly setEnabled: typeof setHookEnabled;
  readonly sendMudCommand: (
    command: string,
    data: unknown,
  ) => Promise<{ success: boolean; error?: string }>;
  readonly now: () => number;
  readonly sleep: (milliseconds: number) => Promise<void>;
  readonly observationTimeoutMs: number;
}

const defaultDependencies: ReconcileDependencies = {
  getStatus: getHookStatus,
  setEnabled: setHookEnabled,
  sendMudCommand: async (command, data) => {
    // Keep the bridge client lazy: importing it opens Redis and starts transport
    // services, which a pure reconciliation unit test must never do.
    const { sendMudCommandAsync } = await import('./mudAuctionClient.js');
    return sendMudCommandAsync(command, data);
  },
  now: Date.now,
  sleep: (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  observationTimeoutMs: OBSERVATION_TIMEOUT_MS,
};

export interface HookReconcileResult {
  readonly complete: boolean;
  readonly hook: HookStatusRow;
  readonly warning: string | null;
}

async function waitForMudState(
  id: string,
  enabled: boolean,
  dependencies: ReconcileDependencies,
): Promise<HookStatusRow | null> {
  const deadline = dependencies.now() + dependencies.observationTimeoutMs;
  do {
    const status = await dependencies.getStatus(id);
    if (status.mudState === (enabled ? 'enabled' : 'disabled')) return status;
    await dependencies.sleep(OBSERVATION_INTERVAL_MS);
  } while (dependencies.now() < deadline);
  return null;
}

export async function reconcileHook(
  id: string,
  enabled: boolean,
  actor: string,
): Promise<HookReconcileResult> {
  return reconcileHookWithDependencies(id, enabled, actor, defaultDependencies);
}

export async function reconcileHookWithDependencies(
  id: string,
  enabled: boolean,
  actor: string,
  dependencies: ReconcileDependencies,
): Promise<HookReconcileResult> {
  const hook = getHook(id);
  if (!hook) throw new HookToggleError(`Unknown hook id: ${id}`, 'unknown_hook');
  if (hook.alwaysOn || !hook.webSettingKey) {
    throw new HookToggleError(`Hook ${hook.id} is always on and cannot be toggled.`, 'always_on');
  }

  if (hook.mudPropertyKey === null) {
    return {
      complete: true,
      hook: await dependencies.setEnabled(hook.id, enabled, actor),
      warning: null,
    };
  }

  // Website-off is the safety latch in both directions. For enable this also
  // prevents a late MUD ack from opening delivery after the request times out.
  const current = await dependencies.getStatus(hook.id);
  if (current.webEnabled) {
    await dependencies.setEnabled(hook.id, false, actor);
  }

  const result = await dependencies.sendMudCommand('durisweb_hook_set', {
    hook: hook.id,
    enabled,
    actor,
  });
  if (!result.success) {
    return {
      complete: false,
      hook: await dependencies.getStatus(hook.id),
      warning: result.error || 'The MUD did not acknowledge the hook change.',
    };
  }

  const observed = await waitForMudState(hook.id, enabled, dependencies);
  if (!observed) {
    return {
      complete: false,
      hook: await dependencies.getStatus(hook.id),
      warning: 'The MUD acknowledged the change but did not report the requested state.',
    };
  }

  if (!enabled) {
    return { complete: true, hook: observed, warning: null };
  }

  return {
    complete: true,
    hook: await dependencies.setEnabled(hook.id, true, actor),
    warning: null,
  };
}
