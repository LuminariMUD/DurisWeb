import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Drop the incorrectly created table
  await knex.schema.dropTableIfExists('forum_post_images');

  // Recreate with correct column types (signed int to match forum_posts and forum_threads)
  await knex.schema.createTable('forum_post_images', (table) => {
    table.increments('id').primary();
    table.integer('post_id').nullable(); // signed int to match forum_posts.id
    table.integer('thread_id').nullable(); // signed int to match forum_threads.id
    table.string('account_name', 50).notNullable();
    table.string('image_key', 255).notNullable();
    table.string('image_url', 500).notNullable();
    table.string('original_filename', 255).nullable();
    table.string('mime_type', 50).notNullable();
    table.integer('file_size').unsigned().notNullable();
    table.integer('width').unsigned().nullable();
    table.integer('height').unsigned().nullable();
    table.boolean('is_orphan').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('linked_at').nullable();

    // Foreign keys - now compatible
    table.foreign('post_id').references('id').inTable('forum_posts').onDelete('SET NULL');
    table.foreign('thread_id').references('id').inTable('forum_threads').onDelete('SET NULL');

    // Indexes
    table.index('post_id');
    table.index('thread_id');
    table.index('account_name');
    table.index(['is_orphan', 'created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('forum_post_images');
}
