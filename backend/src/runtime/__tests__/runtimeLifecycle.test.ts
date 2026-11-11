import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { stubModule } from '../../test/stubModule.js';

// Records the order in which owned resources are released; every dependency is synthetic.
const events: string[] = [];
const record =
  (name: string) =>
  async (..._args: unknown[]): Promise<void> => {
    events.push(name);
  };
let databaseReachable = false;

const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../../db/connection.js', {
  pool: {},
  mudPool: {},
  checkDatabaseConnection: async () => databaseReachable,
  closeDatabaseConnection: record('database'),
});
stub('../../db/redis.js', { closeRedisConnection: record('redis') });
stub('../../hooks/flatfileHookState.js', {
  startFlatfileRecoveryMonitor: () => events.push('start flatfile monitor'),
  stopFlatfileRecoveryMonitor: () => events.push('flatfile monitor'),
  getFlatfileHookHealthSnapshot: () => [],
});
stub('../../services/flatfileAccess.js', { probeAllFlatfileHooks: async () => undefined });
stub('../../services/logWatchService.js', {
  cleanupLogWatchers: () => events.push('log watchers'),
});
stub('../../services/terminalService.js', { cleanupAllSessions: record('terminals') });
stub('../../services/onlinePlayersService.js', {
  closeOnlinePlayersRedisConnections: record('presence redis'),
});
stub('../../utils/eventLoopWatchdog.js', {
  startEventLoopWatchdog: async () => record('watchdog'),
});
stub('../backgroundJobs.js', {
  startBackgroundJobs: async () => {
    throw new Error('jobs must not start after a failed dependency check');
  },
});

const { createShutdown, exitAfterShutdown, installSignalHandlers } = await import('../shutdown.js');
const { startServer } = await import('../startServer.js');
type Resources = import('../shutdown.js').RuntimeResources;

afterEach(() => {
  events.length = 0;
  databaseReachable = false;
});

describe('runtime shutdown', () => {
  it('releases owned resources once, in order, closing a connected peer before shared clients', async () => {
    const server = createServer();
    const wss = new WebSocketServer({ server });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing listener');
    const peer = new WebSocket(`ws://127.0.0.1:${address.port}`);
    await once(peer, 'open');
    const peerClosed = once(peer, 'close');

    const resources: Resources = {
      stopEventLoopWatchdog: record('watchdog'),
      flatfileRecoveryMonitor: true,
      server,
      wss,
      jobs: { stopProducers: record('producers'), stopWorkers: record('workers') },
    };
    const shutdown = createShutdown(resources);
    await Promise.all([shutdown(), shutdown()]);
    await shutdown();

    expect(events).toEqual([
      'watchdog',
      'producers',
      'log watchers',
      'terminals',
      'workers',
      'flatfile monitor',
      'presence redis',
      'database',
      'redis',
    ]);
    expect(server.listening).toBe(false);
    const [code, reason] = await peerClosed;
    expect([code, String(reason)]).toEqual([1000, 'Server shutting down']);
  });

  it('skips resources a startup never acquired', async () => {
    await createShutdown({})();
    expect(events).toEqual(['log watchers', 'terminals', 'presence redis', 'database', 'redis']);
  });
});

describe('signal handlers', () => {
  it('installs SIGTERM, SIGINT and SIGUSR2 handlers exactly once', () => {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;
    const before = signals.map((signal) => process.listenerCount(signal));
    const handler = jest.fn();
    installSignalHandlers(handler);
    installSignalHandlers(handler);
    expect(signals.map((signal) => process.listenerCount(signal))).toEqual(
      before.map((count) => count + 1),
    );
    for (const signal of signals) process.off(signal, handler);
  });
});

describe('startup failure', () => {
  it('stops before listening and lets shutdown release only what it acquired', async () => {
    const resources: Resources = {};
    await expect(startServer(express(), resources)).rejects.toThrow(
      'WebService database unavailable',
    );
    expect(resources.server).toBeUndefined();
    expect(resources.jobs).toBeUndefined();
    expect(resources.flatfileRecoveryMonitor).toBe(true);

    events.length = 0;
    await createShutdown(resources)();
    expect(events).toEqual([
      'watchdog',
      'log watchers',
      'terminals',
      'flatfile monitor',
      'presence redis',
      'database',
      'redis',
    ]);
  });
});

describe('exit after shutdown', () => {
  it('exits with the requested code once shutdown completes', async () => {
    const exit = jest.fn();
    await exitAfterShutdown(async () => undefined, 0, { exit, deadlineMs: 1000 });
    expect(exit.mock.calls).toEqual([[0]]);
  });

  it('exits 1 instead of rejecting when a shutdown step fails', async () => {
    const exit = jest.fn();
    await expect(
      exitAfterShutdown(
        async () => {
          throw new Error('redis quit failed');
        },
        0,
        { exit, deadlineMs: 1000 },
      ),
    ).resolves.toBeUndefined();
    expect(exit.mock.calls).toEqual([[1]]);
  });

  it('forces exit 1 when a shutdown step never settles', async () => {
    jest.useFakeTimers();
    try {
      const exit = jest.fn();
      void exitAfterShutdown(() => new Promise<void>(() => undefined), 0, { exit, deadlineMs: 50 });
      await jest.advanceTimersByTimeAsync(49);
      expect(exit).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(exit.mock.calls).toEqual([[1]]);
    } finally {
      jest.useRealTimers();
    }
  });
});
