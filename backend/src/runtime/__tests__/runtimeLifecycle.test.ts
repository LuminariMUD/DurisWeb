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
const checkWebDatabase = jest.fn(async () => databaseReachable);
const checkMudDatabase = jest.fn(async () => true);
const verifySchema = jest.fn<() => Promise<void>>();
const verifySession = jest.fn<() => Promise<void>>();
const probeFlatfiles = jest.fn<() => Promise<void>>();

const stub = (specifier: string, overrides?: Record<string, unknown>) =>
  jest.unstable_mockModule(specifier, stubModule(new URL(specifier, import.meta.url), overrides));
stub('../../db/connection.js', {
  pool: {},
  mudPool: {},
  checkDatabaseConnection: checkWebDatabase,
  checkMudDatabaseConnection: checkMudDatabase,
  verifyDatabaseSchema: verifySchema,
  verifyPoolSessionInvariants: verifySession,
  closeDatabaseConnection: record('database'),
});
stub('../../db/redis.js', { closeRedisConnection: record('redis') });
stub('../../hooks/flatfileHookState.js', {
  startFlatfileRecoveryMonitor: () => events.push('start flatfile monitor'),
  stopFlatfileRecoveryMonitor: () => events.push('flatfile monitor'),
  getFlatfileHookHealthSnapshot: () => [],
});
stub('../../services/flatfileAccess.js', { probeAllFlatfileHooks: probeFlatfiles });
stub('../../services/logWatchService.js', {
  cleanupLogWatchers: () => events.push('log watchers'),
});
stub('../../services/terminalService.js', { cleanupAllSessions: record('terminals') });
stub('../../services/onlinePlayersService.js', {
  closeOnlinePlayersRedisConnections: record('presence redis'),
});
let watchdogGate: Promise<void> | undefined;
stub('../../utils/eventLoopWatchdog.js', {
  startEventLoopWatchdog: async () => {
    await watchdogGate;
    return record('watchdog');
  },
});
stub('../backgroundJobs.js', {
  startBackgroundJobs: async () => {
    throw new Error('jobs must not start after a failed dependency check');
  },
});

const { createShutdown, exitAfterShutdown, installSignalHandlers } = await import('../shutdown.js');
const { listenOn, startServer } = await import('../startServer.js');
const { createApplicationWebSocketServer } = await import('../../utils/applicationWebSocket.js');
type Resources = import('../shutdown.js').RuntimeResources;

afterEach(() => {
  events.length = 0;
  databaseReachable = false;
  jest.clearAllMocks();
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

  it('keeps releasing later resources when a step fails, then reports the failure', async () => {
    const shutdown = createShutdown({
      jobs: {
        stopProducers: async () => {
          throw new Error('producer stop failed');
        },
        stopWorkers: record('workers'),
      },
    });
    await expect(shutdown()).rejects.toThrow('producer stop failed');
    expect(events).toEqual([
      'log watchers',
      'terminals',
      'workers',
      'presence redis',
      'database',
      'redis',
    ]);
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

describe('shutdown during startup', () => {
  it.each(['flatfiles', 'web database', 'schema'] as const)(
    'does no later dependency work after stopping during %s',
    async (stage) => {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      if (stage === 'flatfiles') probeFlatfiles.mockImplementationOnce(() => gate);
      if (stage === 'web database')
        checkWebDatabase.mockImplementationOnce(async () => {
          await gate;
          return true;
        });
      if (stage === 'schema') {
        databaseReachable = true;
        verifySchema.mockImplementationOnce(() => gate);
      }
      const resources: Resources = {};
      const starting = startServer(express(), resources);
      try {
        await new Promise((resolve) => setImmediate(resolve));
        await createShutdown(resources)();
        release();
        await expect(starting).rejects.toThrow('Startup stopped by shutdown');
        if (stage === 'flatfiles') expect(checkWebDatabase).not.toHaveBeenCalled();
        if (stage === 'web database') expect(checkMudDatabase).not.toHaveBeenCalled();
        if (stage === 'schema') expect(verifySession).not.toHaveBeenCalled();
        expect(resources.server).toBeUndefined();
      } finally {
        release();
        await starting.catch(() => undefined);
      }
    },
  );

  it('releases a late watchdog and acquires nothing else', async () => {
    let release = () => {};
    watchdogGate = new Promise((resolve) => {
      release = resolve;
    });
    try {
      const resources: Resources = {};
      const starting = startServer(express(), resources);
      await createShutdown(resources)();
      expect(events).not.toContain('watchdog');

      release();
      await expect(starting).rejects.toThrow('Startup stopped by shutdown');
      expect(events.at(-1)).toBe('watchdog');
      expect(events).not.toContain('start flatfile monitor');
      expect(resources.server).toBeUndefined();
      expect(resources.jobs).toBeUndefined();
    } finally {
      watchdogGate = undefined;
    }
  });
});

describe('listening', () => {
  it('rejects a port that is already bound instead of raising an uncaught error', async () => {
    const holder = createServer();
    holder.listen(0, '127.0.0.1');
    await once(holder, 'listening');
    const address = holder.address();
    if (!address || typeof address === 'string') throw new Error('missing listener');

    const server = createServer();
    const wss = createApplicationWebSocketServer(server);
    try {
      await expect(listenOn(server, address.port, '127.0.0.1')).rejects.toMatchObject({
        code: 'EADDRINUSE',
      });
      expect(server.listening).toBe(false);
    } finally {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => holder.close(() => resolve()));
    }
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
