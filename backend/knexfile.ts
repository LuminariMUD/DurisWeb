import type { Knex } from 'knex';

import { getBackendConfiguration } from './src/config/environment.js';
import { WebMigrationSource } from './src/db/webMigrationSource.js';

const environment = getBackendConfiguration();

const connection: Knex.MySql2ConnectionConfig = {
  ...environment.database,
};

const migrations: Knex.MigratorConfig = {
  // Knex discards a custom migrationSource when directory/loadExtensions are
  // supplied. WebMigrationSource owns discovery and baseline safety checks.
  tableName: 'knex_migrations',
  extension: 'ts',
  migrationSource: new WebMigrationSource(environment.database),
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
