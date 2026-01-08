import type { Knex } from 'knex';

/**
 * Migration: Convert admin_action_log action_type from ENUM to VARCHAR
 *
 * Phase 7: Remove restrictive ENUM and use VARCHAR for flexibility
 * This allows adding new action types without schema migrations.
 */
export async function up(knex: Knex): Promise<void> {
  // Check if admin_action_log table exists
  const hasTable = await knex.schema.hasTable('admin_action_log');

  if (!hasTable) {
    // Table doesn't exist, create it with VARCHAR action_type
    await knex.schema.createTable('admin_action_log', (table) => {
      table.increments('id').primary();
      table.string('account_name', 50).notNullable();
      table.string('action_type', 50).notNullable().comment('Action type: property_change, wipe, etc.');
      table.string('target', 100).notNullable().comment('Property key, table name, or affected entity');
      table.text('old_value');
      table.text('new_value');
      table.text('notes').comment('Optional notes or reason for change');
      table.string('ip_address', 45);
      table.datetime('timestamp').defaultTo(knex.fn.now());

      table.index('account_name', 'idx_account');
      table.index('action_type', 'idx_action_type');
      table.index('timestamp', 'idx_timestamp');
      table.index('target', 'idx_target');
    });

    console.log('✅ Created admin_action_log table with VARCHAR action_type');
  } else {
    // Table exists, convert ENUM to VARCHAR
    await knex.raw(`
      ALTER TABLE admin_action_log
      MODIFY COLUMN action_type VARCHAR(50) NOT NULL COMMENT 'Action type: property_change, wipe, etc.'
    `);

    console.log('✅ Converted admin_action_log action_type from ENUM to VARCHAR');
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('admin_action_log');

  if (hasTable) {
    // Revert to original ENUM
    await knex.raw(`
      ALTER TABLE admin_action_log
      MODIFY COLUMN action_type ENUM(
        'property_change',
        'level_cap_change',
        'wipe',
        'timer_reset'
      ) NOT NULL
    `);

    console.log('✅ Reverted admin_action_log action_type to ENUM');
  }
}
