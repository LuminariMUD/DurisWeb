import { describe, expect, it, jest } from '@jest/globals';

import { HookToggleError, type HookStatusRow } from '../../hooks/hookSettingsService.js';
import { requireHook } from '../../hooks/registry.js';
import {
  reconcileHookWithDependencies,
  type ReconcileDependencies,
} from '../hookReconcileService.js';

function status(
  id: string,
  webEnabled: boolean,
  mudState: HookStatusRow['mudState'],
): HookStatusRow {
  const hook = requireHook(id);
  const active = webEnabled && (mudState === 'enabled' || mudState === 'not_gated');
  return {
    hook,
    webEnabled,
    mudState,
    webProvenance: { actor: null, changedAt: null },
    lastActivityAt: null,
    resource: null,
    effective: active ? 'on' : webEnabled && mudState === 'disabled' ? 'mismatch' : 'off',
    active,
    reason: 'test state',
  };
}

function dependencies(overrides: Partial<ReconcileDependencies> = {}): ReconcileDependencies {
  return {
    getStatus: jest.fn(async () => status('auction_new', true, 'enabled')),
    setEnabled: jest.fn(async (id: string, enabled: boolean, _actor: string) =>
      status(id, enabled, 'not_gated'),
    ),
    sendMudCommand: jest.fn(async (_command: string, _data: any) => ({ success: true })),
    now: jest.fn(() => 0),
    sleep: jest.fn(async () => undefined),
    observationTimeoutMs: 100,
    ...overrides,
  };
}

describe('hook reconciliation ordering', () => {
  it('disables the website before asking the MUD to disable', async () => {
    const events: string[] = [];
    let reads = 0;
    const deps = dependencies({
      getStatus: jest.fn(async () =>
        reads++ === 0
          ? status('auction_new', true, 'enabled')
          : status('auction_new', false, 'disabled'),
      ),
      setEnabled: jest.fn(async (id: string, enabled: boolean, _actor: string) => {
        events.push(`web:${enabled}`);
        return status(id, enabled, 'enabled');
      }),
      sendMudCommand: jest.fn(async (_command: string, data: any) => {
        events.push(`mud:${String(data.enabled)}`);
        return { success: true };
      }),
    });

    const result = await reconcileHookWithDependencies('auction_new', false, 'Cwial', deps);
    expect(result.complete).toBe(true);
    expect(events).toEqual(['web:false', 'mud:false']);
  });

  it('enables the website only after the MUD reports enabled', async () => {
    const events: string[] = [];
    let reads = 0;
    const deps = dependencies({
      getStatus: jest.fn(async () =>
        reads++ === 0
          ? status('auction_new', true, 'disabled')
          : status('auction_new', false, 'enabled'),
      ),
      setEnabled: jest.fn(async (id: string, enabled: boolean, _actor: string) => {
        events.push(`web:${enabled}`);
        return status(id, enabled, enabled ? 'enabled' : 'disabled');
      }),
      sendMudCommand: jest.fn(async (_command: string, data: any) => {
        events.push(`mud:${String(data.enabled)}`);
        return { success: true };
      }),
    });

    const result = await reconcileHookWithDependencies('auction_new', true, 'Cwial', deps);
    expect(result.complete).toBe(true);
    expect(events).toEqual(['web:false', 'mud:true', 'web:true']);
  });

  it('leaves the website off and reports a warning when the MUD rejects', async () => {
    const deps = dependencies({
      getStatus: jest.fn(async () => status('auction_new', false, 'unknown')),
      sendMudCommand: jest.fn(async () => ({ success: false, error: 'MUD unavailable' })),
    });

    const result = await reconcileHookWithDependencies('auction_new', true, 'Cwial', deps);
    expect(result).toMatchObject({ complete: false, warning: 'MUD unavailable' });
    expect(deps.setEnabled).not.toHaveBeenCalled();
  });

  it('times out observation without enabling the website', async () => {
    let clock = 0;
    const deps = dependencies({
      getStatus: jest.fn(async () => status('auction_new', false, 'unknown')),
      now: jest.fn(() => clock),
      sleep: jest.fn(async (milliseconds: number) => {
        clock += milliseconds;
      }),
      observationTimeoutMs: 1,
    });

    const result = await reconcileHookWithDependencies('auction_new', true, 'Cwial', deps);
    expect(result.complete).toBe(false);
    expect(result.warning).toMatch(/did not report/i);
    expect(deps.setEnabled).not.toHaveBeenCalled();
  });

  it('handles a website-only hook without sending a MUD command', async () => {
    const deps = dependencies();
    const result = await reconcileHookWithDependencies('flag_parsing', false, 'Cwial', deps);
    expect(result.complete).toBe(true);
    expect(deps.setEnabled).toHaveBeenCalledWith('flag_parsing', false, 'Cwial');
    expect(deps.sendMudCommand).not.toHaveBeenCalled();
  });

  it('rejects the terminal recovery path', async () => {
    await expect(
      reconcileHookWithDependencies('terminal', false, 'Cwial', dependencies()),
    ).rejects.toBeInstanceOf(HookToggleError);
  });
});
