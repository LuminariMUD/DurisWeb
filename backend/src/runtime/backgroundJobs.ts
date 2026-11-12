import type { WebSocketServer } from 'ws';
import logger from '../utils/logger.js';
import { pool } from '../db/connection.js';
import { getBackendConfiguration } from '../config/environment.js';
import { createPvpPoller, PVP_POLL_INTERVAL_MS } from '../services/pvpPolling.js';
import { getLatestReleasedEvent, getReleasedEventsAfter } from '../services/pvpService.js';
import { pollDiscordDeliveries } from '../services/pvpDiscordDelivery.js';
import { startGuildSync, stopGuildSync } from '../services/guildSyncService.js';
import { updateWebSocketCount } from '../services/serverHealthService.js';
import {
  startMudAuctionClient,
  stopMudAuctionClient,
  setAuctionBroadcaster,
} from '../services/mudAuctionClient.js';
import {
  startPlayerEventSubscriber,
  stopPlayerEventSubscriber,
  setPlayerEventBroadcaster,
} from '../services/playerEventSubscriber.js';
import {
  startDonationOutboxPublisher,
  stopDonationOutboxPublisher,
} from '../services/donationOutboxService.js';
import { startHookAuditWorker, stopHookAuditWorker } from '../hooks/hookToggleJournal.js';
import {
  setNotificationBroadcaster,
  setNewsBroadcaster,
  notifyPvpBattle,
} from '../services/unifiedNotificationService.js';
import { cleanupOrphanImages } from '../services/postImageService.js';
import type { PvPEventListItem } from '../types/index.js';
import {
  broadcastAuctionEvent,
  broadcastBackupProgress,
  broadcastFragUpdate,
  broadcastMudControlOutput,
  broadcastMudStateChange,
  broadcastNewEvent,
  broadcastNewsUpdate,
  broadcastNotification,
  broadcastPlayerEvent,
} from '../realtime/broadcasts.js';

/** Stop handles for every job and integration started after the listener exists. */
export interface BackgroundJobs {
  /** Stop producers that feed sockets or the MUD; runs before the web server closes. */
  stopProducers(): Promise<void>;
  /** Stop durable workers; runs after the web server and terminals are closed. */
  stopWorkers(): Promise<void>;
}

let started = false;

async function publishReleasedEvent(latestEvent: PvPEventListItem) {
  broadcastNewEvent(latestEvent);
  try {
    await notifyPvpBattle(
      latestEvent.id,
      latestEvent.victims,
      latestEvent.killers,
      latestEvent.room_name || 'Unknown',
    );
  } catch (error) {
    logger.error('failed to send pvp push notification:', error);
  }
}

/**
 * Start the existing jobs once, with their cadences unchanged. `register` receives the stop
 * handles before anything starts, so a failure part-way stops only what already started.
 * `checkAborted` throws once shutdown has begun; it runs before each start that follows an
 * await, because shutdown may already have run `stopProducers` during that await.
 */
