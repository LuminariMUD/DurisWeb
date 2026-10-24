import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import mysql, { type Pool } from 'mysql2/promise';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const poolQuery = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const getConnection = jest.fn<() => Promise<unknown>>();
const connection = {
  beginTransaction: jest.fn<() => Promise<void>>(),
  query: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  commit: jest.fn<() => Promise<void>>(),
  rollback: jest.fn<() => Promise<void>>(),
  release: jest.fn<() => void>(),
  destroy: jest.fn<() => void>(),
};
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const enabled = jest.fn<() => boolean>();
const activity = jest.fn();
const broadcast = jest.fn<(...args: unknown[]) => void>();
class FakeRedis extends EventEmitter {
  status = 'ready';
  subscribe = jest.fn(async (_channel: string) => 1);
  unsubscribe = jest.fn(async (_channel: string) => 0);
  quit = jest.fn(async () => {
    this.status = 'end';
  });
  disconnect = jest.fn(() => {
    this.status = 'end';
  });
}
const clients: FakeRedis[] = [];
jest.unstable_mockModule('ioredis', () => ({
  default: class extends FakeRedis {
    constructor() {
      super();
      clients.push(this);
    }
  },
}));
jest.unstable_mockModule('../../db/connection.js', () => ({
  mudPool: { query: poolQuery, getConnection },
}));
jest.unstable_mockModule('../../utils/logger.js', () => ({ default: logger }));
jest.unstable_mockModule('../../utils/scopedRedis.js', () => ({
  getScopedRedisConfiguration: () => ({ namespace: 'duris:local:test', options: {} }),
}));
jest.unstable_mockModule('../../hooks/hookGate.js', () => ({ isHookEnabledSync: enabled }));
jest.unstable_mockModule('../../hooks/hookActivity.js', () => ({ recordHookActivity: activity }));
const { startPlayerEventSubscriber, stopPlayerEventSubscriber, setPlayerEventBroadcaster } =
  await import('../playerEventSubscriber.js');
const channel = (epoch: number) => `duris:local:test:season:${epoch}:player`;
async function message(
  client: FakeRedis,
  receivedChannel = channel(1),
  payload: unknown = { event: 'login', pid: 42 },
) {
  for (const listener of client.listeners('message')) {
    await listener(
      receivedChannel,
      typeof payload === 'string' ? payload : JSON.stringify(payload),
    );
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  clients.length = 0;
  enabled.mockReturnValue(true);
  poolQuery.mockResolvedValue([[{ season_epoch: 1 }]]);
  getConnection.mockResolvedValue(connection);
  connection.query.mockResolvedValue([[{ season_epoch: 1 }]]);
  connection.beginTransaction.mockResolvedValue(undefined);
  connection.commit.mockResolvedValue(undefined);
  connection.rollback.mockResolvedValue(undefined);
  setPlayerEventBroadcaster(broadcast);
});
afterEach(async () => {
  await stopPlayerEventSubscriber();
  jest.useRealTimers();
});

