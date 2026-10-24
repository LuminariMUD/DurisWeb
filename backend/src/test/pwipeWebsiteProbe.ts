import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import knex from 'knex';
import Redis from 'ioredis';
import WebSocket from 'ws';
import { once } from 'node:events';

// Only the parent MUD journey supplies this owned disposable target.
if (
  process.env.TEST_PWIPE_WEBSITE !== '1' ||
  process.env.DB_HOST !== '127.0.0.1' ||
  process.env.TEST_DB_HOST !== '127.0.0.1' ||
  process.env.DB_PORT !== process.env.TEST_DB_PORT ||
  [3306, 3307].includes(Number(process.env.DB_PORT)) ||
  !/^pwipe_journey_[a-f0-9]{12}$/.test(process.env.DB_NAME ?? '')
) {
  throw new Error('Website pwipe probe requires the owned disposable MUD journey');
}
const root = process.env.TEST_WEBSITE_DIRECTORY;
assert(root && path.isAbsolute(root) && fs.statSync(root).isDirectory());
await import('./setupEnvironment.js');
const { getBackendConfiguration } = await import('../config/environment.js');
const configuration = getBackendConfiguration().database;
const phase = process.argv[2];
if (phase === 'setup') {
  const { installLifecycleMetadata } = await import('../db/lifecycleMetadata.js');
  const { externalSchemaSha256, runWebBaseline } = await import('../db/webBaseline.js');
  const { loadWebBaselineBundle } = await import('../db/webBaselineBundle.js');
  const { WebMigrationSource } = await import('../db/webMigrationSource.js');
  const database = await mysql.createConnection(configuration);
  try {
    const [principal] = await database.query<RowDataPacket[]>('SELECT CURRENT_USER() AS principal');
    const identity: unknown = principal[0]?.principal;
    assert(typeof identity === 'string' && /^root@(?:%|localhost|127\.0\.0\.1)$/.test(identity));
    const [user, host] = identity.split('@');
    await installLifecycleMetadata(database, user, host);
    const schema = await externalSchemaSha256(database, loadWebBaselineBundle());
    // The parent installed/verified the owner source with its supported migration runner.
    await runWebBaseline(database, 'bootstrap', schema);
  } finally {
    await database.end();
  }
  const migrations = knex({
    client: 'mysql2',
    connection: configuration,
    migrations: { migrationSource: new WebMigrationSource(configuration) },
  });
  try {
    await migrations.migrate.latest();
  } finally {
    await migrations.destroy();
  }
  const settings = await mysql.createConnection(configuration);
  try {
    await settings.query(
      "UPDATE web_settings SET setting_value='false' WHERE setting_key='hook_enabled_donation_delivery'",
    );
  } finally {
    await settings.end();
  }
  console.log('Website fixture baseline and forward migrations installed');
} else if (phase === 'old' || phase === 'new') {
  await probeWebsite(phase, root);
} else {
  throw new Error('Unknown website pwipe probe phase');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function waitFor(
  check: () => boolean | Promise<boolean>,
  reason: string,
  timeout = 20000,
): Promise<void> {
  const until = Date.now() + timeout;
  while (!(await check())) {
    assert(Date.now() < until, reason);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

type Cookies = Record<string, string>;
function cookieValues(value: Record<string, unknown>): Cookies {
  const cookies: Cookies = {};
  for (const [name, entry] of Object.entries(value)) {
    assert(typeof entry === 'string');
    cookies[name] = entry;
  }
  return cookies;
}

async function api(
  route: string,
  cookies: Cookies,
  body?: unknown,
  status = 200,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    Cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; '),
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    headers['x-csrf-token'] = cookies.csrf_token;
  }
  const response = await fetch(process.env.SITE_URL + route, {
    headers,
    method: body === undefined ? 'GET' : 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, status, `HTTP ${route}: ${response.status}`);
  for (const value of response.headers.getSetCookie()) {
    const cookie = value.split(';')[0],
      separator = cookie.indexOf('=');
    cookies[cookie.slice(0, separator)] = cookie.slice(separator + 1);
  }
  const value: unknown = await response.json();
  assert(record(value), `Expected object from ${route}`);
  return value;
}

async function login(account: string): Promise<Cookies> {
  const cookies: Cookies = {};
  await api('/api/auth/check', cookies);
  await api('/api/auth/login', cookies, {
    username: account,
    password: process.env.TEST_GAME_PASSWORD,
  });
  return cookies;
}

async function peer(
  cookies: Cookies,
): Promise<{ socket: WebSocket; events: Record<string, unknown>[] }> {
  const capability = await api('/api/auth/websocket-token', cookies);
  assert(typeof capability.token === 'string');
  const socket = new WebSocket(process.env.SITE_URL!.replace('http:', 'ws:') + '/ws', {
    headers: {
      Cookie: Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    },
  });
  const events: Record<string, unknown>[] = [];
  socket.on('message', (data) => {
    const value: unknown = JSON.parse(String(data));
    if (record(value)) events.push(value);
  });
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'SUBSCRIBE_PLAYER_EVENTS', token: capability.token }));
  return { socket, events };
}

