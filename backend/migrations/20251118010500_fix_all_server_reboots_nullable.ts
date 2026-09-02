import type { Knex } from 'knex';

/**
 * Migration: Fix all server_reboots columns to have proper nullable/default settings
 *
 * Ensures all columns that should be nullable are properly set.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('server_reboots');

  if (hasTable) {
    if (await knex.schema.hasColumn('server_reboots', 'record_id')) {
      console.log('Skipping server_reboots constraints: preserving canonical MUD schema');
      return;
    }

    // Fix all columns that should be nullable or have defaults
    await knex.raw(`
      ALTER TABLE server_reboots
      MODIFY COLUMN boot_time INT NOT NULL COMMENT 'Unix timestamp when server started',
      MODIFY COLUMN shutdown_time INT NULL COMMENT 'Unix timestamp when server shutdown (NULL if currently running)',
      MODIFY COLUMN uptime_seconds INT NULL COMMENT 'Calculated uptime duration in seconds',
      MODIFY COLUMN shutdown_type VARCHAR(50) NULL DEFAULT 'unknown',
      MODIFY COLUMN initiated_by VARCHAR(255) NULL COMMENT 'Account name who triggered shutdown',
      MODIFY COLUMN reason TEXT NULL COMMENT 'Optional shutdown reason or message'
    `);

    console.log('✅ Fixed all server_reboots column constraints');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('server_reboots');

  if (hasTable) {
    if (await knex.schema.hasColumn('server_reboots', 'record_id')) {
      console.log('Skipping server_reboots constraints: preserving canonical MUD schema');
      return;
    }

    await knex.raw(`
      ALTER TABLE server_reboots
      MODIFY COLUMN boot_time INT NOT NULL COMMENT 'Unix timestamp when server started',
      MODIFY COLUMN shutdown_time INT NOT NULL COMMENT 'Unix timestamp when server shutdown',
      MODIFY COLUMN uptime_seconds INT NOT NULL COMMENT 'Calculated uptime duration in seconds',
      MODIFY COLUMN shutdown_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
      MODIFY COLUMN initiated_by VARCHAR(255) NOT NULL COMMENT 'Account name who triggered shutdown',
      MODIFY COLUMN reason TEXT NOT NULL COMMENT 'Optional shutdown reason or message'
    `);

    console.log('✅ Reverted server_reboots column constraints');
  }
}
