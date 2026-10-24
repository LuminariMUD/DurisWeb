import Redis from 'ioredis';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { mudPool } from '../db/connection.js';
import logger from '../utils/logger.js';
import { getScopedRedisConfiguration } from '../utils/scopedRedis.js';
import { isHookEnabledSync } from '../hooks/hookGate.js';
import { recordHookActivity } from '../hooks/hookActivity.js';

const SUBSCRIBE_TIMEOUT_MS = 10_000;
const CHANNEL_REFRESH_INTERVAL_MS = 60_000;

let subscriber: Redis | null = null;
let subscribedChannel: string | null = null;
let channelRefreshTimer: NodeJS.Timeout | null = null;
type PlayerEventBroadcaster = (
  type: 'PLAYER_LOGIN' | 'PLAYER_LOGOUT',
  data: { pid: number },
) => void;
let broadcaster: PlayerEventBroadcaster | null = null;

interface SeasonRow extends RowDataPacket {
  season_epoch: number | string;
}

/**
 * set the broadcaster function (called from index.ts with websocket broadcast)
 */
export function setPlayerEventBroadcaster(fn: PlayerEventBroadcaster): void {
  broadcaster = fn;
}

async function getActivePlayerEventChannel(connection?: PoolConnection): Promise<string> {
  const configuration = getScopedRedisConfiguration('presence');
  const [rows] = await (connection ?? mudPool).query<SeasonRow[]>(
    `SELECT season_epoch
     FROM season_reset_state
     WHERE state_id = 1 AND reset_status = 'active'
     LIMIT 1 ${connection ? 'LOCK IN SHARE MODE' : ''}`,
  );
  if (rows.length !== 1) {
    throw new Error('No active MUD season epoch is available for player events');
  }
  const epoch = Number(rows[0].season_epoch);
  if (!Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error('MUD season epoch is invalid for player events');
  }
  return `${configuration.namespace}:season:${epoch}:player`;
}

async function waitForRedisReady(client: Redis): Promise<void> {
  if (client.status === 'ready') return;

  await new Promise<void>((resolve, reject) => {
    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      timeout = null;
      cleanup();
      reject(new Error('Redis readiness timed out'));
    }, SUBSCRIBE_TIMEOUT_MS);
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

async function withSubscribeTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Redis subscription timed out')),
          SUBSCRIBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function refreshPlayerEventChannel(): Promise<void> {
  const currentSubscriber = subscriber;
  if (!currentSubscriber) return;

  const nextChannel = await getActivePlayerEventChannel();
  if (subscriber !== currentSubscriber || nextChannel === subscribedChannel) return;

  const previousChannel = subscribedChannel;
  await waitForRedisReady(currentSubscriber);
  if (previousChannel) {
    await withSubscribeTimeout(currentSubscriber.unsubscribe(previousChannel));
  }
  if (subscriber !== currentSubscriber) return;
  await withSubscribeTimeout(currentSubscriber.subscribe(nextChannel));
  if (subscriber !== currentSubscriber) return;
  subscribedChannel = nextChannel;
  logger.info(`[PlayerEventSubscriber] switched to ${nextChannel}`);
}

/**
 * start subscribing to the active namespace/season player event channel
 */
export async function startPlayerEventSubscriber(): Promise<void> {
  if (subscriber) {
    logger.warn('[PlayerEventSubscriber] already running');
    return;
  }

  try {
    const configuration = getScopedRedisConfiguration('presence');
    const channel = await getActivePlayerEventChannel();
    const client = new Redis(configuration.options);
    subscriber = client;
    subscribedChannel = channel;

    client.on('connect', () => {
      logger.info('[PlayerEventSubscriber] redis connected');
    });

    client.on('error', (err) => {
      logger.error('[PlayerEventSubscriber] redis error:', err.message);
    });

    client.on('message', async (receivedChannel, message) => {
      if (subscriber !== client || receivedChannel !== subscribedChannel) return;
      let connection: PoolConnection | undefined;
      try {
        const parsed: unknown = JSON.parse(message);
        if (
          parsed === null ||
          typeof parsed !== 'object' ||
          !('event' in parsed) ||
          !('pid' in parsed)
        )
          return;
        const { event, pid } = parsed;
        if (
          (event !== 'login' && event !== 'logout') ||
          typeof pid !== 'number' ||
          !Number.isInteger(pid) ||
          pid <= 0
        ) {
          logger.warn('[PlayerEventSubscriber] rejected malformed player event');
          return;
        }
        if (!broadcaster) {
          logger.warn('[PlayerEventSubscriber] no broadcaster set');
          return;
        }
        if (!isHookEnabledSync('player_presence')) return;

        // Hold the season row through publication. Pwipe's FOR UPDATE boundary
        // waits for an accepted old-season event; a later lookup sees the fence.
        connection = await mudPool.getConnection();
        await connection.beginTransaction();
        const activeChannel = await getActivePlayerEventChannel(connection);
        if (
          subscriber !== client ||
          receivedChannel !== subscribedChannel ||
          receivedChannel !== activeChannel ||
          !isHookEnabledSync('player_presence')
        ) {
          await connection.rollback();
          return;
        }
        if (event === 'login') {
          broadcaster('PLAYER_LOGIN', { pid });
        } else {
          broadcaster('PLAYER_LOGOUT', { pid });
        }
        recordHookActivity('player_presence');

        await connection.commit();
        logger.info(`[PlayerEventSubscriber] ${event} pid=${pid}`);
      } catch {
        if (connection) {
          try {
            await connection.rollback();
          } catch {
            connection.destroy();
            connection = undefined;
          }
        }
        logger.error('[PlayerEventSubscriber] player event processing failed');
      } finally {
        connection?.release();
      }
    });

    await waitForRedisReady(client);
    await withSubscribeTimeout(client.subscribe(channel));
    channelRefreshTimer = setInterval(() => {
      void refreshPlayerEventChannel().catch((error) => {
        logger.warn(
          '[PlayerEventSubscriber] season channel refresh failed:',
          error instanceof Error ? error.message : String(error),
        );
      });
    }, CHANNEL_REFRESH_INTERVAL_MS);
    logger.info(`[PlayerEventSubscriber] subscribed to ${channel}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[PlayerEventSubscriber] disabled: ${message}`);
    if (channelRefreshTimer) {
      clearInterval(channelRefreshTimer);
      channelRefreshTimer = null;
    }
    if (subscriber) {
      subscriber.disconnect();
      subscriber = null;
    }
    subscribedChannel = null;
  }
}

/**
 * stop the subscriber
 */
export async function stopPlayerEventSubscriber(): Promise<void> {
  if (channelRefreshTimer) {
    clearInterval(channelRefreshTimer);
    channelRefreshTimer = null;
  }
  if (subscriber) {
    const current = subscriber;
    const channel = subscribedChannel;
    subscriber = null;
    subscribedChannel = null;
    try {
      if (channel) await current.unsubscribe(channel);
      await current.quit();
    } catch (error) {
      logger.error(
        '[PlayerEventSubscriber] close failed:',
        error instanceof Error ? error.message : String(error),
      );
      current.disconnect();
    }
    logger.info('[PlayerEventSubscriber] stopped');
  }
}
