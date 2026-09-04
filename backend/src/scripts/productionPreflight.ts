import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Redis, { type RedisOptions } from 'ioredis';
import mysql, { type RowDataPacket } from 'mysql2/promise';

import { ConfigurationError, getBackendConfiguration } from '../config/environment.js';
import { readForumReadiness, validateForumReadiness } from '../services/forumReadiness.js';
import {
  readWikiMobGeneration,
  readWikiObjectGeneration,
  validateWikiMobGeneration,
  validateWikiObjectGeneration,
} from '../services/wikiGeneration.js';
import {
  getScopedRedisConfiguration,
  type ScopedRedisConfiguration,
} from '../utils/scopedRedis.js';

export { ConfigurationError } from '../config/environment.js';

const CONFIGURATION_EXIT_STATUS = 78;
const SQL_ARTIFACT_MANIFEST = 'sql-artifacts.json';
const AUCTION_TABLES = [
  'auctions',
  'auction_bid_history',
  'auction_item_pickups',
  'auction_money_pickups',
] as const;
const REQUIRED_TABLES = [
  'admin_permissions',
  'forum_categories',
  'forum_posts',
  'forum_threads',
  'knex_migrations',
  'pkill_event',
  'pkill_info',
  'season_reset_state',
  'server_reboots',
  'user_profile_stats',
  'web_sessions',
  'web_settings',
  'wiki_mob_flags',
  'wiki_mobs',
  'wiki_object_affects',
  'wiki_object_classes',
  'wiki_object_races',
  'wiki_object_slots',
  'wiki_object_spell_effects',
  'wiki_objects',
  'wiki_reference_generations',
] as const;

export type PreflightMode = 'all' | 'configuration' | 'dependencies';

interface PreflightConfiguration {
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  cache: RedisOptions;
  presence: ScopedRedisConfiguration | null;
  expectedMigrations: string[];
  auctionWritesEnabled: boolean;
}

/** Resolve the checked-in migration directory from source or compiled scripts. */
export function migrationDirectory(): string {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(scriptDirectory, '../../migrations');
}

/** Read the migration ledger inputs and fail with an actionable release error. */
function expectedMigrationNames(): string[] {
  const directory = migrationDirectory();
  let names: string[];
  try {
    names = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith('.ts'))
      .sort();
  } catch {
    throw new ConfigurationError([`checked-in migrations are missing from ${directory}`]);
  }
  if (names.length === 0) {
    throw new ConfigurationError([`no TypeScript migrations were found in ${directory}`]);
  }
  return names;
}

/**
 * Fail the release when a SQL artifact in the migration directory is neither
 * executed by Knex (`extension: 'ts'`) nor classified in the checked-in
 * manifest, so no migration artifact is silently ignored.
 * See docs/development.md#database-contract-checks.
 */
export function verifySqlArtifactClassification(): void {
  const directory = migrationDirectory();
  const manifestPath = path.join(directory, SQL_ARTIFACT_MANIFEST);

  let classified: Set<string>;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      artifacts?: Record<string, unknown>;
    };
    classified = new Set(Object.keys(manifest.artifacts ?? {}));
  } catch {
    throw new ConfigurationError([`${SQL_ARTIFACT_MANIFEST} is missing or unreadable`]);
  }

  const present = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const unclassified = present.filter((name) => !classified.has(name));
  if (unclassified.length > 0) {
    throw new ConfigurationError([
      `unclassified SQL migration artifacts: ${unclassified.join(', ')}`,
    ]);
  }

  const stale = [...classified].filter((name) => !present.includes(name)).sort();
  if (stale.length > 0) {
    throw new ConfigurationError([
      `${SQL_ARTIFACT_MANIFEST} lists removed artifacts: ${stale.join(', ')}`,
    ]);
  }
}

/** Parse the requested systemd preflight stage. */
export function parsePreflightMode(args: string[]): PreflightMode {
  if (args.length === 0) return 'all';
  if (args.length === 1 && args[0] === '--configuration') return 'configuration';
  if (args.length === 1 && args[0] === '--dependencies') return 'dependencies';
  throw new ConfigurationError(['expected --configuration, --dependencies, or no argument']);
}

