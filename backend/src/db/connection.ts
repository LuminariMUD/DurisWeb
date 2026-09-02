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

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  try {
    const pools = mudPool === pool ? [pool] : [pool, mudPool];
    await Promise.all(pools.map((currentPool) => currentPool.end()));
    logger.info('Database connection pools closed');
  } catch (error) {
    logger.error('Error closing database connection pools:', error);
  }
}
