/**
 * Online player service - reads the MUD's current namespaced presence snapshot.
 * The pointer/session generation is the source of truth; flat legacy hashes
 * are not used by this reader.
 */

import Redis from 'ioredis';
import type { RowDataPacket } from 'mysql2';
import { mudPool } from '../db/connection.js';
import logger from '../utils/logger.js';
import { getScopedRedisConfiguration, type RedisScope } from '../utils/scopedRedis.js';

const MAX_PRESENCE_SESSIONS = 256;
const REDIS_READINESS_TIMEOUT_MS = 10_000;

export interface OnlinePlayer {
  pid: number;
  name: string;
  account: string;
  level: number;
  race: string;
  class: string;
  racewar: number;
  ip: string;
  client: string;
  clientVersion: string;
  loginTime: number;
}

export interface FactionCounts {
  goods: number;
  evils: number;
  neutrals: number;
  undeads: number;
}

interface SeasonRow extends RowDataPacket {
  season_epoch: number | string;
}

let presenceRedis: Redis | null = null;
let cacheRedis: Redis | null = null;
let presenceNamespace: string | null = null;
let cacheNamespace: string | null = null;

async function activeSeasonEpoch(): Promise<number> {
  const [rows] = await mudPool.query<SeasonRow[]>(
    `SELECT season_epoch
     FROM season_reset_state
     WHERE state_id = 1 AND reset_status = 'active'
     LIMIT 1`,
  );
  if (rows.length !== 1) throw new Error('No active MUD season epoch is available');
  const epoch = Number(rows[0].season_epoch);
  if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error('MUD season epoch is invalid');
  return epoch;
}

async function waitForRedisReady(client: Redis): Promise<void> {
  if (client.status === 'ready') return;

  await new Promise<void>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      timeout = null;
      cleanup();
      reject(new Error('Redis readiness timed out'));
    }, REDIS_READINESS_TIMEOUT_MS);

    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      client.off('ready', onReady);
      client.off('error', onError);
    };

    client.once('ready', onReady);
    client.once('error', onError);
  });
}

async function getRedisClient(scope: RedisScope): Promise<{ client: Redis; namespace: string }> {
  const configuration = getScopedRedisConfiguration(scope);
  if (scope === 'presence') {
    if (
      !presenceRedis ||
      presenceNamespace !== configuration.namespace ||
      presenceRedis.status === 'end'
    ) {
      presenceRedis?.disconnect();
      presenceRedis = new Redis(configuration.options);
      presenceNamespace = configuration.namespace;
      presenceRedis.on('error', (error) =>
        logger.error('[OnlinePlayers] presence Redis error:', error.message),
      );
    }
    await waitForRedisReady(presenceRedis);
    return { client: presenceRedis, namespace: presenceNamespace };
  }

  if (!cacheRedis || cacheNamespace !== configuration.namespace || cacheRedis.status === 'end') {
    cacheRedis?.disconnect();
    cacheRedis = new Redis(configuration.options);
    cacheNamespace = configuration.namespace;
    cacheRedis.on('error', (error) =>
      logger.error('[OnlinePlayers] cache Redis error:', error.message),
    );
  }
  await waitForRedisReady(cacheRedis);
  return { client: cacheRedis, namespace: cacheNamespace };
}

async function scanBounded(client: Redis, pattern: string): Promise<string[]> {
  let cursor = '0';
  const keys: string[] = [];
  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 64);
    cursor = nextCursor;
    keys.push(...batch);
    if (keys.length > MAX_PRESENCE_SESSIONS) {
      return keys.slice(0, MAX_PRESENCE_SESSIONS + 1);
    }
  } while (cursor !== '0');
  return keys;
}

