import type { Knex } from 'knex';
import dotenv from 'dotenv';

// Prefer a test-specific file while retaining local defaults for values that
// the test file does not override. Explicit process environment variables win.
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

const connection: Knex.MySql2ConnectionConfig = {
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,
};

const migrations: Knex.MigratorConfig = {
  directory: './migrations',
  tableName: 'knex_migrations',
  extension: 'ts',
};

const seeds: Knex.SeederConfig = {
  directory: './seeds',
  extension: 'ts',
};

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'mysql2',
    connection,
    migrations,
    seeds,
  },

  test: {
    client: 'mysql2',
    connection,
    migrations,
    seeds,
    pool: {
      min: 0,
      max: 4,
    },
  },

  production: {
    client: 'mysql2',
    connection,
    migrations,
    pool: {
      min: 2,
      max: 10,
    },
  },
};

export default config;
