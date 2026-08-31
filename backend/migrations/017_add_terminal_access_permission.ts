import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add terminal_access permission
  await knex('admin_permissions').insert({
    permission_key: 'terminal_access',
    permission_name: 'Terminal Access',
    description: 'Access the web-based terminal to manage MUD server files and processes',
    category: 'system',
    sort_order: 16
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('admin_permissions').where('permission_key', 'terminal_access').delete();
}
