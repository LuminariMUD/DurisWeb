import type { Knex } from 'knex';

/**
 * Migration: Fix server_reboots uptime_seconds to be nullable
 *
 * The uptime_seconds column must be nullable because it's calculated
 * only when the server shuts down. While running, it's NULL.
 */
export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('server_reboots');

  if (hasTable) {
    if (await knex.schema.hasColumn('server_reboots', 'record_id')) {
      console.log('Skipping server_reboots.uptime_seconds: preserving canonical MUD schema');
      return;
    }

    // Modify uptime_seconds to be nullable
    await knex.raw(`
      ALTER TABLE server_reboots
      MODIFY COLUMN uptime_seconds INT NULL COMMENT 'Calculated uptime duration in seconds'
    `);

    console.log('✅ Made server_reboots.uptime_seconds nullable');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('server_reboots');

  if (hasTable) {
    if (await knex.schema.hasColumn('server_reboots', 'record_id')) {
      console.log('Skipping server_reboots.uptime_seconds: preserving canonical MUD schema');
      return;
    }

    await knex.raw(`
      ALTER TABLE server_reboots
      MODIFY COLUMN uptime_seconds INT NOT NULL COMMENT 'Calculated uptime duration in seconds'
    `);

    console.log('✅ Made server_reboots.uptime_seconds NOT NULL');
  }
}
