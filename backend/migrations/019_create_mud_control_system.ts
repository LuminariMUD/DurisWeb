import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create mud_control_log table for audit trail
  await knex.schema.createTable('mud_control_log', (table) => {
    table.increments('id').primary();
    table.string('action', 50).notNullable(); // 'start', 'stop', 'restart'
    table.string('status', 50).notNullable().defaultTo('pending'); // 'pending', 'in_progress', 'completed', 'failed'
    table.string('account_name', 255).notNullable();
    table.string('ip_address', 45).nullable();
    table.text('reason').nullable(); // Required for stop/restart, optional for start
    table.datetime('started_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('completed_at').nullable();
    table.text('error_message').nullable();
    table.integer('cycle_mud_pid').nullable();
    table.integer('dms_pid').nullable();

    table.index('account_name', 'idx_control_account');
    table.index('started_at', 'idx_control_started');
    table.index('action', 'idx_control_action');
  });

  // Create mud_process_state table for current state cache (singleton)
  await knex.schema.createTable('mud_process_state', (table) => {
    table.integer('id').unsigned().primary().defaultTo(1);
    table.integer('cycle_mud_pid').nullable();
    table.integer('dms_pid').nullable();
    table.string('state', 50).notNullable().defaultTo('unknown'); // 'running', 'stopped', 'starting', 'stopping', 'unknown'
    table.datetime('last_start_time').nullable();
    table.datetime('last_stop_time').nullable();
    table.string('started_by', 255).nullable();
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Insert singleton row
  await knex('mud_process_state').insert({
    id: 1,
    state: 'unknown'
  });

  // Add mud_control permission
  await knex('admin_permissions').insert({
    permission_key: 'mud_control',
    permission_name: 'MUD Process Control',
    description: 'Start, stop, and restart the MUD server',
    category: 'system',
    sort_order: 18
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('mud_control_log');
  await knex.schema.dropTableIfExists('mud_process_state');
  await knex('admin_permissions').where('permission_key', 'mud_control').delete();
}
