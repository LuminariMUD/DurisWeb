import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import logger from '../utils/logger.js';
import { stripAnsiCodes, extractPlayerName } from '../utils/stringUtils.js';
import { getPvpDelayMinutes, pvpVisibilitySql, pvpTimestamp } from './pvpVisibility.js';
import { getWebSetting } from './webSettingsService.js';
import { getBackendConfiguration } from '../config/environment.js';

// discord embed color
const EMBED_COLOR = 0x5865f2; // discord blurple

const SITE_URL = getBackendConfiguration().siteUrl;

// rate limiting
let lastPostTime = 0;
const MIN_POST_INTERVAL = 500;
let sending = false;
let rateLimitedUntil = 0;

export type DiscordDeliveryResult =
  | { status: 'delivered'; messageId: string }
  | {
      status: 'retry';
      code: 'busy' | 'rate_limited' | 'server_error' | 'network_error' | 'invalid_response';
      retryAfterMs: number;
      ambiguous: boolean;
    }
  | {
      status: 'failed';
      code:
        | 'not_configured'
        | 'destination_changed'
        | 'invalid_payload'
        | 'unauthorized'
        | 'forbidden'
        | 'not_found'
        | 'http_error';
    };

/** Persist this nonce with the delivery, and reuse it only for that delivery. */
export interface DiscordDeliveryIdentity {
  channelId: string;
  nonce: string;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  timestamp: string;
  url?: string;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
}

interface DiscordPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

interface BattleParticipant {
  description: string;
  name?: string;
  pk_type: string;
  leader?: boolean;
}

/**
 * check if discord posting is enabled
 */
export async function isDiscordEnabled(): Promise<boolean> {
  const enabled = await getWebSetting('discord_webhook_enabled');
  return enabled === 'true' && !!getBackendConfiguration().discordBot;
}

/**
 * format participant for discord display
 */
function formatParticipant(participant: BattleParticipant, eventId: number): string {
  const clean = stripAnsiCodes(participant.description).trim();
  const name = participant.name || extractPlayerName(clean);

  let suffix = '';
  if (participant.leader) suffix += ' 👑';
  if (participant.pk_type === 'VICTIM') suffix += ' 🩸';

  if (name) {
    const logUrl = `${SITE_URL}/pvp/${eventId}?pov=${encodeURIComponent(name)}`;
    return `[${clean}](${logUrl})${suffix}`;
  }

  return `${clean}${suffix}`;
}

/**
 * build discord embed for a battle
 */
function buildBattleEmbed(
  eventId: number,
  stamp: Date | string,
  roomName: string,
  participants: BattleParticipant[],
): DiscordEmbed {
  const killers = participants.filter((p) => p.pk_type.includes('KILLER'));
  const victims = participants.filter((p) => p.pk_type.includes('VICTIM'));

  const cleanRoom = stripAnsiCodes(roomName);
  const battleUrl = `${SITE_URL}/pvp/${eventId}`;
  const timestamp = stamp instanceof Date ? stamp.toISOString() : new Date(stamp).toISOString();

  const killerLines = killers.map((k) => formatParticipant(k, eventId)).join('\n');
  const victimLines = victims.map((v) => formatParticipant(v, eventId)).join('\n');

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (killerLines) {
    fields.push({
      name: '⚔️ Killers',
      value: killerLines,
      inline: true,
    });
  }

  if (victimLines) {
    fields.push({
      name: '💀 Victims',
      value: victimLines,
      inline: true,
    });
  }

  return {
    title: `⚔️ PvP Battle at ${cleanRoom}`,
    color: EMBED_COLOR,
    timestamp,
    url: battleUrl,
    fields,
    footer: {
      text: `${SITE_URL.replace(/^https?:\/\//, '')}/pvp/${eventId}`,
    },
  };
}

/**
 * sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * send payload through the configured Discord bot with rate limiting
 */
function retryDelayMs(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return 0;
  const milliseconds = Math.ceil(Number(value) * 1000);
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : 0;
}

