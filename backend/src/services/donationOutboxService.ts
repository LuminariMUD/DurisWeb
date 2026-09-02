import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import type { RowDataPacket } from 'mysql2';
import { pool as webPool, mudPool } from '../db/connection.js';
import logger from '../utils/logger.js';
import { buildDonationEvent, DonationDeliveryConfigurationError } from '../utils/donationEvent.js';
import { getScopedRedisConfiguration } from '../utils/scopedRedis.js';
import { isHookEnabledSync } from '../hooks/hookGate.js';
import { recordHookActivity } from '../hooks/hookActivity.js';
import { getBackendConfiguration } from '../config/environment.js';

const OUTBOX_POLL_INTERVAL_MS = 1000;
const OUTBOX_LOCK_TIMEOUT_SECONDS = 120;
const OUTBOX_MAX_ATTEMPTS = 12;
const OUTBOX_MAX_BACKOFF_SECONDS = 300;

interface SeasonRow extends RowDataPacket {
  season_epoch: number | string;
}

interface DonationOutboxRow extends RowDataPacket {
  id: number;
  event_id: string;
  amount_cents: number | string;
  currency: string;
  is_public: boolean | number;
  character_name: string | null;
  message: string | null;
  attempts: number | string;
}

interface DonationDeliveryConfiguration {
  namespace: string;
  secret: string;
  redis: RedisOptions;
}

export function getDonationDeliveryConfiguration(): DonationDeliveryConfiguration {
  const environment = getBackendConfiguration();
  const secret = environment.donationSigningSecret;
  if (!environment.features.donations) {
    throw new DonationDeliveryConfigurationError('Donation delivery is disabled');
  }
  const scoped = getScopedRedisConfiguration('donation', environment);

  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new DonationDeliveryConfigurationError(
      'REDIS_DONATION_SECRET must contain at least 32 bytes',
    );
  }

  return {
    namespace: scoped.namespace,
    secret,
    redis: scoped.options,
  };
}

export function validateDonationDeliveryConfiguration(): void {
  getDonationDeliveryConfiguration();
}

let publisher: Redis | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let activePoll: Promise<void> | null = null;

function errorMessage(error: unknown): string {
  const environment = getBackendConfiguration();
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of [
    environment.mud.bridgeSecret,
    environment.donationSigningSecret,
    environment.scopedRedis?.credentials.donation?.password,
  ].filter(Boolean)) {
    message = message.split(secret!).join('[REDACTED]');
  }
  return message.slice(0, 500);
}

async function claimNextOutboxRow(): Promise<DonationOutboxRow | null> {
  const connection = await webPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<DonationOutboxRow[]>(
      `SELECT id, event_id, amount_cents, currency, is_public, character_name, message, attempts
       FROM donation_outbox
       WHERE (status = 'pending' AND available_at <= UTC_TIMESTAMP())
          OR (status = 'publishing' AND locked_at IS NOT NULL
              AND locked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${OUTBOX_LOCK_TIMEOUT_SECONDS} SECOND))
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
    );

    if (rows.length === 0) {
      await connection.commit();
      return null;
    }

    const row = rows[0];
    await connection.query(
      `UPDATE donation_outbox
       SET status = 'publishing', attempts = attempts + 1,
           locked_at = UTC_TIMESTAMP(), updated_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [row.id],
    );
    await connection.commit();
    return row;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logger.error('donation outbox claim rollback failed:', rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function activeSeasonEpoch(): Promise<number> {
  const [rows] = await mudPool.query<SeasonRow[]>(
    `SELECT season_epoch
     FROM season_reset_state
     WHERE state_id = 1 AND reset_status = 'active'
     LIMIT 1`,
  );
  if (rows.length !== 1) {
    throw new Error('No active MUD season epoch is available');
  }
  const epoch = Number(rows[0].season_epoch);
  if (!Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error('MUD season epoch is invalid');
  }
  return epoch;
}

async function markPublished(id: number): Promise<void> {
  await webPool.query(
    `UPDATE donation_outbox
     SET status = 'published', published_at = UTC_TIMESTAMP(), locked_at = NULL,
         last_error = NULL, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND status = 'publishing'`,
    [id],
  );
}

async function markFailed(id: number, attempts: number, error: unknown): Promise<void> {
  const message = errorMessage(error);
  if (attempts >= OUTBOX_MAX_ATTEMPTS) {
    await webPool.query(
      `UPDATE donation_outbox
       SET status = 'failed', locked_at = NULL, last_error = ?, updated_at = UTC_TIMESTAMP()
       WHERE id = ? AND status = 'publishing'`,
      [message, id],
    );
    return;
  }

  const delaySeconds = Math.min(2 ** Math.min(attempts, 8), OUTBOX_MAX_BACKOFF_SECONDS);
  await webPool.query(
    `UPDATE donation_outbox
     SET status = 'pending', locked_at = NULL,
         available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${delaySeconds} SECOND),
         last_error = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND status = 'publishing'`,
    [message, id],
  );
}

async function processNextOutboxRow(): Promise<void> {
  if (!publisher || publisher.status !== 'ready') return;
  if (!isHookEnabledSync('donation_delivery')) return;
  try {
    const row = await claimNextOutboxRow();
    if (!row) return;

    try {
      const config = getDonationDeliveryConfiguration();
      const event = buildDonationEvent(
        {
          eventId: row.event_id,
          issuedAt: Math.floor(Date.now() / 1000),
          amountCents: Number(row.amount_cents),
          currency: row.currency,
          isPublic: Boolean(row.is_public),
          characterName: row.character_name,
          message: row.message,
          seasonEpoch: await activeSeasonEpoch(),
        },
        config.namespace,
        config.secret,
      );

      await publisher.publish(event.channel, JSON.stringify(event.envelope));
      await markPublished(row.id);
      recordHookActivity('donation_delivery');
      logger.info(`donation outbox published: event_id=${row.event_id}`);
    } catch (error) {
      const attempts = Number(row.attempts) + 1;
      await markFailed(row.id, attempts, error);
      logger.error(
        `donation outbox publish failed: event_id=${row.event_id} attempts=${attempts}:`,
        errorMessage(error),
      );
    }
  } catch (error) {
    logger.error('donation outbox worker failed:', errorMessage(error));
  }
}

function triggerOutboxPoll(): void {
  if (activePoll) return;
  activePoll = processNextOutboxRow().finally(() => {
    activePoll = null;
  });
}

export function startDonationOutboxPublisher(): void {
  if (pollTimer) return;

  let config: DonationDeliveryConfiguration;
  try {
    config = getDonationDeliveryConfiguration();
  } catch (error) {
    logger.warn(`donation outbox disabled: ${errorMessage(error)}`);
    return;
  }

  publisher = new Redis({
    ...config.redis,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 10_000,
    commandTimeout: 10_000,
    retryStrategy(times) {
      return Math.min(times * 1000, 60_000);
    },
  });
  publisher.on('connect', () => logger.info('Donation Redis publisher connected'));
  publisher.on('error', (error) => logger.error('Donation Redis publisher error:', error.message));
  pollTimer = setInterval(() => {
    triggerOutboxPoll();
  }, OUTBOX_POLL_INTERVAL_MS);
  triggerOutboxPoll();
  logger.info('Donation outbox publisher started');
}

export async function stopDonationOutboxPublisher(): Promise<void> {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (activePoll) await activePoll;
  if (publisher) {
    const current = publisher;
    publisher = null;
    try {
      await current.quit();
    } catch (error) {
      logger.error('Donation Redis publisher close failed:', errorMessage(error));
      current.disconnect();
    }
  }
}