function sawLogin(events: Record<string, unknown>[], pid: number): boolean {
  return events.some(
    (event) =>
      event.type === 'PLAYER_LOGIN' && record(event.data) && Number(event.data.pid) === pid,
  );
}

async function probeWebsite(phase: 'old' | 'new', directory: string): Promise<void> {
  const account = process.env.TEST_WEB_ACCOUNT!,
    observerAccount = process.env.TEST_WEB_OBSERVER_ACCOUNT!;
  assert(account && observerAccount && process.env.TEST_WEB_EMAIL);
  const namespace = process.env.MUD_REDIS_NAMESPACE!;
  const redis = new Redis({ host: '127.0.0.1', port: Number(process.env.MUD_REDIS_PORT), db: 0 });
  const cache = new Redis({ host: '127.0.0.1', port: Number(process.env.CACHE_REDIS_PORT), db: 1 });
  const database = await mysql.createConnection(configuration);
  const peers: WebSocket[] = [];
  let donationReader: Redis | undefined;
  const stateFile = path.join(directory, 'auth-state.json');
  const donation = {
    verification_token: process.env.KOFI_VERIFICATION_TOKEN,
    message_id: 'pwipe-website-donation-264',
    type: 'Donation',
    amount: '1.23',
    currency: 'USD',
    from_name: 'Synthetic donor',
    email: process.env.TEST_WEB_EMAIL,
    message: 'season-queued-fixture',
    is_public: true,
    timestamp: new Date().toISOString(),
    is_subscription_payment: false,
    is_first_subscription_payment: false,
    tier_name: null,
  };
  const donations: Record<string, unknown>[] = [];
  try {
    if (phase === 'new') {
      donationReader = redis.duplicate();
      donationReader.on('message', (_channel, value) => {
        const event: unknown = JSON.parse(value);
        assert(record(event));
        donations.push(event);
      });
      await donationReader.subscribe(`${namespace}:season:2:nchat`);
      fs.writeFileSync(path.join(directory, 'new-subscribed'), 'ready');
      await waitFor(async () => {
        try {
          return (await fetch(process.env.SITE_URL + '/health')).status === 200;
        } catch {
          return false;
        }
      }, 'new backend did not become healthy');
    }
    let main: Cookies, observer: Cookies;
    if (phase === 'old') {
      main = await login(account);
      observer = await login(observerAccount);
      fs.writeFileSync(stateFile, JSON.stringify({ main, observer }), { mode: 0o600 });
    } else {
      const saved: unknown = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert(record(saved) && record(saved.main) && record(saved.observer));
      assert(Object.values(saved.main).every((value) => typeof value === 'string'));
      assert(Object.values(saved.observer).every((value) => typeof value === 'string'));
      main = cookieValues(saved.main);
      observer = cookieValues(saved.observer);
    }
    const good = await peer(main),
      formerlyStaff = await peer(observer);
    peers.push(good.socket, formerlyStaff.socket);
    const canary = 2147483000;
    await waitFor(async () => {
      await cache.ping();
      await redis.publish(
        `${namespace}:season:${phase === 'old' ? 1 : 2}:player`,
        JSON.stringify({ event: 'login', pid: canary }),
      );
      return (
        sawLogin(good.events, canary) && (phase === 'new' || sawLogin(formerlyStaff.events, canary))
      );
    }, 'authorized player-event subscription did not become ready');
    fs.writeFileSync(path.join(directory, phase + '-peer-ready'), 'ready');
    const expectedName = phase === 'old' ? 'Webmortal' : process.env.TEST_WEB_FRESH_CHARACTER!;
    let visiblePid = 0;
    await waitFor(async () => {
      const [rows] = await database.query<RowDataPacket[]>(
        'SELECT pid FROM player_data WHERE name=? AND active=1',
        [expectedName],
      );
      visiblePid = Number(rows[0]?.pid ?? 0);
      return visiblePid > 0 && sawLogin(good.events, visiblePid);
    }, 'actual MUD player login did not reach the website websocket');
    await waitFor(async () => {
      const who = await api('/api/admin/who', main);
      return (
        who.source === 'redis' &&
        Array.isArray(who.players) &&
        who.players.some((player: unknown) => record(player) && player.char_name === expectedName)
      );
    }, 'real visible MUD player did not reach the WHO endpoint');
    // Rankings omit zero-frag players; seed a derived ranking canary for the real body.
    await database.query(
      `INSERT INTO frag_leaderboard(pid,account_name,char_name,total_frags,racewar,level)
       SELECT pd.pid,ac.account_name,pd.name,32100,pd.racewar,pd.level
       FROM player_data pd JOIN account_characters ac ON ac.pid=pd.pid AND ac.deleted_at IS NULL
       WHERE pd.pid=? AND pd.active=1
       ON DUPLICATE KEY UPDATE total_frags=VALUES(total_frags)`,
      [visiblePid],
    );
    const leaderboard = await api(
      '/api/frag/leaderboard?char_name=' + encodeURIComponent(expectedName),
      {},
    );
    assert(
      Array.isArray(leaderboard.data) &&
        leaderboard.data.some(
          (entry: unknown) => record(entry) && entry.char_name === expectedName,
        ),
    );
    const { getAccount } = await import('../services/accountService.js');
    const { getUserPermissions } = await import('../services/permissionService.js');
    const { getFragList, getEpicZones, getNamedEquipment } = await import(
      '../services/onlinePlayersService.js'
    );
    const readers = [getFragList, getEpicZones, getNamedEquipment],
      suffixes = ['fraglist', 'epic_zones', 'named'];
    for (let i = 0; i < readers.length; i++) {
      const value = phase + '-website-cache-' + suffixes[i];
      await redis.set(`${namespace}:season:${phase === 'old' ? 1 : 2}:cache:${suffixes[i]}`, value);
      assert.equal(await readers[i](), value);
    }
    if (phase === 'old') {
      for (const name of [account, observerAccount]) {
        const data = await getAccount(name);
        assert(data);
        await cache.set('mud:account:' + name.toLowerCase(), JSON.stringify(data));
        await cache.set(
          'perms:' + name,
          JSON.stringify(await getUserPermissions(name, data.characters)),
        );
      }
      const response = await fetch(process.env.SITE_URL + '/kofihook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: JSON.stringify(donation) }).toString(),
      });
      assert.equal(response.status, 200);
      const [outbox] = await database.query<RowDataPacket[]>('SELECT status FROM donation_outbox');
      assert.equal(outbox.length, 1);
      assert.equal(outbox[0].status, 'pending');
      fs.writeFileSync(path.join(directory, 'old-verified'), 'ready');
      const codes = await Promise.all(
        peers.map(async (socket) => (await once(socket, 'close'))[0]),
      );
      assert(codes.every((code: unknown) => code === 1000 || code === 1001));
      fs.writeFileSync(path.join(directory, 'old-close.json'), JSON.stringify(codes));
    } else {
      const user = await api('/api/auth/me', observer);
      assert(record(user.user) && record(user.user.permissions));
      assert.equal(user.user.permissions.role, 'player');
      assert(
        Array.isArray(user.user.characters) &&
          !user.user.characters.some(
            (entry: unknown) => record(entry) && entry.name === 'Watchkeeper',
          ),
      );
      assert(
        !sawLogin(formerlyStaff.events, canary) && !sawLogin(formerlyStaff.events, visiblePid),
      );
      const oldRank = await api('/api/frag/leaderboard?char_name=Webmortal', {});
      assert(Array.isArray(oldRank.data) && oldRank.data.length === 0);
      const oldCache = await cache.get('perms:' + observerAccount);
      assert(oldCache && oldCache.includes('greater_god'));
      await waitFor(
        () => donations.length === 1,
        'queued donation was not published in the new epoch',
      );
      assert.equal(donations[0].amount_cents, 123);
      assert.equal(donations[0].message, 'season-queued-fixture');
      const [outbox] = await database.query<RowDataPacket[]>('SELECT status FROM donation_outbox');
      assert.equal(outbox.length, 1);
      assert.equal(outbox[0].status, 'published');
      const retried = await fetch(process.env.SITE_URL + '/kofihook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: JSON.stringify(donation) }).toString(),
      });
      assert.equal(retried.status, 200);
      const [totals] = await database.query<RowDataPacket[]>(
        'SELECT total_cents FROM web_donation_totals WHERE account_name=?',
        [account],
      );
      assert.equal(Number(totals[0]?.total_cents), 123);
      const closed: unknown = JSON.parse(
        fs.readFileSync(path.join(directory, 'old-close.json'), 'utf8'),
      );
      assert(Array.isArray(closed) && closed.length === 2);
      fs.writeFileSync(
        path.join(directory, 'report.json'),
        JSON.stringify({
          oldWebsocketsClosed: closed,
          realHttpSessionSurvived: true,
          retiredStaffRefused: true,
          oldRoleCacheRetained: true,
          realPresenceAndLoginReconnected: true,
          oldLeaderboardAbsent: true,
          scopedCachedLists: true,
          queuedDonationNewEpoch: true,
          duplicateWebhookNoExtraCredit: true,
        }),
      );
      fs.writeFileSync(path.join(directory, 'new-verified'), 'ready');
    }
    console.log('Normal website ' + phase + '-season HTTP/websocket/donation probe passed');
  } finally {
    for (const socket of peers) socket.terminate();
    donationReader?.disconnect();
    redis.disconnect();
    cache.disconnect();
    await database.end();
    const { closeOnlinePlayersRedisConnections } = await import(
      '../services/onlinePlayersService.js'
    );
    const { closeDatabaseConnection } = await import('../db/connection.js');
    const { closeRedisConnection } = await import('../db/redis.js');
    await closeOnlinePlayersRedisConnections();
    await closeDatabaseConnection();
    await closeRedisConnection();
  }
}
