import { createHash, randomBytes } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db/connection.js';
import { getBackendConfiguration } from '../config/environment.js';
import { postBattleToDiscord, type DiscordDeliveryResult } from './discordService.js';
import { pvpTimestamp, pvpVisibilitySql } from './pvpVisibility.js';
import logger from '../utils/logger.js';

export const DISCORD_DELIVERY_BATCH_SIZE = 100;
const MAX_BACKOFF_SECONDS = 3600;

/** Database-scoped lock also serializes manual posts, settings changes and recovery. */
async function withDeliveryLock<T>(
  action: (connection: PoolConnection) => Promise<T>,
): Promise<T | undefined> {
  const connection = await pool.getConnection();
  const database = getBackendConfiguration().database.database;
  const lockName = `durisweb:pvp-discord:${createHash('sha256').update(database).digest('hex').slice(0, 16)}`;
  let acquired = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT GET_LOCK(?, 0) AS acquired', [
      lockName,
    ]);
    acquired = Number(rows[0]?.acquired) === 1;
    if (!acquired) return undefined;
    return await action(connection);
  } finally {
    if (acquired) {
      try {
        await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
      } catch {
        // Never return a connection with an uncertain advisory lock to the pool.
        connection.destroy();
      }
    }
    connection.release();
  }
}

