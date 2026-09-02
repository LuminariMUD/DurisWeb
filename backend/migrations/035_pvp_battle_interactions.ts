import type { Knex } from 'knex';

/** Check for a named index in the active database schema. */
async function hasIndex(knex: Knex, tableName: string, indexName: string): Promise<boolean> {
  const row = await knex('information_schema.statistics')
    .select('INDEX_NAME')
    .whereRaw('TABLE_SCHEMA = DATABASE()')
    .where({ TABLE_NAME: tableName, INDEX_NAME: indexName })
    .first();

  return Boolean(row);
}

/** Create the PvP interaction tables, counters, and supporting indexes idempotently. */
export async function up(knex: Knex): Promise<void> {
  // Battle likes table
  if (!(await knex.schema.hasTable('pvp_battle_likes'))) {
    await knex.schema.createTable('pvp_battle_likes', (table) => {
      table.increments('id').primary();
      table.integer('event_id').notNullable();
      table.string('account_name', 50).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['event_id', 'account_name'], { indexName: 'unique_battle_like' });
      table.index('event_id', 'idx_like_event');
      table.index('account_name', 'idx_like_account');
    });
  }

  // Battle favorites table
  if (!(await knex.schema.hasTable('pvp_battle_favorites'))) {
    await knex.schema.createTable('pvp_battle_favorites', (table) => {
      table.increments('id').primary();
      table.integer('event_id').notNullable();
      table.string('account_name', 50).notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());

      table.unique(['event_id', 'account_name'], { indexName: 'unique_battle_favorite' });
      table.index('event_id', 'idx_favorite_event');
      table.index('account_name', 'idx_favorite_account');
    });
  }

  // Battle comments table with single-level threading
  if (!(await knex.schema.hasTable('pvp_battle_comments'))) {
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
  }

  // Add denormalized counts to pkill_event for efficient querying
  // Using raw SQL with relaxed sql_mode because pkill_event has an invalid datetime default
  await knex.raw(`SET sql_mode = ''`);
  if (!(await knex.schema.hasColumn('pkill_event', 'like_count'))) {
    await knex.raw('ALTER TABLE pkill_event ADD COLUMN like_count INT NOT NULL DEFAULT 0');
  }
  if (!(await knex.schema.hasColumn('pkill_event', 'comment_count'))) {
    await knex.raw('ALTER TABLE pkill_event ADD COLUMN comment_count INT NOT NULL DEFAULT 0');
  }
  if (!(await hasIndex(knex, 'pkill_event', 'idx_event_likes'))) {
    await knex.raw('ALTER TABLE pkill_event ADD INDEX idx_event_likes (like_count)');
  }
  if (!(await hasIndex(knex, 'pkill_event', 'idx_event_comments'))) {
    await knex.raw('ALTER TABLE pkill_event ADD INDEX idx_event_comments (comment_count)');
  }
}

/** Remove the PvP interaction tables, counters, and supporting indexes. */
export async function down(knex: Knex): Promise<void> {
  // Remove columns and indexes from pkill_event using raw SQL
  await knex.raw(`SET sql_mode = ''`);
  if (await hasIndex(knex, 'pkill_event', 'idx_event_likes')) {
    await knex.raw('ALTER TABLE pkill_event DROP INDEX idx_event_likes');
  }
  if (await hasIndex(knex, 'pkill_event', 'idx_event_comments')) {
    await knex.raw('ALTER TABLE pkill_event DROP INDEX idx_event_comments');
  }
  if (await knex.schema.hasColumn('pkill_event', 'like_count')) {
    await knex.raw('ALTER TABLE pkill_event DROP COLUMN like_count');
  }
  if (await knex.schema.hasColumn('pkill_event', 'comment_count')) {
    await knex.raw('ALTER TABLE pkill_event DROP COLUMN comment_count');
  }

  // Drop tables
  await knex.schema.dropTableIfExists('pvp_battle_comments');
  await knex.schema.dropTableIfExists('pvp_battle_favorites');
  await knex.schema.dropTableIfExists('pvp_battle_likes');
}
