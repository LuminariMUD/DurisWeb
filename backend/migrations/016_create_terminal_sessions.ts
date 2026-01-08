import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create terminal_sessions table
  await knex.schema.createTable('terminal_sessions', (table) => {
    table.increments('id').primary();
    table.string('account_name', 64).notNullable();
    table.datetime('started_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('ended_at').nullable();
    table.integer('pid').nullable();
    table.string('status', 20).notNullable().defaultTo('active');

    table.index('account_name', 'idx_terminal_account');
    table.index('started_at', 'idx_terminal_started');
  });

  // Create terminal_logs table for audit logging
  await knex.schema.createTable('terminal_logs', (table) => {
    table.bigIncrements('id').primary();
    table.integer('session_id').unsigned().notNullable();
    table.datetime('timestamp', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table.string('direction', 10).notNullable();
    table.text('data').notNullable();

    table.foreign('session_id').references('id').inTable('terminal_sessions').onDelete('CASCADE');
    table.index('session_id', 'idx_terminal_logs_session');
    table.index('timestamp', 'idx_terminal_logs_timestamp');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('terminal_logs');
  await knex.schema.dropTableIfExists('terminal_sessions');
}