/** Validate static release inputs without opening database or Redis connections. */
export function loadPreflightConfiguration(): PreflightConfiguration {
  const environment = getBackendConfiguration();
  verifySqlArtifactClassification();
  const cache = environment.cacheRedis;
  const presence = environment.features.mudRedis
    ? getScopedRedisConfiguration('presence', environment)
    : null;

  return {
    database: environment.database,
    cache: {
      host: cache.host,
      port: cache.port,
      db: cache.database,
      username: cache.username,
      password: cache.password,
      tls: cache.tls
        ? {
            ca: fs.readFileSync(cache.caCertificatePath!, 'utf8'),
            servername: cache.tlsServerName,
          }
        : undefined,
      lazyConnect: true,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    },
    presence,
    expectedMigrations: expectedMigrationNames(),
    auctionWritesEnabled: environment.unsafeMutations.auctionWrites,
  };
}

/** Verify live database, cache, and scoped-presence dependencies. */
async function verifyDependencies(configuration: PreflightConfiguration): Promise<void> {
  const database = mysql.createPool({
    ...configuration.database,
    connectTimeout: 5_000,
    connectionLimit: 1,
  });
  const cache = new Redis(configuration.cache);
  const presence = configuration.presence
    ? new Redis({
        ...configuration.presence.options,
        lazyConnect: true,
        retryStrategy: () => null,
      })
    : null;

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
      throw new ConfigurationError([`database schema is missing: ${missingTables.join(', ')}`]);
    }

    const objectGenerationIssues = validateWikiObjectGeneration(
      await readWikiObjectGeneration(database),
    );
    if (objectGenerationIssues.length > 0) {
      throw new ConfigurationError(objectGenerationIssues);
    }
    const mobGenerationIssues = validateWikiMobGeneration(await readWikiMobGeneration(database));
    if (mobGenerationIssues.length > 0) {
      throw new ConfigurationError(mobGenerationIssues);
    }

    const forumIssues = validateForumReadiness(await readForumReadiness(database));
    if (forumIssues.length > 0) throw new ConfigurationError(forumIssues);

    const [runtimeContractRows] = await database.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS matching_columns
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'server_reboots'
        AND (
          (COLUMN_NAME = 'record_id' AND DATA_TYPE = 'bigint' AND COLUMN_TYPE LIKE '%unsigned%' AND IS_NULLABLE = 'NO' AND EXTRA LIKE '%auto_increment%')
          OR (COLUMN_NAME IN ('boot_time', 'shutdown_time', 'uptime_seconds') AND DATA_TYPE = 'bigint' AND COLUMN_TYPE LIKE '%unsigned%' AND IS_NULLABLE = 'NO')
          OR (COLUMN_NAME = 'shutdown_type' AND COLUMN_TYPE = 'enum(''shutdown'',''reboot'',''copyover'',''autoreboot'',''pwipe'',''hung'',''autoreboot_copyover'',''crash'',''unknown'')' AND IS_NULLABLE = 'NO' AND REPLACE(COLUMN_DEFAULT, CHAR(39), '') = 'unknown')
          OR (COLUMN_NAME = 'initiated_by' AND COLUMN_TYPE = 'varchar(255)' AND IS_NULLABLE = 'YES')
          OR (COLUMN_NAME = 'reason' AND DATA_TYPE = 'text' AND IS_NULLABLE = 'YES')
        )
    `);
    if (Number(runtimeContractRows[0]?.matching_columns) !== 7) {
      throw new ConfigurationError(['server_reboots must retain the canonical MUD runtime shape']);
    }

    const [crossBoundaryRows] = await database.query<RowDataPacket[]>(`
      SELECT COUNT(*) AS incoming_foreign_keys
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'user_profile_stats'
        AND REFERENCED_TABLE_NAME = 'accounts'
    `);
    if (Number(crossBoundaryRows[0]?.incoming_foreign_keys) !== 0) {
      throw new ConfigurationError([
        'web extension tables must not alter the MUD runtime foreign-key fingerprint',
      ]);
    }

    const [sessionRows] = await database.query<RowDataPacket[]>(
      `SELECT CHARACTER_MAXIMUM_LENGTH
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'web_sessions'
          AND COLUMN_NAME = 'refresh_token'`,
    );
    if (sessionRows.length !== 1 || Number(sessionRows[0].CHARACTER_MAXIMUM_LENGTH) < 512) {
      throw new ConfigurationError([
        'web_sessions.refresh_token must hold at least 512 characters',
      ]);
    }

    // Direct auction writes are only safe against the current MUD contract:
    // all four tables transactional, and `date` still an integer epoch column.
    // See docs/ARCHITECTURE.md#mutation-authority-and-default-closed-gates.
    if (configuration.auctionWritesEnabled) {
      const [auctionRows] = await database.query<RowDataPacket[]>(
        `SELECT TABLE_NAME, ENGINE
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN (?)`,
        [AUCTION_TABLES],
      );
      const engines = new Map(
        auctionRows.map((row) => [String(row.TABLE_NAME), String(row.ENGINE)]),
      );
      const nonTransactional = AUCTION_TABLES.filter((table) => engines.get(table) !== 'InnoDB');
      if (nonTransactional.length > 0) {
        throw new ConfigurationError([
          `auction writes require InnoDB; not transactional: ${nonTransactional.join(', ')}`,
        ]);
      }

      const [bidDateRows] = await database.query<RowDataPacket[]>(
        `SELECT DATA_TYPE
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'auction_bid_history'
            AND COLUMN_NAME = 'date'`,
      );
      if (bidDateRows.length !== 1 || String(bidDateRows[0].DATA_TYPE) !== 'int') {
        throw new ConfigurationError([
          'auction_bid_history.date must remain an integer epoch column',
        ]);
      }
    }

    const [migrationRows] = await database.query<RowDataPacket[]>(
      'SELECT name FROM knex_migrations ORDER BY name',
    );
    const appliedMigrations = new Set(migrationRows.map((row) => String(row.name)));
    const pendingMigrations = configuration.expectedMigrations.filter(
      (name) => !appliedMigrations.has(name),
    );
    if (pendingMigrations.length > 0) {
      throw new ConfigurationError([
        `database migration ledger has ${pendingMigrations.length} pending migration(s)`,
      ]);
    }

    await cache.connect();
    if ((await cache.ping()) !== 'PONG') {
      throw new Error('cache ping returned an unexpected response');
    }

    if (presence && configuration.presence) {
      await presence.connect();
      if ((await presence.ping()) !== 'PONG') {
        throw new Error('presence ping returned an unexpected response');
      }
      // SCAN is a whole-keyspace Redis command and therefore cannot be bounded by
      // ACL key patterns. Production must use a dedicated read-only presence
      // identity; this narrowly matched probe verifies the reader capability.
      await presence.scan(
        '0',
        'MATCH',
        `${configuration.presence.namespace}:season:*:presence:session:*`,
        'COUNT',
        1,
      );
      await presence.mget(
        `${configuration.presence.namespace}:season:0:presence:session:preflight:0`,
      );
      const playerEventProbe = `${configuration.presence.namespace}:season:0:player`;
      await presence.subscribe(playerEventProbe);
      await presence.unsubscribe(playerEventProbe);
    }

    console.log(
      `Production dependency preflight passed (${presentTables.size} required tables, ${configuration.expectedMigrations.length} migrations and configured Redis dependencies healthy).`,
    );
  } finally {
    await database.end();
    if (cache.status === 'ready') {
      await cache.quit();
    } else {
      cache.disconnect();
    }
    if (presence) {
      if (presence.status === 'ready') {
        await presence.quit();
      } else {
        presence.disconnect();
      }
    }
  }
}

/** Run one or both preflight stages and return the process exit status. */
export async function runProductionPreflight(args: string[]): Promise<number> {
  let mode: PreflightMode = 'all';
  try {
    mode = parsePreflightMode(args);
    const configuration = loadPreflightConfiguration();
    if (mode === 'configuration') {
      console.log(
        `Production configuration preflight passed (${configuration.expectedMigrations.length} migrations available).`,
      );
      return 0;
    }

    await verifyDependencies(configuration);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown preflight error';
    if (error instanceof ConfigurationError && mode !== 'dependencies') {
      console.error(`Production preflight configuration error: ${message}`);
      return CONFIGURATION_EXIT_STATUS;
    }

    const code =
      error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNKNOWN';
    console.error(`Production preflight dependency error (${code}): ${message}`);
    return 1;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  process.exitCode = await runProductionPreflight(process.argv.slice(2));
}