describe('season-fenced player events', () => {
  it.each(['login', 'logout'])(
    'publishes an enabled current-season %s before releasing its SQL fence',
    async (event) => {
      await startPlayerEventSubscriber();
      await message(clients[0], channel(1), { event, pid: 42 });
      expect(broadcast).toHaveBeenCalledWith(event === 'login' ? 'PLAYER_LOGIN' : 'PLAYER_LOGOUT', {
        pid: 42,
      });
      expect(connection.query.mock.calls[0][0]).toContain('LOCK IN SHARE MODE');
      expect(broadcast.mock.invocationCallOrder[0]).toBeLessThan(
        connection.commit.mock.invocationCallOrder[0],
      );
      expect(connection.release).toHaveBeenCalledTimes(1);
      expect(activity).toHaveBeenCalledWith('player_presence');
    },
  );
  it.each([
    { rows: [] },
    { rows: [{ season_epoch: 2 }] },
    { rows: [{ season_epoch: 0 }] },
    { rows: [{ season_epoch: 'invalid' }] },
  ])(
    'refuses cached-channel delivery with inactive, changed or invalid epoch %j',
    async ({ rows }) => {
      await startPlayerEventSubscriber();
      connection.query.mockResolvedValueOnce([rows]);
      await message(clients[0]);
      expect(broadcast).not.toHaveBeenCalled();
      expect(activity).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.release).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['disabled', 'foreign', 'malformed'])(
    'does no event SQL work for %s input',
    async (scenario) => {
      await startPlayerEventSubscriber();
      if (scenario === 'disabled') enabled.mockReturnValue(false);
      await message(
        clients[0],
        scenario === 'foreign' ? channel(2) : channel(1),
        scenario === 'malformed' ? '{' : { event: 'login', pid: 42 },
      );
      expect(getConnection).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    },
  );
  it.each([
    { event: 'other', pid: 42 },
    { event: 'login', pid: '42' },
    { event: 'login', pid: -1 },
    null,
  ])('refuses malformed event %j', async (payload) => {
    await startPlayerEventSubscriber();
    await message(clients[0], channel(1), payload);
    expect(getConnection).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });
  it.each(['redis', 'refresh', 'startup', 'close'])(
    'keeps raw driver details out of %s diagnostics',
    async (scenario) => {
      const detail = '203.0.113.29 token=private-driver-sentinel';
      if (scenario === 'startup') poolQuery.mockRejectedValueOnce(new Error(detail));
      await startPlayerEventSubscriber();
      if (scenario === 'redis') clients[0].emit('error', new Error(detail));
      if (scenario === 'refresh') {
        poolQuery.mockRejectedValueOnce(new Error(detail));
        await jest.advanceTimersByTimeAsync(60_000);
      }
      if (scenario === 'close') {
        clients[0].quit.mockRejectedValueOnce(new Error(detail));
        await stopPlayerEventSubscriber();
      }
      const errors = [...logger.error.mock.calls, ...logger.warn.mock.calls];
      expect(errors.length).toBeGreaterThan(0);
      expect(JSON.stringify(errors)).not.toContain(detail);
    },
  );
  it('fails closed and discards driver details when event lookup fails', async () => {
    await startPlayerEventSubscriber();
    connection.query.mockRejectedValueOnce(new Error('private-driver-sentinel'));
    await message(clients[0]);
    expect(broadcast).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private-driver-sentinel');
  });
  it('destroys a connection whose rollback fails instead of returning it to the pool', async () => {
    await startPlayerEventSubscriber();
    connection.query.mockRejectedValueOnce(new Error('lookup failure'));
    connection.rollback.mockRejectedValueOnce(new Error('rollback failure'));
    await message(clients[0]);
    expect(connection.destroy).toHaveBeenCalledTimes(1);
    expect(connection.release).not.toHaveBeenCalled();
  });
  it.each(['stop', 'restart', 'hook', 'refresh'])(
    'discards a deferred event after %s changes its admission',
    async (scenario) => {
      await startPlayerEventSubscriber();
      const old = clients[0],
        lookup = deferred<unknown>(),
        reached = deferred<void>();
      connection.query.mockImplementationOnce(() => {
        reached.resolve();
        return lookup.promise;
      });
      const pending = message(old);
      await reached.promise;
      expect(connection.query).toHaveBeenCalledTimes(1);
      if (scenario === 'stop' || scenario === 'restart') await stopPlayerEventSubscriber();
      if (scenario === 'restart') await startPlayerEventSubscriber();
      if (scenario === 'hook') enabled.mockReturnValue(false);
      if (scenario === 'refresh') {
        poolQuery.mockResolvedValue([[{ season_epoch: 2 }]]);
        await jest.advanceTimersByTimeAsync(60_000);
      }
      lookup.resolve([[{ season_epoch: 1 }]]);
      await pending;
      expect(broadcast).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.release).toHaveBeenCalledTimes(1);
    },
  );
  it('does not resubscribe a stopped client when a refresh lookup completes late', async () => {
    await startPlayerEventSubscriber();
    const old = clients[0],
      lookup = deferred<unknown>(),
      reached = deferred<void>();
    poolQuery.mockImplementationOnce(() => {
      reached.resolve();
      return lookup.promise;
    });
    jest.advanceTimersByTime(60_000);
    await reached.promise;
    await stopPlayerEventSubscriber();
    lookup.resolve([[{ season_epoch: 2 }]]);
    await jest.advanceTimersByTimeAsync(0);
    expect(old.subscribe).toHaveBeenCalledTimes(1);
  });
  it('keeps stale-channel messages blocked after a failed refresh, then accepts the new channel', async () => {
    await startPlayerEventSubscriber();
    poolQuery.mockRejectedValueOnce(new Error('no active season'));
    await jest.advanceTimersByTimeAsync(60_000);
    connection.query.mockResolvedValueOnce([[]]);
    await message(clients[0]);
    expect(broadcast).not.toHaveBeenCalled();
    poolQuery.mockResolvedValue([[{ season_epoch: 2 }]]);
    connection.query.mockResolvedValue([[{ season_epoch: 2 }]]);
    await jest.advanceTimersByTimeAsync(60_000);
    await message(clients[0], channel(2));
    expect(broadcast).toHaveBeenCalledTimes(1);
  });
});

