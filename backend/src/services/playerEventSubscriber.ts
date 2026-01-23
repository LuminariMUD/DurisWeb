/**
 * subscribes to mud:player redis channel for real-time login/logout events
 * broadcasts to websocket clients for live dashboard updates
 */

import Redis from 'ioredis'
import logger from '../utils/logger.js'

let subscriber: Redis | null = null
let broadcaster: ((type: string, data: any) => void) | null = null

interface PlayerEvent {
  event: 'login' | 'logout'
  pid: number
}

/**
 * set the broadcaster function (called from index.ts with websocket broadcast)
 */
export function setPlayerEventBroadcaster(fn: (type: string, data: any) => void): void {
  broadcaster = fn
}

/**
 * start subscribing to mud:player channel
 */
export function startPlayerEventSubscriber(): void {
  if (subscriber) {
    logger.warn('[PlayerEventSubscriber] already running')
    return
  }

  subscriber = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
  })

  subscriber.on('connect', () => {
    logger.info('[PlayerEventSubscriber] redis connected')
  })

  subscriber.on('error', (err) => {
    logger.error('[PlayerEventSubscriber] redis error:', err.message)
  })

  subscriber.subscribe('mud:player', (err) => {
    if (err) {
      logger.error('[PlayerEventSubscriber] failed to subscribe:', err.message)
    } else {
      logger.info('[PlayerEventSubscriber] subscribed to mud:player')
    }
  })

  subscriber.on('message', (channel, message) => {
    if (channel !== 'mud:player') return

    try {
      const event: PlayerEvent = JSON.parse(message)

      if (!broadcaster) {
        logger.warn('[PlayerEventSubscriber] no broadcaster set')
        return
      }

      if (event.event === 'login') {
        broadcaster('PLAYER_LOGIN', { pid: event.pid })
      } else if (event.event === 'logout') {
        broadcaster('PLAYER_LOGOUT', { pid: event.pid })
      }

      logger.info(`[PlayerEventSubscriber] ${event.event} pid=${event.pid}`)
    } catch (err) {
      logger.error('[PlayerEventSubscriber] failed to parse message:', message)
    }
  })
}

/**
 * stop the subscriber
 */
export async function stopPlayerEventSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.unsubscribe('mud:player')
    await subscriber.quit()
    subscriber = null
    logger.info('[PlayerEventSubscriber] stopped')
  }
}
