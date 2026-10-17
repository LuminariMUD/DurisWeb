import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { pool } from '../db/connection.js';

const MAX_ROWS = 1000;
const MAX_BYTES = 4 * 1024 * 1024;
const QUERY_TIMEOUT_MS = 3000;
const TOTAL_QUERY_BUDGET_MS = 15000;

/** Only reviewed, subject-owned fields belong here; never export SELECT * or mixed JSON. */
const sources = [
  {
    name: 'profile',
    table: 'user_profiles',
    owner: 'account_name',
    order: 'account_name',
    fields: [
      'bio',
      'avatar_url',
      'banner_url',
      'website',
      'location',
      'email',
      'created_at',
      'last_seen_at',
    ],
  },
  {
    name: 'profileStatistics',
    table: 'user_profile_stats',
    owner: 'account_name',
    order: 'account_name',
    fields: [
      'total_posts',
      'total_threads',
      'total_reactions_received',
      'reputation_score',
      'first_post_at',
      'last_post_at',
    ],
  },
  {
    name: 'forumThreadMetadata',
    table: 'forum_threads',
    owner: 'author_account_name',
    order: 'id',
    fields: ['id', 'category_id', 'created_at', 'updated_at', 'is_deleted'],
  },
  {
    name: 'forumPostMetadata',
    table: 'forum_posts',
    owner: 'author_account_name',
    order: 'id',
    fields: ['id', 'thread_id', 'created_at', 'edited_at', 'is_deleted'],
  },
  {
    name: 'forumReactions',
    table: 'forum_reactions',
    owner: 'user_account_name',
    order: 'id',
    fields: ['id', 'post_id', 'thread_id', 'emoji', 'created_at'],
  },
  {
    name: 'forumSubscriptions',
    table: 'forum_subscriptions',
    owner: 'user_account_name',
    order: 'id',
    fields: [
      'id',
      'subscription_type',
      'thread_id',
      'category_id',
      'notification_preference',
      'created_at',
    ],
  },
  {
    name: 'pollVotes',
    table: 'forum_poll_votes',
    owner: 'voter_account',
    order: 'id',
    fields: ['id', 'poll_id', 'option_id', 'voted_at', 'updated_at'],
  },
  {
    name: 'notificationMetadata',
    table: 'notifications',
    owner: 'account_name',
    order: 'id',
    fields: ['id', 'source', 'notification_type', 'is_read', 'created_at', 'read_at'],
  },
  {
    name: 'pushSubscriptionMetadata',
    table: 'push_subscriptions',
    owner: 'account_name',
    order: 'id',
    fields: ['id', 'created_at', 'last_used_at'],
  },
  {
    name: 'pvpFavorites',
    table: 'pvp_battle_favorites',
    owner: 'account_name',
    order: 'id',
    fields: ['id', 'event_id', 'created_at'],
  },
  {
    name: 'pvpLikes',
    table: 'pvp_battle_likes',
    owner: 'account_name',
    order: 'id',
    fields: ['id', 'event_id', 'created_at'],
  },
] as const;

type ExportValue = string | number | boolean | null;
interface CredentialRow extends RowDataPacket {
  account_name: string;
  password: string;
  blocked: number;
}

export class AccountExportError extends Error {
  constructor(
    readonly status: 400 | 401 | 413 | 503,
    message: string,
  ) {
    super(message);
  }
}

function passwordFrom(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AccountExportError(400, 'Enter your current password.');
  const entries = Object.entries(input);
  if (
    entries.length !== 1 ||
    entries[0][0] !== 'password' ||
    typeof entries[0][1] !== 'string' ||
    entries[0][1].length === 0 ||
    Buffer.byteLength(entries[0][1], 'utf8') > 1024
  )
    throw new AccountExportError(400, 'Enter only your current password.');
  return entries[0][1];
}

async function credentials(connection: PoolConnection, accountName: string, sessionId: string) {
  // The additional binary comparison prevents accent/padding collation aliases
  // from selecting another subject. The ordinary equality retains index use.
  const [rows] = await connection.query<CredentialRow[]>(
    {
      sql: `SELECT a.account_name, a.password, a.blocked FROM accounts a
      JOIN web_sessions s ON s.id = ? AND s.account_name = a.account_name
        AND BINARY LOWER(s.account_name) = BINARY LOWER(a.account_name)
      WHERE a.account_name = ? AND BINARY LOWER(a.account_name) = BINARY LOWER(?)
        AND s.refresh_token_digest IS NOT NULL AND s.expires_at_epoch > UNIX_TIMESTAMP()
      LIMIT 2`,
      timeout: QUERY_TIMEOUT_MS,
    },
    [sessionId, accountName, accountName],
  );
  if (
    rows.length !== 1 ||
    rows[0].blocked !== 0 ||
    typeof rows[0].password !== 'string' ||
    typeof rows[0].account_name !== 'string' ||
    rows[0].account_name.toLowerCase() !== accountName.toLowerCase()
  )
    throw new AccountExportError(401, 'Sign in again and verify your current password.');
  return rows[0];
}

