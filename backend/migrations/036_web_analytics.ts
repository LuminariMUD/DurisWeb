import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Page view tracking table
  await knex.schema.createTable('page_views', (table) => {
    table.increments('id').primary();
    table.string('session_id', 64).notNullable().index();
    table.string('account_name', 255).nullable().index();
    table.string('path', 500).notNullable();
    table.string('page_title', 255).nullable();
    table.string('referrer', 1000).nullable();
    table.string('referrer_domain', 255).nullable().index();
    table.string('utm_source', 100).nullable();
    table.string('utm_medium', 100).nullable();
    table.string('utm_campaign', 100).nullable();
    table.string('user_agent', 500).nullable();
    table.string('device_type', 20).nullable();
    table.string('browser', 50).nullable();
    table.string('os', 50).nullable();
    table.integer('screen_width').nullable();
    table.integer('screen_height').nullable();
    table.string('ip_address', 45).nullable();
    table.string('country', 100).nullable();
    table.string('city', 100).nullable();
    table.integer('load_time_ms').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Index for path prefix searches
    table.index(knex.raw('path(100)'), 'idx_path_prefix');
    // Index for time-based queries
    table.index('created_at', 'idx_created_at');
  });

  // Visitor session aggregation table
  await knex.schema.createTable('visitor_sessions', (table) => {
    table.increments('id').primary();
    table.string('session_id', 64).notNullable().unique();
    table.string('account_name', 255).nullable().index();
    table.timestamp('first_seen').defaultTo(knex.fn.now());
    table.timestamp('last_seen').defaultTo(knex.fn.now());
    table.integer('page_views').defaultTo(1);
    table.integer('total_time_seconds').defaultTo(0);
    table.string('entry_page', 500).nullable();
    table.string('exit_page', 500).nullable();
    table.string('referrer', 1000).nullable();
    table.string('referrer_domain', 255).nullable().index();
    table.string('device_type', 20).nullable();
    table.string('browser', 50).nullable();
    table.string('os', 50).nullable();
    table.string('country', 100).nullable();
    table.string('city', 100).nullable();
    table.boolean('is_bounce').defaultTo(true);

    // Index for time-based queries
    table.index('first_seen', 'idx_first_seen');
    table.index('last_seen', 'idx_last_seen');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('page_views');
  await knex.schema.dropTableIfExists('visitor_sessions');
}
