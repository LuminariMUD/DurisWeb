import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required database environment variables: ${missingEnvVars.join(', ')}\n` +
    `Please set these in your .env file. See .env.example for reference.`
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

// Create connection pool
export const pool = mysql.createPool(dbConfig);

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

// Verify table schemas
export async function verifyDatabaseSchema(): Promise<void> {
  try {
    const connection = await pool.getConnection();

    // Check pkill_event table
    const [eventRows] = await connection.query(
      "SHOW TABLES LIKE 'pkill_event'"
    );
    if (Array.isArray(eventRows) && eventRows.length === 0) {
      throw new Error('Table pkill_event does not exist');
    }

    // Check pkill_info table
    const [infoRows] = await connection.query(
      "SHOW TABLES LIKE 'pkill_info'"
    );
    if (Array.isArray(infoRows) && infoRows.length === 0) {
      throw new Error('Table pkill_info does not exist');
    }

    // Check pkill_event schema
    const [_eventColumns] = await connection.query(
      "DESCRIBE pkill_event"
    );

    // Check pkill_info schema
    const [_infoColumns] = await connection.query(
      "DESCRIBE pkill_info"
    );

    // Get sample count
    const [_eventCount] = await connection.query(
      'SELECT COUNT(*) as count FROM pkill_event'
    ) as any;

    connection.release();
  } catch (error) {
    logger.error('Schema verification failed:', error);
    throw error;
  }
}

// Graceful shutdown
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
}