function parsePresence(key: string, prefix: string, value: string): OnlinePlayer | null {
  const pid = Number(key.slice(prefix.length));
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object') return null;
    const player = parsed as Record<string, unknown>;
    return {
      pid,
      name: typeof player.name === 'string' ? player.name : '',
      account: typeof player.account === 'string' ? player.account : '',
      level: typeof player.level === 'number' ? player.level : 0,
      race: typeof player.race === 'string' ? player.race : '',
      class: typeof player.class === 'string' ? player.class : '',
      racewar: typeof player.racewar === 'number' ? player.racewar : 0,
      ip: typeof player.ip === 'string' ? player.ip : '',
      client: typeof player.client === 'string' ? player.client : '',
      clientVersion: typeof player.client_version === 'string' ? player.client_version : '',
      loginTime: typeof player.login_time === 'number' ? player.login_time : 0,
    };
  } catch {
    return null;
  }
}

async function readPresenceSnapshot(retry: boolean): Promise<OnlinePlayer[]> {
  const { client, namespace } = await getRedisClient('presence');
  const epoch = await activeSeasonEpoch();
  const currentKey = `${namespace}:season:${epoch}:presence:current`;
  const instance = await client.get(currentKey);
  if (!instance) return [];

  const sessionPrefix = `${namespace}:season:${epoch}:presence:session:${instance}:`;
  const keys = await scanBounded(client, `${sessionPrefix}*`);
  if (keys.length > MAX_PRESENCE_SESSIONS) {
    logger.warn('[OnlinePlayers] presence snapshot exceeded bounded session limit');
    return [];
  }
  if (keys.length === 0) return [];

  const values = await client.mget(...keys);
  const players: OnlinePlayer[] = [];
  for (let index = 0; index < keys.length; index += 1) {
    const value = values[index];
    if (!value) continue;
    const player = parsePresence(keys[index], sessionPrefix, value);
    if (player) players.push(player);
  }

  const currentAfter = await client.get(currentKey);
  if (currentAfter !== instance && retry) return readPresenceSnapshot(false);
  if (currentAfter !== instance) return [];
  return players;
}

/**
 * Get all online players from the active MUD presence generation.
 */
export async function getOnlinePlayers(): Promise<OnlinePlayer[]> {
  try {
    return await readPresenceSnapshot(true);
  } catch (error) {
    logger.error('[OnlinePlayers] failed to read namespaced presence:', error);
    return [];
  }
}

/**
 * Get online player count from the same snapshot used by getOnlinePlayers.
 */
export async function getOnlinePlayerCount(): Promise<number> {
  return (await getOnlinePlayers()).length;
}

/**
 * Get faction counts from online players.
 */
export async function getFactionCounts(): Promise<FactionCounts> {
  const counts: FactionCounts = { goods: 0, evils: 0, neutrals: 0, undeads: 0 };
  for (const player of await getOnlinePlayers()) {
    switch (player.racewar) {
      case 1:
        counts.goods += 1;
        break;
      case 2:
        counts.evils += 1;
        break;
      case 3:
        counts.neutrals += 1;
        break;
      case 4:
        counts.undeads += 1;
        break;
    }
  }
  return counts;
}

async function getScopedCacheValue(suffix: string): Promise<string | null> {
  try {
    const { client, namespace } = await getRedisClient('cache');
    const epoch = await activeSeasonEpoch();
    return await client.get(`${namespace}:season:${epoch}:cache:${suffix}`);
  } catch (error) {
    logger.error(`[OnlinePlayers] failed to read cache ${suffix}:`, error);
    return null;
  }
}

export function getFragList(): Promise<string | null> {
  return getScopedCacheValue('fraglist');
}

export function getEpicZones(): Promise<string | null> {
  return getScopedCacheValue('epic_zones');
}

export function getNamedEquipment(): Promise<string | null> {
  return getScopedCacheValue('named');
}

export async function closeOnlinePlayersRedisConnections(): Promise<void> {
  const clients = [presenceRedis, cacheRedis].filter((client): client is Redis => client !== null);
  presenceRedis = null;
  cacheRedis = null;
  presenceNamespace = null;
  cacheNamespace = null;
  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }),
  );
}
