import Redis from 'ioredis';
import type { RowDataPacket } from 'mysql2';
import { mudPool } from '../db/connection.js';
import logger from '../utils/logger.js';
import { getScopedRedisConfiguration } from '../utils/scopedRedis.js';

const SUBSCRIBE_TIMEOUT_MS = 10_000;
const CHANNEL_REFRESH_INTERVAL_MS = 60_000;

let subscriber: Redis | null = null;
let subscribedChannel: string | null = null;
let channelRefreshTimer: NodeJS.Timeout | null = null;
let broadcaster: ((type: string, data: any) => void) | null = null;

interface SeasonRow extends RowDataPacket {
  season_epoch: number | string;
}

interface PlayerEvent {
  event: 'login' | 'logout';
  pid: number;
}

/**
 * set the broadcaster function (called from index.ts with websocket broadcast)
 */
export function setPlayerEventBroadcaster(fn: (type: string, data: any) => void): void {
  broadcaster = fn;
}

async function getActivePlayerEventChannel(): Promise<string> {
  const configuration = getScopedRedisConfiguration('presence');
  const [rows] = await mudPool.query<SeasonRow[]>(
    `SELECT season_epoch
     FROM season_reset_state
     WHERE state_id = 1 AND reset_status = 'active'
     LIMIT 1`
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
        timeout = setTimeout(() => reject(new Error('Redis subscription timed out')), SUBSCRIBE_TIMEOUT_MS);
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
  if (nextChannel === subscribedChannel) return;

  const previousChannel = subscribedChannel;
  await waitForRedisReady(currentSubscriber);
  if (previousChannel) {
    await withSubscribeTimeout(currentSubscriber.unsubscribe(previousChannel));
  }
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

    client.on('message', (receivedChannel, message) => {
      if (receivedChannel !== subscribedChannel) return;

      try {
        const parsed: unknown = JSON.parse(message);
        if (parsed === null || typeof parsed !== 'object') return;
        const event = parsed as Partial<PlayerEvent>;
        if ((event.event !== 'login' && event.event !== 'logout') ||
            !Number.isInteger(event.pid) || (event.pid as number) <= 0) {
          logger.warn('[PlayerEventSubscriber] rejected malformed player event');
          return;
        }
        if (!broadcaster) {
          logger.warn('[PlayerEventSubscriber] no broadcaster set');
          return;
        }

        if (event.event === 'login') {
          broadcaster('PLAYER_LOGIN', { pid: event.pid });
        } else {
          broadcaster('PLAYER_LOGOUT', { pid: event.pid });
        }

        logger.info(`[PlayerEventSubscriber] ${event.event} pid=${event.pid}`);
      } catch {
        logger.error('[PlayerEventSubscriber] failed to parse player event');
      }
    });

    await waitForRedisReady(client);
    await withSubscribeTimeout(client.subscribe(channel));
    channelRefreshTimer = setInterval(() => {
      void refreshPlayerEventChannel().catch((error) => {
        logger.warn('[PlayerEventSubscriber] season channel refresh failed:', error instanceof Error ? error.message : String(error));
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
      logger.error('[PlayerEventSubscriber] close failed:', error instanceof Error ? error.message : String(error));
      current.disconnect();
    }
    logger.info('[PlayerEventSubscriber] stopped');
  }
}