/** Fresh reads make disable/delay changes effective before the next send on any process. */
async function readDeliverySettings(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT setting_key, setting_value FROM web_settings
     WHERE setting_key IN ('discord_webhook_enabled', 'pvp_delay_minutes')`,
  );
  const values = new Map(rows.map((row) => [row.setting_key, String(row.setting_value)]));
  const enabled = values.get('discord_webhook_enabled');
  const delay = values.get('pvp_delay_minutes');
  if (
    !['true', 'false'].includes(enabled || '') ||
    !/^\d+$/.test(delay || '') ||
    Number(delay) > 1440
  ) {
    throw new Error('Discord delivery settings are missing or invalid');
  }
  return { enabled: enabled === 'true', delay: Number(delay) };
}

async function activateDestination(connection: PoolConnection, channelId: string) {
  await connection.query(
    `INSERT INTO web_pvp_discord_destinations
      (channel_id, boundary_event_id, activated_at, available_at)
     SELECT ?, COALESCE(MAX(id), 0), UTC_TIMESTAMP(), UTC_TIMESTAMP() FROM pkill_event
     ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)`,
    [channelId],
  );
}

/** Commit first-enable boundary with the toggle, not on a later timer tick. */
export async function setDiscordAutoPosting(enabled: boolean, updatedBy: string): Promise<void> {
  const result = await withDeliveryLock(async (connection) => {
    await connection.beginTransaction();
    try {
      const bot = getBackendConfiguration().discordBot;
      if (enabled && !bot)
        throw new Error('Configure the Discord bot before enabling automatic posts');
      if (enabled && bot) await activateDestination(connection, bot.channelId);
      await connection.query(
        `INSERT INTO web_settings (setting_key, setting_value, updated_by, updated_at)
         VALUES ('discord_webhook_enabled', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value),
           updated_by = VALUES(updated_by), updated_at = NOW()`,
        [String(enabled), updatedBy],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
  if (!result) throw new Error('Discord delivery is busy; retry the setting change');
}

async function queueBattle(connection: PoolConnection, channelId: string, eventId: number) {
  await connection.query(
    `INSERT INTO web_pvp_discord_deliveries
      (channel_id, event_id, nonce, available_at, created_at, updated_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`,
    [channelId, eventId, randomBytes(12).toString('hex')],
  );
}

async function attemptBattle(
  connection: PoolConnection,
  channelId: string,
  eventId: number,
  manual: boolean,
): Promise<DiscordDeliveryResult | undefined> {
  const settings = await readDeliverySettings(connection);
  if (!manual && !settings.enabled) return undefined;
  const [battle] = await connection.query<RowDataPacket[]>(
    `SELECT e.id, UNIX_TIMESTAMP(e.stamp) AS stamp_epoch, e.room_name,
       p.player_description, p.pk_type, p.leader
     FROM pkill_event e LEFT JOIN pkill_info p ON p.event_id = e.id AND p.inroom = 1
     WHERE e.id = ? AND ${pvpVisibilitySql()}`,
    [eventId, settings.delay],
  );
  if (!battle.length) return undefined;
  await queueBattle(connection, channelId, eventId);
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT * FROM web_pvp_discord_deliveries WHERE channel_id = ? AND event_id = ?',
    [channelId, eventId],
  );
  const delivery = rows[0];
  // A manual repost after confirmed success must not erase that receipt on failure.
  const alreadyDelivered = delivery.status === 'delivered';
  if (alreadyDelivered && !manual) return undefined;
  if (!alreadyDelivered) {
    await connection.query(
      `UPDATE web_pvp_discord_deliveries SET status = 'sending', attempts = attempts + 1,
       available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 SECOND), updated_at = UTC_TIMESTAMP()
       WHERE channel_id = ? AND event_id = ?`,
      [channelId, eventId],
    );
  }
  const participants = battle
    .filter((row) => row.player_description)
    .map((row) => ({
      description: String(row.player_description),
      pk_type: String(row.pk_type),
      leader: !!row.leader,
    }));
  const result = await postBattleToDiscord(
    eventId,
    pvpTimestamp(battle[0].stamp_epoch),
    battle[0].room_name || 'Unknown',
    participants,
    // Each explicit manual post is intentional; automatic retries reuse the stored nonce.
    manual ? undefined : { channelId, nonce: String(delivery.nonce) },
  );
  if (result.status === 'delivered' && !alreadyDelivered) {
    await connection.query(
      `UPDATE web_pvp_discord_deliveries SET status = 'delivered', delivered_at = UTC_TIMESTAMP(),
       delivered_by = ?, message_id = ?, error_code = NULL, updated_at = UTC_TIMESTAMP()
       WHERE channel_id = ? AND event_id = ?`,
      [manual ? 'manual' : 'automatic', result.messageId, channelId, eventId],
    );
  } else if (result.status !== 'delivered' && !alreadyDelivered) {
    const seconds =
      result.status === 'retry'
        ? Math.max(
            Math.ceil(result.retryAfterMs / 1000),
            Math.min(MAX_BACKOFF_SECONDS, 30 * 2 ** Math.min(Number(delivery.attempts), 7)),
          )
        : 0;
    await connection.query(
      `UPDATE web_pvp_discord_deliveries SET status = ?, error_code = ?,
       ambiguous = ambiguous OR ?, available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
       updated_at = UTC_TIMESTAMP() WHERE channel_id = ? AND event_id = ?`,
      [
        result.status === 'retry' ? 'pending' : 'failed',
        result.code,
        result.status === 'retry' && result.ambiguous,
        seconds,
        channelId,
        eventId,
      ],
    );
  }
  if (
    result.status === 'failed' &&
    ['unauthorized', 'forbidden', 'not_found', 'not_configured', 'destination_changed'].includes(
      result.code,
    )
  ) {
    await connection.query(
      'UPDATE web_pvp_discord_destinations SET blocked_reason = ? WHERE channel_id = ?',
      [result.code, channelId],
    );
  } else if (result.status === 'retry') {
    // A failing channel should not receive one request per queued event in this batch.
    const seconds = Math.max(
      Math.ceil(result.retryAfterMs / 1000),
      Math.min(MAX_BACKOFF_SECONDS, 30 * 2 ** Math.min(Number(delivery.attempts), 7)),
    );
    await connection.query(
      'UPDATE web_pvp_discord_destinations SET available_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND) WHERE channel_id = ?',
      [seconds, channelId],
    );
  }
  return result;
}

/** One bounded pass; independent of browser notifications and their in-memory cursor. */
export async function pollDiscordDeliveries(): Promise<void> {
  const bot = getBackendConfiguration().discordBot;
  if (!bot) return;
  await withDeliveryLock(async (connection) => {
    const settings = await readDeliverySettings(connection);
    if (settings.enabled) await activateDestination(connection, bot.channelId);
    const [destinations] = await connection.query<RowDataPacket[]>(
      'SELECT *, available_at <= UTC_TIMESTAMP() AS ready FROM web_pvp_discord_destinations WHERE channel_id = ?',
      [bot.channelId],
    );
    if (!destinations.length) return;
    const destination = destinations[0];
    const [events] = await connection.query<RowDataPacket[]>(
      `SELECT e.id FROM pkill_event e
       LEFT JOIN web_pvp_discord_deliveries d ON d.event_id = e.id AND d.channel_id = ?
       WHERE e.id > ? AND d.event_id IS NULL AND ${pvpVisibilitySql()}
       ORDER BY e.stamp, e.id LIMIT ?`,
      [bot.channelId, destination.boundary_event_id, settings.delay, DISCORD_DELIVERY_BATCH_SIZE],
    );
    for (const event of events) await queueBattle(connection, bot.channelId, Number(event.id));
    if (!settings.enabled || destination.blocked_reason || !destination.ready) return;
    // Holding the installation lock proves no healthy worker owns a previous sending row.
    // Wait out the bounded HTTP attempt before recovering its uncertain outcome.
    await connection.query(
      `UPDATE web_pvp_discord_deliveries SET status = 'pending', ambiguous = 1,
       error_code = 'interrupted', updated_at = UTC_TIMESTAMP()
       WHERE channel_id = ? AND status = 'sending' AND available_at <= UTC_TIMESTAMP()`,
      [bot.channelId],
    );
    const [pending] = await connection.query<RowDataPacket[]>(
      `SELECT d.event_id FROM web_pvp_discord_deliveries d JOIN pkill_event e ON e.id = d.event_id
       WHERE d.channel_id = ? AND d.status = 'pending' AND d.available_at <= UTC_TIMESTAMP()
         AND ${pvpVisibilitySql()} ORDER BY e.stamp, e.id LIMIT ?`,
      [bot.channelId, settings.delay, DISCORD_DELIVERY_BATCH_SIZE],
    );
    for (const delivery of pending) {
      const result = await attemptBattle(
        connection,
        bot.channelId,
        Number(delivery.event_id),
        false,
      );
      if (
        !result ||
        result.status === 'retry' ||
        (result.status === 'failed' &&
          result.code !== 'invalid_payload' &&
          result.code !== 'http_error')
      )
        break;
    }
  });
}

/** A successful explicit post also satisfies this destination's automatic delivery. */
export async function manualPostBattle(
  eventId: number,
): Promise<{ success: boolean; error?: string }> {
  const bot = getBackendConfiguration().discordBot;
  if (!bot) return { success: false, error: 'Discord bot is not configured' };
  try {
    const result = await withDeliveryLock((connection) =>
      attemptBattle(connection, bot.channelId, eventId, true),
    );
    return result?.status === 'delivered'
      ? { success: true }
      : {
          success: false,
          error: result
            ? `Discord delivery: ${result.code}`
            : 'Battle is unavailable or delivery is busy',
        };
  } catch {
    logger.error(`[Discord] battle ${eventId}: delivery_state_error`);
    return {
      success: false,
      error: 'Delivery state could not be saved; check status before retrying',
    };
  }
}

export interface DiscordDeliveryStatus {
  configured: boolean;
  enabled: boolean;
  channelId: string | null;
  activated: boolean;
  blockedReason: string | null;
  nextAttemptAt: string | null;
  pending: number;
  failed: number;
  uncertain: number;
  lastAutomaticSuccess: { eventId: number; at: string } | null;
  outstanding: Array<{
    eventId: number;
    status: string;
    attempts: number;
    ambiguous: boolean;
    errorCode: string | null;
    nextAttemptAt: string;
  }>;
  otherDestinations: Array<{ channelId: string; outstanding: number }>;
}

const STATUS_TIME_FORMAT = '%Y-%m-%dT%H:%i:%sZ';

/** Read-only operator view: no configuration token, response body, or player payload. */
export async function getDiscordDeliveryStatus(): Promise<DiscordDeliveryStatus> {
  const bot = getBackendConfiguration().discordBot;
  const connection = await pool.getConnection();
  try {
    const settings = await readDeliverySettings(connection);
    const currentChannel = bot?.channelId || '';
    const [destinations] = await connection.query<RowDataPacket[]>(
      `SELECT channel_id, blocked_reason, DATE_FORMAT(available_at, ?) AS available_at
       FROM web_pvp_discord_destinations WHERE channel_id = ?`,
      [STATUS_TIME_FORMAT, currentChannel],
    );
    const [counts] = await connection.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(status IN ('pending', 'sending')), 0) AS pending,
       COALESCE(SUM(status = 'failed'), 0) AS failed, COALESCE(SUM(ambiguous), 0) AS uncertain
       FROM web_pvp_discord_deliveries WHERE channel_id = ?`,
      [currentChannel],
    );
    const [last] = await connection.query<RowDataPacket[]>(
      `SELECT event_id, DATE_FORMAT(delivered_at, ?) AS delivered_at FROM web_pvp_discord_deliveries
       WHERE channel_id = ? AND status = 'delivered' AND delivered_by = 'automatic'
       ORDER BY delivered_at DESC, event_id DESC LIMIT 1`,
      [STATUS_TIME_FORMAT, currentChannel],
    );
    const [outstanding] = await connection.query<RowDataPacket[]>(
      `SELECT event_id, status, attempts, ambiguous, error_code, DATE_FORMAT(available_at, ?) AS available_at
       FROM web_pvp_discord_deliveries WHERE channel_id = ? AND (status != 'delivered' OR ambiguous = 1)
       ORDER BY (status = 'failed') DESC, updated_at DESC, event_id DESC LIMIT 50`,
      [STATUS_TIME_FORMAT, currentChannel],
    );
    const [other] = await connection.query<RowDataPacket[]>(
      `SELECT channel_id, COUNT(*) AS outstanding FROM web_pvp_discord_deliveries
       WHERE channel_id != ? AND status != 'delivered' GROUP BY channel_id ORDER BY channel_id`,
      [currentChannel],
    );
    return {
      configured: !!bot,
      enabled: settings.enabled,
      channelId: bot?.channelId || null,
      activated: destinations.length > 0,
      blockedReason: destinations[0]?.blocked_reason || null,
      nextAttemptAt: destinations[0]?.available_at || null,
      pending: Number(counts[0].pending),
      failed: Number(counts[0].failed),
      uncertain: Number(counts[0].uncertain),
      lastAutomaticSuccess: last.length
        ? { eventId: Number(last[0].event_id), at: String(last[0].delivered_at) }
        : null,
      outstanding: outstanding.map((row) => ({
        eventId: Number(row.event_id),
        status: String(row.status),
        attempts: Number(row.attempts),
        ambiguous: !!row.ambiguous,
        errorCode: row.error_code || null,
        nextAttemptAt: String(row.available_at),
      })),
      otherDestinations: other.map((row) => ({
        channelId: String(row.channel_id),
        outstanding: Number(row.outstanding),
      })),
    };
  } finally {
    connection.release();
  }
}

/** Requeue failed work only; never resend receipts, override cooldowns, or enable posting. */
export async function retryFailedDiscordDeliveries(): Promise<boolean> {
  const bot = getBackendConfiguration().discordBot;
  if (!bot) return false;
  const result = await withDeliveryLock(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.query(
        `UPDATE web_pvp_discord_deliveries SET status = 'pending', error_code = NULL,
         updated_at = UTC_TIMESTAMP() WHERE channel_id = ? AND status = 'failed'`,
        [bot.channelId],
      );
      await connection.query(
        'UPDATE web_pvp_discord_destinations SET blocked_reason = NULL WHERE channel_id = ?',
        [bot.channelId],
      );
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
  return result === true;
}
