import mysql from 'mysql2/promise';
import { getBackendConfiguration } from '../config/environment.js';
import logger from '../utils/logger.js';

const environment = getBackendConfiguration();

const dbConfig = {
  ...environment.database,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Return dates as strings to avoid timezone conversion issues
  // MySQL DATETIME is timezone-naive, so we keep them as strings
  // and let the frontend handle display formatting
  dateStrings: true,
};

// The explicit MUD_DATABASE_MODE decides whether these pools share a target.
export const pool = mysql.createPool(dbConfig);

const mudDbConfig = {
  ...dbConfig,
  ...environment.mudDatabase.connection,
};

export const mudPool =
  environment.mudDatabase.mode === 'separate' ? mysql.createPool(mudDbConfig) : pool;

/** Pings the primary web database and reports availability without throwing. */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    logger.info('Database connection successful');
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}

/** Pings the explicitly shared or separate authoritative MUD database pool. */
export async function checkMudDatabaseConnection(): Promise<boolean> {
  try {
    const connection = await mudPool.getConnection();
    await connection.ping();
    connection.release();
    logger.info('MUD database connection successful');
    return true;
  } catch (error) {
    logger.error('MUD database connection failed:', error);
    return false;
  }
}

/**
 * Session state a pooled connection must still have when it is handed to a
 * request. A handler that changes any of these and releases the connection
 * silently weakens later unrelated queries.
 * See docs/ongoing-projects/ongoing.md, P0-D.
 */
export interface SessionInvariants {
  sqlMode: string;
  globalSqlMode: string;
  isolationLevel: string;
  globalIsolationLevel: string;
  timeZone: string;
  globalTimeZone: string;
  foreignKeyChecks: number;
}

/** Describe every way a checked-out connection deviates from server defaults. */
export function sessionInvariantDrift(observed: SessionInvariants): string[] {
  const drift: string[] = [];
  if (observed.sqlMode.trim() === '') {
    drift.push('sql_mode is empty, so strict, zero-date, and division safeguards are disabled');
  } else if (observed.sqlMode !== observed.globalSqlMode) {
    drift.push(
      `sql_mode is "${observed.sqlMode}" but the server default is "${observed.globalSqlMode}"`,
    );
  }
  if (observed.isolationLevel !== observed.globalIsolationLevel) {
    drift.push(
      `transaction_isolation is "${observed.isolationLevel}" but the server default is "${observed.globalIsolationLevel}"`,
    );
  }
  if (observed.timeZone !== observed.globalTimeZone) {
    drift.push(
      `time_zone is "${observed.timeZone}" but the server default is "${observed.globalTimeZone}"`,
    );
  }
  if (observed.foreignKeyChecks !== 1) {
    drift.push('foreign_key_checks is disabled');
  }
  return drift;
}

/**
 * Detect whether the database server exposes transaction_isolation (MySQL 8+,
 * MariaDB 11.1+) or tx_isolation (MariaDB 10.11 and earlier, MySQL 5.7).
 */
export async function detectIsolationVariableName(
  connection: Pick<mysql.PoolConnection, 'query'>,
): Promise<'transaction_isolation' | 'tx_isolation'> {
  try {
    await connection.query('SELECT @@SESSION.transaction_isolation');
    return 'transaction_isolation';
  } catch (err: unknown) {
    const error = err as { code?: string; errno?: number };
    if (error?.code === 'ER_UNKNOWN_SYSTEM_VARIABLE' || error?.errno === 1193) {
      return 'tx_isolation';
    }
    throw err;
  }
}

/** How often a pooled connection is re-checked during normal operation. */
const POOL_SESSION_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

/** The distinct pools a connection can be checked out from, with display names. */
function configuredPools(): [string, mysql.Pool][] {
  return mudPool === pool
    ? [['web', pool]]
    : [
        ['web', pool],
        ['mud', mudPool],
      ];
}

/**
 * Check out one connection from the pool and compare its session state
 * against the server defaults. Returns the drift descriptions, if any.
 */
