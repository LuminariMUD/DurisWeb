import type { Knex } from 'knex';

/**
 * Migration: Fix server_reboots shutdown_time to be nullable
 *
 * The shutdown_time column must be nullable because when the server boots,
 * we don't have a shutdown time yet (server is currently running).
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('server_reboots');

  if (hasTable) {
    if (await knex.schema.hasColumn('server_reboots', 'record_id')) {
      console.log('Skipping server_reboots.shutdown_time: preserving canonical MUD schema');
      return;
    }

    // Modify shutdown_time to be nullable
    await knex.raw(`
      ALTER TABLE server_reboots
      MODIFY COLUMN shutdown_time INT NULL COMMENT 'Unix timestamp when server shutdown (NULL if currently running)'
    `);

    console.log('✅ Made server_reboots.shutdown_time nullable');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('server_reboots');

  if (hasTable) {
    if (await knex.schema.hasColumn('server_reboots', 'record_id')) {
      console.log('Skipping server_reboots.shutdown_time: preserving canonical MUD schema');
      return;
    }

    // Revert to NOT NULL (this might fail if there are NULL values)
    await knex.raw(`
      ALTER TABLE server_reboots
      MODIFY COLUMN shutdown_time INT NOT NULL COMMENT 'Unix timestamp when server shutdown'
    `);

    console.log('✅ Made server_reboots.shutdown_time NOT NULL');
  }
}