export async function startBackgroundJobs(
  wss: WebSocketServer,
  register: (jobs: BackgroundJobs) => void,
  checkAborted: () => void,
): Promise<void> {
  if (started) throw new Error('Background jobs are already started');
  started = true;

  const environment = getBackendConfiguration();
  const intervals: NodeJS.Timeout[] = [];
  let guildSync = false;
  let healthMonitoring = false;
  let backupScheduler = false;
  let auctionClient = false;
  let playerEvents = false;
  let donationOutbox = false;
  let hookAuditWorker = false;

  register({
    async stopProducers() {
      for (const interval of intervals.splice(0)) clearInterval(interval);
      if (guildSync) stopGuildSync();
      if (healthMonitoring) {
        const { stopHealthMonitoring } = await import('../services/serverHealthService.js');
        stopHealthMonitoring();
      }
      if (backupScheduler) {
        const { stopHourlyBackupScheduler } = await import('../services/backupService.js');
        stopHourlyBackupScheduler();
      }
      if (auctionClient) stopMudAuctionClient();
      if (playerEvents) await stopPlayerEventSubscriber();
      guildSync = healthMonitoring = backupScheduler = auctionClient = playerEvents = false;
    },
    async stopWorkers() {
      if (donationOutbox) await stopDonationOutboxPublisher();
      if (hookAuditWorker) await stopHookAuditWorker();
      donationOutbox = hookAuditWorker = false;
      started = false;
    },
  });

  // Begin after the newest visible battle; restarting must not replay old notifications.
  const initialCursor = (await getLatestReleasedEvent()) || {
    id: 0,
    stamp: '1970-01-01T00:00:00.000Z',
  };
  checkAborted();
  const pollReleasedEvents = createPvpPoller(
    initialCursor,
    getReleasedEventsAfter,
    publishReleasedEvent,
  );

  // Poll database for every newly released event without overlapping runs.
  const checkForNewEvents = async () => {
    try {
      await pollReleasedEvents();
    } catch (error) {
      logger.error('Error checking for new events:', error);
    }
  };

  // Track last frag update timestamp for change detection
  let lastFragUpdateCheck = new Date();
  let fragPollRunning = false;
  const checkForFragUpdates = async () => {
    if (fragPollRunning) return;
    fragPollRunning = true;
    try {
      // Query for any frag records updated since last check
      const [rows] = await pool.query<any[]>(
        'SELECT COUNT(*) as count FROM frag_leaderboard WHERE last_updated > ?',
        [lastFragUpdateCheck],
      );

      if (rows[0].count > 0) {
        // Update timestamp and broadcast
        lastFragUpdateCheck = new Date();
        await broadcastFragUpdate();
      }
    } catch (error) {
      logger.error('Error checking for frag updates:', error);
    } finally {
      fragPollRunning = false;
    }
  };

  // Release delay is evaluated by every query; timer cadence stays positive and independent.
  logger.info(`PvP/frag polling interval set to ${PVP_POLL_INTERVAL_MS / 1000} seconds`);
  intervals.push(setInterval(checkForNewEvents, PVP_POLL_INTERVAL_MS));
  intervals.push(setInterval(checkForFragUpdates, PVP_POLL_INTERVAL_MS));
  const checkDiscord = () => {
    void pollDiscordDeliveries().catch(() => logger.error('[Discord] delivery_state_error'));
  };
  intervals.push(setInterval(checkDiscord, PVP_POLL_INTERVAL_MS));
  checkDiscord();

  // Start guild auto-access sync service (polls every 5 minutes)
  if (environment.features.guildSync) {
    startGuildSync();
    guildSync = true;
    logger.info('Guild sync service enabled');
  } else {
    logger.info('Guild sync service disabled');
  }

  // Start server health monitoring (records metrics every 5 minutes)
  const { startHealthMonitoring } = await import('../services/serverHealthService.js');
  checkAborted();
  startHealthMonitoring();
  healthMonitoring = true;
  logger.info('Server health monitoring started');

  // Update WebSocket connection count every 10 seconds
  intervals.push(setInterval(() => updateWebSocketCount(wss.clients.size), 10000));

  // Initialize GeoIP database
  const { initializeGeoIP } = await import('../utils/geoip.js');
  await initializeGeoIP();

  // Initialize backup service broadcaster and scheduler
  const { setProgressBroadcaster, startHourlyBackupScheduler } = await import(
    '../services/backupService.js'
  );
  checkAborted();
  setProgressBroadcaster(broadcastBackupProgress);
  startHourlyBackupScheduler();
  backupScheduler = true;
  logger.info('Backup service initialized with hourly scheduler');

  // Initialize MUD control service broadcasters
  const { setStateBroadcaster, setOutputBroadcaster } = await import(
    '../services/mudControlService.js'
  );
  setStateBroadcaster(broadcastMudStateChange);
  setOutputBroadcaster(broadcastMudControlOutput);
  logger.info('MUD control service initialized');

  // Initialize MUD auction websocket client
  checkAborted();
  setAuctionBroadcaster(broadcastAuctionEvent);
  startMudAuctionClient();
  auctionClient = true;
  logger.info('MUD auction client started');

  // Initialize player event subscriber (redis pub/sub for login/logout)
  setPlayerEventBroadcaster(broadcastPlayerEvent);
  if (environment.features.mudRedis) {
    playerEvents = true;
    await startPlayerEventSubscriber();
    logger.info('Player event subscriber initialized');
  }
  checkAborted();

  // Initialize the durable donation outbox. It remains disabled until its
  // production delivery settings and independent HMAC secret are present.
  if (environment.features.donations) {
    startDonationOutboxPublisher();
    donationOutbox = true;
  }
  startHookAuditWorker();
  hookAuditWorker = true;

  setNotificationBroadcaster(broadcastNotification);
  logger.info('Notification broadcaster initialized');
  setNewsBroadcaster(broadcastNewsUpdate);
  logger.info('News broadcaster initialized');

  // Start orphan image cleanup job (every hour)
  intervals.push(
    setInterval(
      async () => {
        try {
          const deleted = await cleanupOrphanImages();
          if (deleted > 0) {
            logger.info(`Cleaned up ${deleted} orphan forum images`);
          }
        } catch (error) {
          logger.error('Error cleaning up orphan images:', error);
        }
      },
      60 * 60 * 1000,
    ),
  );
  logger.info('Orphan image cleanup service started');
}
