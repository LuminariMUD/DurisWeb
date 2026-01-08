import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create help_file_suggestions table
  await knex.schema.createTable('help_file_suggestions', (table) => {
    table.increments('id').unsigned().primary();
    table.enum('suggestion_type', ['new', 'edit']).notNullable();
    table.integer('page_id').unsigned().nullable();
    table.string('title', 255).notNullable();
    table.text('text').notNullable();
    table.integer('category_id').notNullable().defaultTo(0);
    table.text('see_also').nullable();
    table.text('submitter_notes').nullable();
    table
      .enum('status', ['pending', 'in_review', 'approved', 'rejected', 'needs_revision'])
      .notNullable()
      .defaultTo('pending');
    table.string('reviewer_account', 50).nullable();
    table.text('reviewer_notes').nullable();
    table.datetime('reviewed_at').nullable();
    table.string('submitted_by', 50).notNullable();
    table.datetime('submitted_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    table.string('ip_address', 45).nullable();

    // Indexes
    table.index('status', 'idx_status');
    table.index('submitted_by', 'idx_submitted_by');
    table.index('page_id', 'idx_page_id');
    table.index('submitted_at', 'idx_submitted_at');
  });

  // Add new permission for managing help suggestions
  await knex('admin_permissions').insert({
    permission_key: 'manage_help_suggestions',
    permission_name: 'Manage Help File Suggestions',
    description: 'Review, approve, and reject help file suggestions',
    category: 'content',
    sort_order: 7,
  });
}

export async function down(knex: Knex): Promise<void> {
  // Remove permission
  await knex('admin_permissions')
    .where('permission_key', 'manage_help_suggestions')
    .delete();

  // Drop table
  await knex.schema.dropTableIfExists('help_file_suggestions');
}