const nativePort = Number(process.env.TEST_PRESENCE_DB_PORT);
if (
  nativePort &&
  (process.env.TEST_DB_HOST !== '127.0.0.1' ||
    nativePort !== Number(process.env.TEST_DB_PORT) ||
    [3306, 3307].includes(nativePort))
) {
  throw new Error('Presence locking tests require the owned disposable loopback SQL fixture');
}
(nativePort ? describe : describe.skip)('native season boundary ordering', () => {
  it('SELECT-only website publication blocks the MUD boundary until commit and refuses the fenced old channel', async () => {
    jest.useRealTimers();
    const suffix = randomUUID().replaceAll('-', ''),
      database = `durisweb_presence_${suffix}`,
      user = `presence_${suffix.slice(0, 12)}`;
    const target = {
      host: '127.0.0.1',
      port: nativePort,
      user: process.env.TEST_DB_USER,
      password: process.env.TEST_DB_PASSWORD,
    };
    const admin = await mysql.createConnection(target);
    const password = randomUUID();
    let nativePool: Pool | undefined;
    const commitReached = deferred<void>(),
      releaseCommit = deferred<void>();
    let pending: Promise<void> | undefined;
    try {
      await admin.query('CREATE DATABASE ??', [database]);
      await admin.query(
        'CREATE TABLE ??.season_reset_state (state_id TINYINT PRIMARY KEY,season_epoch BIGINT UNSIGNED NOT NULL,reset_status VARCHAR(16) NOT NULL) ENGINE=InnoDB',
        [database],
      );
      await admin.query("INSERT INTO ??.season_reset_state VALUES(1,1,'active')", [database]);
      await admin.query("CREATE USER ?@'%' IDENTIFIED BY ?", [user, password]);
      await admin.query("GRANT SELECT ON ??.season_reset_state TO ?@'%'", [database, user]);
      nativePool = mysql.createPool({ ...target, database, user, password });
      const reader = nativePool;
      poolQuery.mockImplementation(async (sql) => reader.query(String(sql)));
      let first = true;
      getConnection.mockImplementation(async () => {
        const borrowed = await reader.getConnection();
        if (first) {
          first = false;
          const commit = borrowed.commit.bind(borrowed);
          jest.spyOn(borrowed, 'commit').mockImplementation(async () => {
            commitReached.resolve();
            await releaseCommit.promise;
            await commit();
          });
        }
        return borrowed;
      });
      await startPlayerEventSubscriber();
      pending = message(clients[0]);
      await commitReached.promise;
      // The independent administrative connection executes the MUD's owning
      // FOR UPDATE query; a one-second server timeout proves an actual lock.
      await admin.query('SET SESSION innodb_lock_wait_timeout=1');
      await admin.beginTransaction();
      await expect(
        admin.query(
          'SELECT season_epoch,reset_status FROM ??.season_reset_state WHERE state_id=1 FOR UPDATE',
          [database],
        ),
      ).rejects.toMatchObject({ code: 'ER_LOCK_WAIT_TIMEOUT' });
      await admin.rollback();
      releaseCommit.resolve();
      await pending;
      await admin.beginTransaction();
      await admin.query(
        'SELECT season_epoch,reset_status FROM ??.season_reset_state WHERE state_id=1 FOR UPDATE',
        [database],
      );
      await admin.query(
        "UPDATE ??.season_reset_state SET season_epoch=2,reset_status='resetting' WHERE state_id=1",
        [database],
      );
      await admin.commit();
      await message(clients[0]);
      expect(broadcast).toHaveBeenCalledTimes(1);
      await admin.query("UPDATE ??.season_reset_state SET reset_status='active' WHERE state_id=1", [
        database,
      ]);
      await stopPlayerEventSubscriber();
      await startPlayerEventSubscriber();
      await message(clients[clients.length - 1], channel(2));
      expect(broadcast).toHaveBeenCalledTimes(2);
    } finally {
      releaseCommit.resolve();
      await pending;
      await stopPlayerEventSubscriber();
      await nativePool?.end();
      await admin.query('DROP DATABASE IF EXISTS ??', [database]);
      await admin.query("DROP USER IF EXISTS ?@'%'", [user]);
      await admin.end();
    }
  });
});