/** One synchronous private download; no stored file, replay URL, provider call or deletion. */
export async function exportAccountData(accountName: string, sessionId: string, input: unknown) {
  const password = passwordFrom(input);
  if (
    typeof accountName !== 'string' ||
    accountName.length === 0 ||
    accountName.length > 50 ||
    typeof sessionId !== 'string' ||
    sessionId.length === 0 ||
    sessionId.length > 100
  )
    throw new AccountExportError(401, 'Sign in again before downloading your data.');
  const connection = await pool.getConnection();
  let completed = false;
  try {
    const verified = await credentials(connection, accountName, sessionId);
    if (
      !/^\$2[aby]\$/.test(verified.password) ||
      !(await bcrypt.compare(password, verified.password))
    )
      throw new AccountExportError(401, 'Your password could not be verified.');

    // SET TRANSACTION affects this transaction only, preserving pooled defaults.
    await connection.query({
      sql: 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ',
      timeout: QUERY_TIMEOUT_MS,
    });
    await connection.query({
      sql: 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY',
      timeout: QUERY_TIMEOUT_MS,
    });
    const started = Date.now();
    const categories: Record<string, Record<string, ExportValue>[]> = {};
    let bytes = 0;
    for (const source of sources) {
      if (Date.now() - started > TOTAL_QUERY_BUDGET_MS)
        throw new AccountExportError(503, 'The download took too long. Please try again later.');
      const [rows] = await connection.query<RowDataPacket[]>(
        {
          sql: `SELECT ${source.fields.map((field) => `\`${field}\``).join(', ')}
          FROM \`${source.table}\` WHERE \`${source.owner}\` = ?
          AND BINARY LOWER(\`${source.owner}\`) = BINARY LOWER(?)
          ORDER BY \`${source.order}\` LIMIT ${MAX_ROWS + 1}`,
          timeout: QUERY_TIMEOUT_MS,
        },
        [verified.account_name, verified.account_name],
      );
      if (rows.length > MAX_ROWS)
        throw new AccountExportError(
          413,
          'Your data exceeds the download limit. Please contact the privacy contact for assistance.',
        );
      categories[source.name] = rows.map((row) =>
        Object.fromEntries(
          source.fields.map((field) => {
            const value: unknown = row[field];
            if (
              value !== null &&
              typeof value !== 'string' &&
              typeof value !== 'boolean' &&
              !(typeof value === 'number' && Number.isSafeInteger(value))
            )
              throw new AccountExportError(503, 'Your data could not be prepared safely.');
            return [field, value as ExportValue];
          }),
        ),
      );
      bytes += Buffer.byteLength(JSON.stringify(categories[source.name]), 'utf8');
      if (bytes > MAX_BYTES)
        throw new AccountExportError(
          413,
          'Your data exceeds the download limit. Please contact the privacy contact for assistance.',
        );
    }
    await connection.query({ sql: 'COMMIT', timeout: QUERY_TIMEOUT_MS });
    // A reset, block, revocation or expiry during generation must prevent delivery.
    const current = await credentials(connection, accountName, sessionId);
    if (current.password !== verified.password || current.account_name !== verified.account_name)
      throw new AccountExportError(401, 'Your account changed. Sign in again before downloading.');
    const exportId = randomUUID();
    const payload = JSON.stringify(
      {
        schemaVersion: 1,
        exportId,
        generatedAt: new Date().toISOString(),
        accountName: verified.account_name,
        scope: 'partial-website-data',
        completeAccountExport: false,
        snapshot:
          'Included website categories share one database snapshot. Stored date strings retain database formatting.',
        categories,
        omissions: [
          {
            category: 'credentials',
            reason: 'Passwords, tokens, session identifiers, push endpoints and keys are excluded.',
          },
          {
            category: 'communityContent',
            reason:
              "Post/thread text, titles, quotes, mentions, poll history and mixed notification payloads require review for other people's information.",
          },
          {
            category: 'media',
            reason: 'Image files and external storage copies require a separate assisted request.',
          },
          {
            category: 'gameData',
            reason:
              "Game-owned accounts, characters, activity and files require the game owner's separate process.",
          },
          {
            category: 'otherRecords',
            reason:
              'Donations, analytics, security, moderation, staff, provider, backup and privacy-operation records require an assisted scope review. Anonymous activity is not linked by IP.',
          },
        ],
        assistance:
          'Use the privacy contact on /privacy for a complete request, omitted information or account removal.',
      },
      null,
      2,
    );
    if (Buffer.byteLength(payload, 'utf8') > MAX_BYTES)
      throw new AccountExportError(
        413,
        'Your data exceeds the download limit. Please contact the privacy contact for assistance.',
      );
    completed = true;
    return { exportId, payload };
  } finally {
    // On any failed/unknown query, discard the checkout and its read transaction.
    if (completed) connection.release();
    else connection.destroy();
  }
}
