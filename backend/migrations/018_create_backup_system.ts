import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create mud_backups table
  await knex.schema.createTable('mud_backups', (table) => {
    table.increments('id').primary();
    table.string('filename', 255).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('progress').notNullable().defaultTo(0);
    table.string('current_step', 100).nullable();
    table.bigInteger('file_size').unsigned().nullable();
    table.text('error_message').nullable();
    table.string('created_by', 100).notNullable();
    table.string('ip_address', 45).notNullable();
    table.datetime('started_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('completed_at').nullable();

    table.index('status', 'idx_backup_status');
    table.index('started_at', 'idx_backup_started');
  });

  // Add manage_mud_backup permission
  await knex('admin_permissions').insert({
    permission_key: 'manage_mud_backup',
    permission_name: 'Manage MUD Backups',
    description: 'Create and download MUD backups (database + player files)',
    category: 'system',
    sort_order: 17
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mud_backups');
  await knex('admin_permissions').where('permission_key', 'manage_mud_backup').delete();
}
