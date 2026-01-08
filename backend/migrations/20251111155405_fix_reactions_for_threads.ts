import type { Knex } from "knex";

/**
 * Migration: Fix forum_reactions to support both threads and posts
 *
 * Problem: forum_reactions.post_id has a NOT NULL FK constraint to forum_posts(id),
 * but the frontend tries to add reactions to threads (forum_threads.id).
 *
 * Solution: Add thread_id column and make post_id nullable so reactions can
 * reference either a thread OR a post (but not both).
 */

export async function up(knex: Knex): Promise<void> {
  // IMPORTANT: forum_posts.id and forum_threads.id are INT (signed), not INT UNSIGNED
  // So forum_reactions FK columns must also be INT (signed) to match

  // Check if thread_id column exists
  const hasThreadId = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'forum_reactions'
    AND COLUMN_NAME = 'thread_id'
  `);

  // Make post_id nullable
  await knex.raw('ALTER TABLE forum_reactions MODIFY post_id INT NULL');

  // Add thread_id column if it doesn't exist, otherwise just modify its type
  if (hasThreadId[0][0].count === 0) {
    await knex.raw('ALTER TABLE forum_reactions ADD COLUMN thread_id INT NULL AFTER post_id');
  } else {
    await knex.raw('ALTER TABLE forum_reactions MODIFY thread_id INT NULL');
  }

  // Check if FK constraints exist
  const hasPostFk = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'forum_reactions'
    AND CONSTRAINT_NAME = 'forum_reactions_post_fk'
  `);

  const hasThreadFk = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'forum_reactions'
    AND CONSTRAINT_NAME = 'forum_reactions_thread_fk'
  `);

  // Add foreign key constraints if they don't exist (data types now match)
  if (hasPostFk[0][0].count === 0) {
    await knex.raw('ALTER TABLE forum_reactions ADD CONSTRAINT forum_reactions_post_fk FOREIGN KEY (post_id) REFERENCES forum_posts(id) ON DELETE CASCADE');
  }

  if (hasThreadFk[0][0].count === 0) {
    await knex.raw('ALTER TABLE forum_reactions ADD CONSTRAINT forum_reactions_thread_fk FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE');
  }

  // Check if unique constraint exists
  const hasUniqueConstraint = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'forum_reactions'
    AND CONSTRAINT_NAME = 'unique_reaction'
  `);

  // Add unique constraint if it doesn't exist
  if (hasUniqueConstraint[0][0].count === 0) {
    await knex.raw('ALTER TABLE forum_reactions ADD UNIQUE KEY unique_reaction (post_id, thread_id, user_account_name, emoji)');
  }

  // Add index on thread_id (check if it exists first)
  const hasThreadIndex = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'forum_reactions'
    AND INDEX_NAME = 'idx_thread'
  `);

  if (hasThreadIndex[0][0].count === 0) {
    await knex.raw('ALTER TABLE forum_reactions ADD INDEX idx_thread (thread_id)');
  }

  // Check if CHECK constraint exists
  const hasCheckConstraint = await knex.raw(`
    SELECT COUNT(*) as count
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'forum_reactions'
    AND CONSTRAINT_NAME = 'chk_post_or_thread'
  `);

  // Add CHECK constraint if it doesn't exist
  if (hasCheckConstraint[0][0].count === 0) {
    await knex.raw(`
      ALTER TABLE forum_reactions
      ADD CONSTRAINT chk_post_or_thread
      CHECK (
        (post_id IS NOT NULL AND thread_id IS NULL) OR
        (post_id IS NULL AND thread_id IS NOT NULL)
      )
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('forum_reactions', (table) => {
    // Drop CHECK constraint
    table.dropChecks('chk_post_or_thread');

    // Drop foreign keys
    table.dropForeign(['post_id']);
    table.dropForeign(['thread_id']);

    // Drop unique constraint
    table.dropUnique(['post_id', 'thread_id', 'user_account_name', 'emoji'], 'unique_reaction');

    // Drop thread_id column
    table.dropColumn('thread_id');

    // Make post_id NOT NULL again
    table.integer('post_id').unsigned().notNullable().alter();

    // Recreate original FK constraint
    table.foreign('post_id').references('forum_posts.id').onDelete('CASCADE');

    // Recreate original unique constraint
    table.unique(['post_id', 'user_account_name', 'emoji'], 'unique_reaction');
  });
}