async function sendDiscordPayload(
  payload: DiscordPayload,
  identity?: DiscordDeliveryIdentity,
): Promise<DiscordDeliveryResult> {
  const bot = getBackendConfiguration().discordBot;
  if (!bot) return { status: 'failed', code: 'not_configured' };
  if (identity && identity.channelId !== bot.channelId) {
    return { status: 'failed', code: 'destination_changed' };
  }
  if (identity && !/^[a-zA-Z0-9_-]{1,25}$/.test(identity.nonce)) {
    return { status: 'failed', code: 'invalid_payload' };
  }
  if (sending) {
    return { status: 'retry', code: 'busy', retryAfterMs: MIN_POST_INTERVAL, ambiguous: false };
  }
  if (rateLimitedUntil > Date.now()) {
    return {
      status: 'retry',
      code: 'rate_limited',
      retryAfterMs: rateLimitedUntil - Date.now(),
      ambiguous: false,
    };
  }

  sending = true;
  try {
    const elapsed = Date.now() - lastPostTime;
    if (elapsed < MIN_POST_INTERVAL) await sleep(MIN_POST_INTERVAL - elapsed);
    lastPostTime = Date.now();
    const response = await fetch(`https://discord.com/api/v10/channels/${bot.channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${bot.token}` },
      body: JSON.stringify({
        ...payload,
        allowed_mentions: { parse: [] },
        ...(identity ? { nonce: identity.nonce, enforce_nonce: true } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    });
    // Never retain Discord response text: it can echo content or credentials.
    const body: unknown = await response.json().catch(() => null);
    const fields = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const retryAfterMs = Math.max(
      retryDelayMs(response.headers.get('Retry-After')),
      retryDelayMs(response.headers.get('X-RateLimit-Reset-After')),
      retryDelayMs(fields.retry_after),
    );
    if (response.status === 429 || response.headers.get('X-RateLimit-Remaining') === '0') {
      rateLimitedUntil = Date.now() + Math.max(retryAfterMs || 60_000, 1000);
    }
    if (response.ok) {
      if (typeof fields.id === 'string' && /^\d{1,20}$/.test(fields.id)) {
        return { status: 'delivered', messageId: fields.id };
      }
      return { status: 'retry', code: 'invalid_response', retryAfterMs: 30_000, ambiguous: true };
    }
    if (response.status === 429) {
      return {
        status: 'retry',
        code: 'rate_limited',
        retryAfterMs: rateLimitedUntil - Date.now(),
        ambiguous: false,
      };
    }
    if (response.status >= 500 || response.status === 408) {
      return {
        status: 'retry',
        code: 'server_error',
        retryAfterMs: Math.max(retryAfterMs, 30_000),
        ambiguous: true,
      };
    }
    const code =
      response.status === 401
        ? 'unauthorized'
        : response.status === 403
          ? 'forbidden'
          : response.status === 404
            ? 'not_found'
            : response.status === 400
              ? 'invalid_payload'
              : 'http_error';
    return { status: 'failed', code };
  } catch {
    return { status: 'retry', code: 'network_error', retryAfterMs: 30_000, ambiguous: true };
  } finally {
    sending = false;
  }
}

/**
 * post battle to discord (called automatically when battles occur)
 * One attempt only. The scheduler owns durable retry and recovery decisions.
 */
export async function postBattleToDiscord(
  eventId: number,
  stamp: Date | string,
  roomName: string,
  participants: BattleParticipant[],
  identity?: DiscordDeliveryIdentity,
): Promise<DiscordDeliveryResult> {
  try {
    const embed = buildBattleEmbed(eventId, stamp, roomName, participants);
    const payload: DiscordPayload = { embeds: [embed] };

    const result = await sendDiscordPayload(payload, identity);

    if (result.status === 'delivered') {
      logger.info(`[Discord] posted battle ${eventId}`);
    } else {
      logger.warn(`[Discord] battle ${eventId}: ${result.code}`);
    }

    return result;
  } catch {
    logger.error(`[Discord] battle ${eventId}: invalid_payload`);
    return { status: 'failed', code: 'invalid_payload' };
  }
}

/**
 * manually post a specific battle to discord (for admin button)
 */
export async function manualPostBattle(
  eventId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!getBackendConfiguration().discordBot) {
      return { success: false, error: 'Discord bot is not configured' };
    }

    // fetch battle data
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        e.id, UNIX_TIMESTAMP(e.stamp) AS stamp_epoch, e.room_name,
        p.player_description, p.pk_type, p.leader
      FROM pkill_event e
      LEFT JOIN pkill_info p ON e.id = p.event_id AND p.inroom = 1
      WHERE e.id = ? AND ${pvpVisibilitySql()}`,
      [eventId, await getPvpDelayMinutes()],
    );

    if (rows.length === 0) {
      return { success: false, error: 'battle not found' };
    }

    const event = rows[0];
    const participants: BattleParticipant[] = rows
      .filter((r) => r.player_description)
      .map((r) => ({
        description: r.player_description,
        pk_type: r.pk_type,
        leader: !!r.leader,
      }));

    const embed = buildBattleEmbed(
      event.id,
      pvpTimestamp(event.stamp_epoch),
      event.room_name,
      participants,
    );
    const payload: DiscordPayload = { embeds: [embed] };

    const result = await sendDiscordPayload(payload);

    if (result.status === 'delivered') {
      logger.info(`[Discord] manually posted battle ${eventId}`);
      return { success: true };
    }

    return {
      success: false,
      error: 'Failed to send to Discord; check bot channel permissions and try again',
    };
  } catch {
    logger.error('[Discord] manual post failed');
    return { success: false, error: 'internal error' };
  }
}

/**
 * test the configured bot by sending a test message
 */
export async function testDiscordBot(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!getBackendConfiguration().discordBot) {
      return { success: false, error: 'Discord bot is not configured' };
    }

    const testEmbed: DiscordEmbed = {
      title: '🧪 Test Message from DurisMUD',
      color: 0x6366f1,
      timestamp: new Date().toISOString(),
      fields: [
        {
          name: 'Status',
          value: 'Discord bot is working correctly!',
          inline: false,
        },
      ],
      footer: {
        text: new URL(SITE_URL).host,
      },
    };

    const payload: DiscordPayload = { embeds: [testEmbed] };
    const result = await sendDiscordPayload(payload);

    if (result.status === 'delivered') {
      return { success: true };
    }

    return { success: false, error: 'failed to send test message' };
  } catch {
    logger.error('[Discord] bot test failed');
    return { success: false, error: 'failed to connect to discord' };
  }
}
