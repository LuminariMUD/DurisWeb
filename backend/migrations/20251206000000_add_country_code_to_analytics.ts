import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add country_code column to page_views table
  await knex.schema.alterTable('page_views', (table) => {
    table.string('country_code', 10).nullable().after('country');
  });

  // Add country_code column to visitor_sessions table
  await knex.schema.alterTable('visitor_sessions', (table) => {
    table.string('country_code', 10).nullable().after('country');
  });

  // Add index on country_code for geo queries
  await knex.schema.alterTable('page_views', (table) => {
    table.index('country_code', 'idx_page_views_country_code');
  });

  await knex.schema.alterTable('visitor_sessions', (table) => {
    table.index('country_code', 'idx_visitor_sessions_country_code');
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove indexes
  await knex.schema.alterTable('page_views', (table) => {
    table.dropIndex('country_code', 'idx_page_views_country_code');
  });

  await knex.schema.alterTable('visitor_sessions', (table) => {
    table.dropIndex('country_code', 'idx_visitor_sessions_country_code');
  });

  // Remove country_code columns
  await knex.schema.alterTable('page_views', (table) => {
    table.dropColumn('country_code');
  });

  await knex.schema.alterTable('visitor_sessions', (table) => {
    table.dropColumn('country_code');
  });
}
