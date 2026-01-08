import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Battle likes table
  await knex.schema.createTable('pvp_battle_likes', (table) => {
    table.increments('id').primary();
    table.integer('event_id').notNullable();
    table.string('account_name', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['event_id', 'account_name'], { indexName: 'unique_battle_like' });
    table.index('event_id', 'idx_like_event');
    table.index('account_name', 'idx_like_account');
  });

  // Battle favorites table
  await knex.schema.createTable('pvp_battle_favorites', (table) => {
    table.increments('id').primary();
    table.integer('event_id').notNullable();
    table.string('account_name', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.unique(['event_id', 'account_name'], { indexName: 'unique_battle_favorite' });
    table.index('event_id', 'idx_favorite_event');
    table.index('account_name', 'idx_favorite_account');
  });

  // Battle comments table with single-level threading
  await knex.schema.createTable('pvp_battle_comments', (table) => {
    table.increments('id').primary();
    table.integer('event_id').notNullable();
    table.string('account_name', 50).notNullable();
    table.bigInteger('character_pid').nullable(); // Optional character attribution
    table.text('content').notNullable();
    table.integer('parent_id').unsigned().nullable(); // For single-level threading (NULL = top-level)
    table.boolean('is_deleted').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('event_id', 'idx_comment_event');
    table.index('account_name', 'idx_comment_account');
    table.index('parent_id', 'idx_comment_parent');
  });

  // Add denormalized counts to pkill_event for efficient querying
  // Using raw SQL with relaxed sql_mode because pkill_event has an invalid datetime default
  await knex.raw(`SET sql_mode = ''`);
  await knex.raw(`
    ALTER TABLE pkill_event
    ADD COLUMN like_count INT NOT NULL DEFAULT 0,
    ADD COLUMN comment_count INT NOT NULL DEFAULT 0,
    ADD INDEX idx_event_likes (like_count),
    ADD INDEX idx_event_comments (comment_count)
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove columns and indexes from pkill_event using raw SQL
  await knex.raw(`SET sql_mode = ''`);
  await knex.raw(`
    ALTER TABLE pkill_event
    DROP INDEX idx_event_likes,
    DROP INDEX idx_event_comments,
    DROP COLUMN like_count,
    DROP COLUMN comment_count
  `);

  // Drop tables
  await knex.schema.dropTableIfExists('pvp_battle_comments');
  await knex.schema.dropTableIfExists('pvp_battle_favorites');
  await knex.schema.dropTableIfExists('pvp_battle_likes');
}
