import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import type { Knex } from 'knex';
import { assertWebForwardSql } from './webMigrationGuard.js';
import type { DatabaseConfiguration } from '../config/environment.js';
import {
  readWebMigrationLedger,
  verifiedWebBaselineCoverage,
  WebBaselineError,
} from './webBaseline.js';
import {
  loadWebBaselineBundle,
  loadWebForwardSchemas,
  verifyWebBaselineSources,
  webBaselineDirectory,
} from './webBaselineBundle.js';

interface WebMigrationFile {
  file: string;
}

/** Knex sees real applied history; only verified fresh-baseline coverage can omit unapplied names. */
export class WebMigrationSource implements Knex.MigrationSource<WebMigrationFile> {
  constructor(
    private readonly configuration: DatabaseConfiguration,
    private readonly directory = path.resolve(webBaselineDirectory(), '../../migrations'),
  ) {}

  async getMigrations(): Promise<WebMigrationFile[]> {
    const bundle = loadWebBaselineBundle();
    verifyWebBaselineSources(bundle, this.directory);
    const available = fs
      .readdirSync(this.directory)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    const database = await mysql.createConnection({
      ...this.configuration,
      connectTimeout: 5000,
      multipleStatements: false,
    });
    try {
      // Retry only explicitly supported adjacent forward DDL after a lost acknowledgement.
      // Serving preflight and ordinary verification remain ledger-strict.
      const coverage = await verifiedWebBaselineCoverage(database, available, this.directory, true);
      const applied = await readWebMigrationLedger(database, available);
      if (coverage.size === 0 && applied.length === 0)
        throw new WebBaselineError('fresh_database_requires_explicit_baseline');
      // The Knex CLI reads `file` when displaying pending migrations.
      return available.filter((name) => !coverage.has(name)).map((file) => ({ file }));
    } finally {
      await database.end();
    }
  }

  getMigrationName(migration: WebMigrationFile): string {
    return migration.file;
  }

  async getMigration({ file: name }: WebMigrationFile): Promise<Knex.Migration> {
    if (!/^[a-zA-Z0-9_]+\.ts$/.test(name)) throw new WebBaselineError('invalid_migration_name');
    const migration: Knex.Migration = await import(
      pathToFileURL(path.join(this.directory, name)).href
    );
    const contract = loadWebForwardSchemas(loadWebBaselineBundle(), this.directory).find(
      (entry) => entry.name === name,
    );
    if (!contract) return migration; // Preserve existing historical migration semantics.
    if (typeof migration.up !== 'function' || typeof migration.down !== 'function') {
      throw new WebBaselineError('invalid_migration_exports');
    }
    const declared = new Set(Object.keys(contract.tables));
    const guarded = async (knex: Knex, direction: 'up' | 'down'): Promise<void> => {
      const operation = migration[direction];
      if (!operation) throw new WebBaselineError('invalid_migration_direction');
      const guard = (query: { sql: string }): void => assertWebForwardSql(query.sql, declared);
      // Knex emits query synchronously before handing SQL to the database driver.
      knex.on('query', guard);
      try {
        await operation(knex);
      } finally {
        knex.removeListener('query', guard);
      }
    };
    return {
      ...migration,
      up: (knex) => guarded(knex, 'up'),
      down: (knex) => guarded(knex, 'down'),
    };
  }
}
