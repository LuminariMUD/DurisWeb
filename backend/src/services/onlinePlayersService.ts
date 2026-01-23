/**
 * online players service - reads from mud's redis keys directly
 * no websocket needed for online player data
 */

import redis from '../db/redis.js';
import logger from '../utils/logger.js';

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

/**
 * get all online players from mud:online redis hash
 */
export async function getOnlinePlayers(): Promise<OnlinePlayer[]> {
  try {
    const data = await redis.hgetall('mud:online');
    if (!data || Object.keys(data).length === 0) {
      return [];
    }

    const players: OnlinePlayer[] = [];
    for (const [pid, json] of Object.entries(data)) {
      try {
        const p = JSON.parse(json as string);
        players.push({
          pid: parseInt(pid, 10),
          name: p.name,
          account: p.account || '',
          level: p.level,
          race: p.race,
          class: p.class,
          racewar: p.racewar,
          ip: p.ip || '',
          client: p.client || '',
          clientVersion: p.client_version || '',
          loginTime: p.login_time || 0,
        });
      } catch {
        // skip malformed entries
      }
    }

    return players;
  } catch (err) {
    logger.error('[OnlinePlayers] failed to read mud:online:', err);
    return [];
  }
}

/**
 * get online player count
 */
export async function getOnlinePlayerCount(): Promise<number> {
  try {
    const count = await redis.hlen('mud:online');
    return count;
  } catch (err) {
    logger.error('[OnlinePlayers] failed to get count:', err);
    return 0;
  }
}

/**
 * get faction counts from online players
 */
export async function getFactionCounts(): Promise<FactionCounts> {
  const counts: FactionCounts = { goods: 0, evils: 0, neutrals: 0, undeads: 0 };

  try {
    const players = await getOnlinePlayers();
    for (const p of players) {
      switch (p.racewar) {
        case 1: counts.goods++; break;
        case 2: counts.evils++; break;
        case 3: counts.neutrals++; break;
        case 4: counts.undeads++; break;
      }
    }
  } catch (err) {
    logger.error('[OnlinePlayers] failed to get faction counts:', err);
  }

  return counts;
}

/**
 * get fraglist from mud:cache:fraglist
 */
export async function getFragList(): Promise<string | null> {
  try {
    return await redis.get('mud:cache:fraglist');
  } catch (err) {
    logger.error('[OnlinePlayers] failed to get fraglist:', err);
    return null;
  }
}

/**
 * get epic zones from mud:cache:epic_zones
 */
export async function getEpicZones(): Promise<string | null> {
  try {
    return await redis.get('mud:cache:epic_zones');
  } catch (err) {
    logger.error('[OnlinePlayers] failed to get epic zones:', err);
    return null;
  }
}

/**
 * get named equipment from mud:cache:named
 */
export async function getNamedEquipment(): Promise<string | null> {
  try {
    return await redis.get('mud:cache:named');
  } catch (err) {
    logger.error('[OnlinePlayers] failed to get named equipment:', err);
    return null;
  }
}
