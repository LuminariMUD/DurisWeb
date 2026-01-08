import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add backup_type column to mud_backups
  await knex.schema.alterTable('mud_backups', (table) => {
    table.string('backup_type', 20).defaultTo('manual').after('filename');
  });

  // Add index on backup_type
  await knex.schema.alterTable('mud_backups', (table) => {
    table.index('backup_type', 'idx_backup_type');
  });

  // Create mud_restores table for restore history
  await knex.schema.createTable('mud_restores', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('backup_id').unsigned().notNullable();
    table.string('restore_type', 20).notNullable(); // 'full' or 'selective'
    table.json('targets').nullable(); // Array of {type, name} for selective
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('progress').notNullable().defaultTo(0);
    table.string('current_step', 100).nullable();
    table.text('error_message').nullable();
    table.string('created_by', 100).notNullable();
    table.string('ip_address', 45).notNullable();
    table.datetime('started_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('completed_at').nullable();

    table.index('backup_id', 'idx_restore_backup_id');
    table.index('status', 'idx_restore_status');
    table.index('started_at', 'idx_restore_started_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop mud_restores table
  await knex.schema.dropTableIfExists('mud_restores');

  // Remove backup_type index and column from mud_backups
  await knex.schema.alterTable('mud_backups', (table) => {
    table.dropIndex('backup_type', 'idx_backup_type');
  });

  await knex.schema.alterTable('mud_backups', (table) => {
    table.dropColumn('backup_type');
  });
}
