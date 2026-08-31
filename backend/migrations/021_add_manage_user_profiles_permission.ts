import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add manage_user_profiles permission for admins to modify any user's profile
  await knex('admin_permissions').insert({
    permission_key: 'manage_user_profiles',
    permission_name: 'Manage User Profiles',
    description: 'Can modify any user profile including profile pictures',
    category: 'users',
    sort_order: 17
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex('admin_permissions').where('permission_key', 'manage_user_profiles').delete();
}
