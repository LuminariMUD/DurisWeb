import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import Redis from 'ioredis';
import mysql, { type RowDataPacket } from 'mysql2/promise';

import { getScopedRedisConfiguration } from '../utils/scopedRedis.js';

dotenv.config();

const CONFIGURATION_EXIT_STATUS = 78;
const REQUIRED_TABLES = [
  'admin_permissions',
  'forum_categories',
  'forum_posts',
  'forum_threads',
  'knex_migrations',
  'pkill_event',
  'pkill_info',
  'season_reset_state',
  'web_sessions',
  'web_settings',
] as const;

class ConfigurationError extends Error {}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ConfigurationError(`${name} is required`);
  }
  return value;
}

function parsePort(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ConfigurationError(`${name} must be a valid TCP port`);
  }
  return value;
}

function parseDatabase(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new ConfigurationError(`${name} must be a valid Redis database index`);
  }
  return value;
}

function migrationDirectory(): string {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDirectory, '../../migrations');
}

async function run(): Promise<void> {
  const database = mysql.createPool({
    host: requiredEnvironment('DB_HOST'),
    port: parsePort('DB_PORT', 3306),
    user: requiredEnvironment('DB_USER'),
    password: requiredEnvironment('DB_PASSWORD'),
    database: requiredEnvironment('DB_NAME'),
    connectTimeout: 5_000,
    connectionLimit: 1,
  });

  const cachePassword = requiredEnvironment('CACHE_REDIS_PASSWORD');
  const cache = new Redis({
    host: process.env.CACHE_REDIS_HOST || process.env.REDIS_HOST || '127.0.0.1',
    port: parsePort('CACHE_REDIS_PORT', Number(process.env.REDIS_PORT || 6379)),
    db: parseDatabase('CACHE_REDIS_DB', 0),
    username: process.env.CACHE_REDIS_USERNAME || undefined,
    password: cachePassword,
    lazyConnect: true,
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  const presenceConfiguration = getScopedRedisConfiguration('presence');
  const presence = new Redis({
    ...presenceConfiguration.options,
    lazyConnect: true,
    retryStrategy: () => null,
  });

  try {
    await database.query('SELECT 1');

    const [tableRows] = await database.query<RowDataPacket[]>(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME IN (?)`,
      [REQUIRED_TABLES],
    );
    const presentTables = new Set(tableRows.map((row) => String(row.TABLE_NAME)));
    const missingTables = REQUIRED_TABLES.filter((table) => !presentTables.has(table));
    if (missingTables.length > 0) {
      throw new ConfigurationError(`database schema is missing: ${missingTables.join(', ')}`);
    }

    const [sessionRows] = await database.query<RowDataPacket[]>(
      `SELECT CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'web_sessions'
          AND COLUMN_NAME = 'refresh_token'`,
    );
    if (sessionRows.length !== 1 || Number(sessionRows[0].CHARACTER_MAXIMUM_LENGTH) < 512) {
      throw new ConfigurationError('web_sessions.refresh_token must hold at least 512 characters');
    }

    const expectedMigrations = fs
      .readdirSync(migrationDirectory())
      .filter((name) => name.endsWith('.ts'))
      .sort();
    const [migrationRows] = await database.query<RowDataPacket[]>(
      'SELECT name FROM knex_migrations ORDER BY name',
    );
    const appliedMigrations = new Set(migrationRows.map((row) => String(row.name)));
    const pendingMigrations = expectedMigrations.filter((name) => !appliedMigrations.has(name));
    if (pendingMigrations.length > 0) {
      throw new ConfigurationError(
        `database migration ledger has ${pendingMigrations.length} pending migration(s)`,
      );
    }

    await cache.connect();
    if ((await cache.ping()) !== 'PONG') {
      throw new Error('cache ping returned an unexpected response');
    }

    await presence.connect();
    if ((await presence.ping()) !== 'PONG') {
      throw new Error('presence ping returned an unexpected response');
    }
    // SCAN is a whole-keyspace Redis command and therefore cannot be bounded by
    // ACL key patterns. Production must use a dedicated read-only presence
    // identity; this narrowly matched probe verifies the reader capability
    // without logging or fetching any key.
    await presence.scan(
      '0',
      'MATCH',
      `${presenceConfiguration.namespace}:season:*:presence:session:*`,
      'COUNT',
      1,
    );

    console.log(
      `Production preflight passed (${presentTables.size} required tables, ${expectedMigrations.length} migrations, cache and presence healthy).`,
    );
  } finally {
    await database.end();
    if (cache.status === 'ready') {
      await cache.quit();
    } else {
      cache.disconnect();
    }
    if (presence.status === 'ready') {
      await presence.quit();
    } else {
      presence.disconnect();
    }
  }
}

run().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    console.error(`Production preflight configuration error: ${error.message}`);
    process.exitCode = CONFIGURATION_EXIT_STATUS;
    return;
  }

  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
  console.error(`Production preflight dependency error (${code}).`);
  process.exitCode = 1;
});
