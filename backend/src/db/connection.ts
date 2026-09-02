import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Keep test database access isolated. Values already supplied by the caller
// still win, while .env remains a fallback for non-database test settings.
dotenv.config({
  path: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : '.env',
});

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required database environment variables: ${missingEnvVars.join(', ')}\n` +
      `Please set these in your .env file. See .env.example for reference.`,
  );
}

const dbConfig = {
  host: process.env.DB_HOST!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
  port: parseInt(process.env.DB_PORT || '3306'),
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

const separateMudDatabaseVariables = [
  'MUD_DB_HOST',
  'MUD_DB_USER',
  'MUD_DB_PASSWORD',
  'MUD_DB_NAME',
];
const anyMudDatabaseVariable = [...separateMudDatabaseVariables, 'MUD_DB_PORT'];
const hasSeparateMudDatabase = anyMudDatabaseVariable.some((varName) => process.env[varName]);
const missingMudDatabaseVariables = hasSeparateMudDatabase
  ? separateMudDatabaseVariables.filter((varName) => !process.env[varName])
  : [];
if (missingMudDatabaseVariables.length > 0) {
  throw new Error(
    `Incomplete authoritative MUD database configuration: ${missingMudDatabaseVariables.join(', ')}`,
  );
}

// Create connection pools. The existing pool remains the WebService pool; the
// optional MUD pool is used only for authoritative MUD reads introduced by the
// secure donation and presence paths. If no MUD_* variables are supplied, it
// preserves the original same-database deployment model.
export const pool = mysql.createPool(dbConfig);

const mudDbConfig = {
  ...dbConfig,
  host: process.env.MUD_DB_HOST || dbConfig.host,
  user: process.env.MUD_DB_USER || dbConfig.user,
  password: process.env.MUD_DB_PASSWORD || dbConfig.password,
  database: process.env.MUD_DB_NAME || dbConfig.database,
  port: parseInt(process.env.MUD_DB_PORT || String(dbConfig.port), 10),
};

export const mudPool = hasSeparateMudDatabase ? mysql.createPool(mudDbConfig) : pool;

// Health check function
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

// Health check for the authoritative MUD read pool. In the original same-database
// deployment this is a second pool to the same target, so it remains a cheap
// compatibility check rather than a new required deployment mode.
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
