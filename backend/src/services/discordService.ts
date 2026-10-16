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
async function sendDiscordPayload(payload: DiscordPayload): Promise<boolean> {
  const bot = getBackendConfiguration().discordBot;
  if (!bot) return false;

  // rate limiting
  const now = Date.now();
  const elapsed = now - lastPostTime;
  if (elapsed < MIN_POST_INTERVAL) {
    await sleep(MIN_POST_INTERVAL - elapsed);
  }
  lastPostTime = Date.now();

  const response = await fetch(`https://discord.com/api/v10/channels/${bot.channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bot ${bot.token}` },
    body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    logger.error(`[Discord] bot delivery failed: HTTP ${response.status}`);
    return false;
  }

  return true;
}

/**
 * post battle to discord (called automatically when battles occur)
 * fire-and-forget pattern - errors are logged but don't fail the caller
 */
export async function postBattleToDiscord(
  eventId: number,
  stamp: Date | string,
  roomName: string,
  participants: BattleParticipant[],
): Promise<boolean> {
  try {
    if (!getBackendConfiguration().discordBot) {
      logger.warn('[Discord] bot not configured');
      return false;
    }

    const embed = buildBattleEmbed(eventId, stamp, roomName, participants);
    const payload: DiscordPayload = { embeds: [embed] };

    const success = await sendDiscordPayload(payload);

    if (success) {
      logger.info(`[Discord] posted battle ${eventId}`);
    }

    return success;
  } catch {
    logger.error('[Discord] post failed');
    return false;
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

    const success = await sendDiscordPayload(payload);

    if (success) {
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
    const success = await sendDiscordPayload(payload);

    if (success) {
      return { success: true };
    }

    return { success: false, error: 'failed to send test message' };
  } catch {
    logger.error('[Discord] bot test failed');
    return { success: false, error: 'failed to connect to discord' };
  }
}