async function checkoutSessionInvariants(currentPool: mysql.Pool): Promise<string[]> {
  const connection = await currentPool.getConnection();
  try {
    const isolationVar = await detectIsolationVariableName(connection);
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      `SELECT @@SESSION.sql_mode AS sqlMode,
              @@GLOBAL.sql_mode AS globalSqlMode,
              @@SESSION.${isolationVar} AS isolationLevel,
              @@GLOBAL.${isolationVar} AS globalIsolationLevel,
              @@SESSION.time_zone AS timeZone,
              @@GLOBAL.time_zone AS globalTimeZone,
              @@SESSION.foreign_key_checks AS foreignKeyChecks`,
    );
    const observed: SessionInvariants = {
      sqlMode: String(rows[0].sqlMode),
      globalSqlMode: String(rows[0].globalSqlMode),
      isolationLevel: String(rows[0].isolationLevel),
      globalIsolationLevel: String(rows[0].globalIsolationLevel),
      timeZone: String(rows[0].timeZone),
      globalTimeZone: String(rows[0].globalTimeZone),
      foreignKeyChecks: Number(rows[0].foreignKeyChecks),
    };
    return sessionInvariantDrift(observed);
  } finally {
    connection.release();
  }
}

/**
 * Check out one connection from each configured pool and fail startup when its
 * session state has already drifted from the server defaults.
 */
export async function verifyPoolSessionInvariants(): Promise<void> {
  for (const [name, currentPool] of configuredPools()) {
    const drift = await checkoutSessionInvariants(currentPool);
    if (drift.length > 0) {
      throw new Error(`${name} pool session invariants drifted: ${drift.join('; ')}`);
    }
    logger.info(`${name} pool session invariants verified.`);
  }
}

/**
 * Sample one checkout per configured pool and report drift as telemetry.
 * Unlike the startup verifier this never throws: a handler that leaked
 * mutated session state after boot surfaces as a logged alert without a
 * restart. See docs/ongoing-projects/ongoing.md, P0-D.
 */
export async function samplePoolSessionInvariants(): Promise<void> {
  for (const [name, currentPool] of configuredPools()) {
    try {
      const drift = await checkoutSessionInvariants(currentPool);
      if (drift.length > 0) {
        logger.error(
          `${name} pool session invariants drifted on sampled checkout: ${drift.join('; ')}`,
        );
      }
    } catch (error) {
      logger.error('Pool session invariant sampling failed:', error);
    }
  }
}

/**
 * Sample pool session invariants periodically during normal operation.
 * A sample that outlives its interval is never overlapped: the tick is
 * skipped while the previous sample is still waiting on checked-out
 * connections, so the unbounded pool checkout queue cannot accumulate
 * duplicated sampling work.
 */
export function startPoolSessionInvariantSampling(
  intervalMs = POOL_SESSION_SAMPLE_INTERVAL_MS,
): NodeJS.Timeout {
  let sampling = false;
  const timer = setInterval(() => {
    if (sampling) return;
    sampling = true;
    void samplePoolSessionInvariants().finally(() => {
      sampling = false;
    });
  }, intervalMs);
  timer.unref();
  return timer;
}

// Verify table schemas
export async function verifyDatabaseSchema(): Promise<void> {
  try {
    const connection = await pool.getConnection();

    // Check pkill_event table
    const [eventRows] = await connection.query("SHOW TABLES LIKE 'pkill_event'");
    if (Array.isArray(eventRows) && eventRows.length === 0) {
      throw new Error('Table pkill_event does not exist');
    }

    // Check pkill_info table
    const [infoRows] = await connection.query("SHOW TABLES LIKE 'pkill_info'");
    if (Array.isArray(infoRows) && infoRows.length === 0) {
      throw new Error('Table pkill_info does not exist');
    }

    // Check pkill_event schema
    const [_eventColumns] = await connection.query('DESCRIBE pkill_event');

    // Check pkill_info schema
    const [_infoColumns] = await connection.query('DESCRIBE pkill_info');

    // Get sample count
    const [_eventCount] = (await connection.query(
      'SELECT COUNT(*) as count FROM pkill_event',
    )) as any;

    connection.release();
  } catch (error) {
    logger.error('Schema verification failed:', error);
    throw error;
  }
}

/**
 * Close every configured pool during graceful shutdown. Failures are logged
 * rather than thrown so shutdown always reaches the remaining cleanup steps.
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    const pools = configuredPools().map(([, currentPool]) => currentPool);
    await Promise.all(pools.map((currentPool) => currentPool.end()));
    logger.info('Database connection pools closed');
  } catch (error) {
    logger.error('Error closing database connection pools:', error);
  }
}
