import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // website_changelog table
  await knex.schema.createTable('website_changelog', (table) => {
    table.increments('id').primary();
    table.string('version', 50).notNullable();
    table.string('title', 255).notNullable();
    table.text('content').notNullable();
    table.enum('category', ['public', 'admin']).defaultTo('public');
    table.string('created_by', 50).notNullable();
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    table.boolean('is_published').defaultTo(false);

    table.index('category', 'idx_changelog_category');
    table.index('is_published', 'idx_changelog_published');
    table.index('created_at', 'idx_changelog_created');
  });

  // website_changelog_reads table for tracking which users have read which entries
  await knex.schema.createTable('website_changelog_reads', (table) => {
    table.increments('id').primary();
    table.integer('changelog_id').unsigned().notNullable();
    table.string('account_name', 50).notNullable();
    table.datetime('read_at').defaultTo(knex.fn.now());

    table.unique(['changelog_id', 'account_name'], 'unique_changelog_read');
    table.foreign('changelog_id').references('id').inTable('website_changelog').onDelete('CASCADE');
    table.index('account_name', 'idx_changelog_reads_account');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('website_changelog_reads');
  await knex.schema.dropTableIfExists('website_changelog');
}
