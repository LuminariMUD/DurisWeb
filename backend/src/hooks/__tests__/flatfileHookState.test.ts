import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  getFlatfileHookHealth,
  getFlatfileHookHealthSnapshot,
  isFlatfileRecoveryMonitorActive,
  markFlatfileAvailable,
  markFlatfileUnavailable,
  recordDroppedFlatfileInput,
  resetFlatfileHookStateForTests,
  setFlatfileHookClockForTests,
  startFlatfileRecoveryMonitor,
  stopFlatfileRecoveryMonitor,
  type FilesystemHookId,
} from '../flatfileHookState.js';

let now = 0;

beforeEach(() => {
  jest.useFakeTimers();
  resetFlatfileHookStateForTests();
  now = 0;
  setFlatfileHookClockForTests(() => now);
});

afterEach(() => {
  resetFlatfileHookStateForTests();
  jest.useRealTimers();
});

describe('flatfile hook health isolation', () => {
  it('changes only the failed hook', () => {
    markFlatfileUnavailable('connection_log', 'Required comm log is unavailable.');

    expect(getFlatfileHookHealth('connection_log')).toMatchObject({
      availability: 'unavailable',
      consecutiveFailures: 1,
    });
    expect(getFlatfileHookHealth('flag_parsing')).toMatchObject({
      availability: 'available',
      consecutiveFailures: 0,
      retryAt: null,
    });
    expect(getFlatfileHookHealth('zone_builder_parsing')).toMatchObject({
      availability: 'available',
      consecutiveFailures: 0,
      retryAt: null,
    });
    expect(getFlatfileHookHealth('guild_parsing')).toBeNull();
  });

  it('tracks dropped inputs independently', () => {
    expect(recordDroppedFlatfileInput('flag_parsing', 3)).toBe(3);
    expect(recordDroppedFlatfileInput('flag_parsing')).toBe(4);
    expect(getFlatfileHookHealth('connection_log')?.droppedInputs).toBe(0);
    expect(getFlatfileHookHealth('flag_parsing')?.droppedInputs).toBe(4);
  });

  it('returns frozen snapshots that cannot mutate internal state', () => {
    const row = getFlatfileHookHealth('connection_log')!;
    const snapshot = getFlatfileHookHealthSnapshot();

    expect(Object.isFrozen(row)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => {
      (row as { availability: string }).availability = 'unavailable';
    }).toThrow();
    expect(getFlatfileHookHealth('connection_log')?.availability).toBe('available');
  });
});

describe('flatfile retry policy', () => {
  it('backs off exponentially and caps at five minutes', () => {
    for (let failure = 1; failure <= 12; failure += 1) {
      const health = markFlatfileUnavailable('connection_log', 'Required comm log is unavailable.');
      const expectedDelay = Math.min(1_000 * 2 ** (failure - 1), 300_000);
      expect(health.retryAt).toBe(new Date(now + expectedDelay).toISOString());
    }
  });

  it('recovers through one scheduled probe and clears its timer', async () => {
    const probe = jest.fn(async (_hookId: FilesystemHookId) => {
      markFlatfileAvailable('connection_log');
    });
    startFlatfileRecoveryMonitor(probe);
    markFlatfileUnavailable('connection_log', 'Required comm log is unavailable.');

    expect(jest.getTimerCount()).toBe(1);
    now = 1_000;
    await jest.advanceTimersByTimeAsync(1_000);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith('connection_log');
    expect(getFlatfileHookHealth('connection_log')).toMatchObject({
      availability: 'available',
      consecutiveFailures: 0,
      retryAt: null,
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cleans up the recovery lifecycle', () => {
    startFlatfileRecoveryMonitor(async () => undefined);
    markFlatfileUnavailable('zone_builder_parsing', 'Area root is unavailable.');

    expect(isFlatfileRecoveryMonitorActive()).toBe(true);
    expect(jest.getTimerCount()).toBe(1);

    stopFlatfileRecoveryMonitor();
    expect(isFlatfileRecoveryMonitorActive()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('redacts sensitive values from exposed reasons', () => {
    const health = markFlatfileUnavailable(
      'connection_log',
      'token=live-value at /srv/mud/logs from 203.0.113.7\nnext',
    );

    expect(health.reason).toBe('token=[redacted] at [path] from [address] next');
  });
});
