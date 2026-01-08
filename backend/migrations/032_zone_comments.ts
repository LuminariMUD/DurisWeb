import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Zone comments with single-level threading
  await knex.schema.createTable('builder_zone_comments', (table) => {
    table.increments('id').primary();
    table.string('zone_id', 100).notNullable();
    table.integer('parent_id').unsigned().nullable(); // For single-level threading (NULL = top-level)
    table.integer('proc_request_id').unsigned().nullable(); // If comment is on a proc request
    table.string('account_name', 50).notNullable();
    table.string('character_name', 50).nullable(); // Character attribution (like forum)
    table.text('content').notNullable(); // TipTap JSON content
    table.text('content_html').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('zone_id', 'idx_comment_zone');
    table.index('parent_id', 'idx_comment_parent');
    table.index('proc_request_id', 'idx_comment_proc_request');
    table.index('account_name', 'idx_comment_account');
  });

  // Add new admin permission for zone permission management
  // Check if permission already exists before inserting
  const existingPermission = await knex('admin_permissions')
    .where('permission_key', 'manage_zone_permissions')
    .first();

  if (!existingPermission) {
    await knex('admin_permissions').insert({
      permission_key: 'manage_zone_permissions',
      permission_name: 'Manage Zone Permissions',
      description: 'Can grant/revoke zone access to other accounts',
      category: 'zone',
      sort_order: 20,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('builder_zone_comments');
  await knex('admin_permissions').where('permission_key', 'manage_zone_permissions').delete();
}
