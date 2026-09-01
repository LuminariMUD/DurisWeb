import { pool } from '../db/connection.js';
import { RowDataPacket } from 'mysql2';
import logger from '../utils/logger.js';
import { stripAnsiCodes } from '../utils/stringUtils.js';
import { getWebSetting } from './webSettingsService.js';

// discord embed color
const EMBED_COLOR = 0x5865f2; // discord blurple

const SITE_URL = process.env.SITE_URL;

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

interface DiscordWebhookPayload {
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
  const url = await getWebSetting('discord_webhook_url');
  return enabled === 'true' && !!url;
}

/**
 * get webhook url from settings
 */
async function getWebhookUrl(): Promise<string | null> {
  return await getWebSetting('discord_webhook_url');
}

/**
 * extract player name from description like "[56 Blackguard] Orclife (Orc)"
 */
function extractName(description: string): string | null {
  const match = description.match(/\[\s*\d+\s+[^\]]+\]\s+(\w+)/);
  return match?.[1] || null;
}

/**
 * format participant for discord display
 */
function formatParticipant(participant: BattleParticipant, eventId: number): string {
  const clean = stripAnsiCodes(participant.description).trim();
  const name = participant.name || extractName(clean);

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
      text: `${SITE_URL?.replace(/^https?:\/\//, '')}/pvp/${eventId}`,
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
 * send payload to discord webhook with rate limiting
 */
async function sendWebhookPayload(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<boolean> {
  // rate limiting
  const now = Date.now();
  const elapsed = now - lastPostTime;
  if (elapsed < MIN_POST_INTERVAL) {
    await sleep(MIN_POST_INTERVAL - elapsed);
  }
  lastPostTime = Date.now();

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.error(`[Discord] webhook failed: ${response.status} - ${text}`);
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
    const webhookUrl = await getWebhookUrl();
    if (!webhookUrl) {
      logger.warn('[Discord] webhook url not configured');
      return false;
    }

    const embed = buildBattleEmbed(eventId, stamp, roomName, participants);
    const payload: DiscordWebhookPayload = { embeds: [embed] };

    const success = await sendWebhookPayload(webhookUrl, payload);

    if (success) {
      logger.info(`[Discord] posted battle ${eventId}`);
    }

    return success;
  } catch (error) {
    logger.error('[Discord] post error:', error);
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
    const webhookUrl = await getWebhookUrl();
    if (!webhookUrl) {
      return { success: false, error: 'discord webhook url not configured' };
    }

    // fetch battle data
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        e.id, e.stamp, e.room_name,
        p.player_description, p.pk_type, p.leader
      FROM pkill_event e
      LEFT JOIN pkill_info p ON e.id = p.event_id AND p.inroom = 1
      WHERE e.id = ?`,
      [eventId],
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

    const embed = buildBattleEmbed(event.id, event.stamp, event.room_name, participants);
    const payload: DiscordWebhookPayload = { embeds: [embed] };

    const success = await sendWebhookPayload(webhookUrl, payload);

    if (success) {
      logger.info(`[Discord] manually posted battle ${eventId}`);
      return { success: true };
    }

    return { success: false, error: 'failed to send webhook' };
  } catch (error) {
    logger.error('[Discord] manual post error:', error);
    return { success: false, error: 'internal error' };
  }
}

/**
 * test webhook by sending a test message
 */
export async function testWebhook(
  webhookUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // validate url format
    if (!webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return { success: false, error: 'invalid discord webhook url format' };
    }

    const testEmbed: DiscordEmbed = {
      title: '🧪 Test Message from DurisMUD',
      color: 0x6366f1,
      timestamp: new Date().toISOString(),
      fields: [
        {
          name: 'Status',
          value: 'Discord webhook is working correctly!',
          inline: false,
        },
      ],
      footer: {
        text: 'newduris.com',
      },
    };

    const payload: DiscordWebhookPayload = { embeds: [testEmbed] };
    const success = await sendWebhookPayload(webhookUrl, payload);

    if (success) {
      return { success: true };
    }

    return { success: false, error: 'failed to send test message' };
  } catch (error) {
    logger.error('[Discord] test webhook error:', error);
    return { success: false, error: 'failed to connect to discord' };
  }
}
