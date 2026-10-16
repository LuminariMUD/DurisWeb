import logger from '../utils/logger.js';
import { stripAnsiCodes, extractPlayerName } from '../utils/stringUtils.js';
import { getBackendConfiguration } from '../config/environment.js';

// discord embed color
const EMBED_COLOR = 0x5865f2; // discord blurple

const SITE_URL = getBackendConfiguration().siteUrl;

// rate limiting
let lastPostTime = 0;
const MIN_POST_INTERVAL = 500;
let sendQueue = Promise.resolve();
let rateLimitedUntil = 0;

export type DiscordDeliveryResult =
  | { status: 'delivered'; messageId: string }
  | {
      status: 'retry';
      code: 'rate_limited' | 'server_error' | 'network_error' | 'invalid_response';
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

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  // Do not leave a split UTF-16 surrogate at the truncation boundary.
  return `${value.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, '')}…`;
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
    const linked = `[${clean}](${logUrl})${suffix}`;
    if (linked.length <= 1024) return linked;
  }

  // The embed itself still links to the full battle if a single line is oversized.
  return truncateText(`${clean}${suffix}`, 1024);
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

  const title = truncateText(`⚔️ PvP Battle at ${cleanRoom}`, 256);
  const footer = truncateText(`${SITE_URL.replace(/^https?:\/\//, '')}/pvp/${eventId}`, 2048);
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  let remaining = 6000 - title.length - footer.length;
  let omitted = false;
  const append = (name: string, value: string): boolean => {
    // Reserve a field and 100 characters for an explicit full-roster notice.
    if (fields.length >= 24 || name.length + value.length > remaining - 100) return false;
    fields.push({ name, value, inline: true });
    remaining -= name.length + value.length;
    return true;
  };
  teams: for (const [label, team] of [
    ['⚔️ Killers', killers],
    ['💀 Victims', victims],
  ] as const) {
    let value = '';
    for (const participant of team) {
      const line = formatParticipant(participant, eventId);
      if (value && value.length + 1 + line.length > 1024) {
        if (!append(label, value)) {
          omitted = true;
          break teams;
        }
        value = '';
      }
      value += `${value ? '\n' : ''}${line}`;
    }
    if (value && !append(label, value)) {
      omitted = true;
      break;
    }
  }
  if (omitted) {
    fields.push({
      name: 'Full roster',
      value: 'Open the linked battle for all participants and POV logs.',
    });
  }

  return {
    title,
    color: EMBED_COLOR,
    timestamp,
    url: battleUrl,
    fields,
    footer: {
      text: footer,
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
  // Reserve a turn before waiting so concurrent manual/test posts cannot make
  // the release poller consume an automatic battle without attempting delivery.
  const previous = sendQueue;
  let release!: () => void;
  sendQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    const bot = getBackendConfiguration().discordBot;
    if (!bot) return { status: 'failed', code: 'not_configured' };
    if (identity && identity.channelId !== bot.channelId) {
      return { status: 'failed', code: 'destination_changed' };
    }
    if (identity && !/^[a-zA-Z0-9_-]{1,25}$/.test(identity.nonce)) {
      return { status: 'failed', code: 'invalid_payload' };
    }
    if (rateLimitedUntil > Date.now()) {
      return {
        status: 'retry',
        code: 'rate_limited',
        retryAfterMs: rateLimitedUntil - Date.now(),
        ambiguous: false,
      };
    }

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
    release();
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
