import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add manage_front_page permission
  await knex('admin_permissions').insert({
    permission_key: 'manage_front_page',
    permission_name: 'Manage Front Page',
    description: 'Edit front page hero banner and content',
    category: 'content',
    sort_order: 5
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('admin_permissions').where('permission_key', 'manage_front_page').delete();
}
