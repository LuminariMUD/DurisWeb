import type { Knex } from 'knex';

import { getBackendConfiguration } from './src/config/environment.js';

const environment = getBackendConfiguration();

const connection: Knex.MySql2ConnectionConfig = {
  ...environment.database,
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
