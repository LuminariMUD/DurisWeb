import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create forum_post_images table
  const tableExists = await knex.schema.hasTable('forum_post_images');

  if (!tableExists) {
    await knex.schema.createTable('forum_post_images', (table) => {
      table.increments('id').primary();
      table.integer('post_id').nullable();
      table.integer('thread_id').nullable();
      table.string('account_name', 50).notNullable();
      table.string('image_key', 255).notNullable(); // R2 object key
      table.string('image_url', 500).notNullable(); // Full public URL
      table.string('original_filename', 255).nullable();
      table.string('mime_type', 50).notNullable();
      table.integer('file_size').unsigned().notNullable(); // Size in bytes
      table.integer('width').unsigned().nullable();
      table.integer('height').unsigned().nullable();
      table.boolean('is_orphan').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('linked_at').nullable();

      // Foreign keys with SET NULL on delete (keep images even if post is deleted)
      table.foreign('post_id').references('id').inTable('forum_posts').onDelete('SET NULL');
      table.foreign('thread_id').references('id').inTable('forum_threads').onDelete('SET NULL');

      // Indexes
      table.index('post_id');
      table.index('thread_id');
      table.index('account_name');
      table.index(['is_orphan', 'created_at']); // For cleanup queries
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('forum_post_images');
}
