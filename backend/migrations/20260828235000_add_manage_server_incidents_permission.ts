import type { Knex } from 'knex';

const PERMISSION_KEY = 'manage_server_incidents';

export async function up(knex: Knex): Promise<void> {
  await knex('admin_permissions')
    .insert({
      permission_key: PERMISSION_KEY,
      permission_name: 'Manage Server Incidents',
      description: 'Create, update, and delete server incidents',
      category: 'monitoring',
      sort_order: 18,
    })
    .onConflict('permission_key')
    .ignore();

  const permission = await knex('admin_permissions')
    .where({ permission_key: PERMISSION_KEY })
    .first('id');
  const fullAdminRole = await knex('admin_roles')
    .where({ role_name: 'Full Admin' })
    .first('id');

  if (permission && fullAdminRole) {
    await knex('admin_role_permissions')
      .insert({ role_id: fullAdminRole.id, permission_id: permission.id })
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  const permission = await knex('admin_permissions')
    .where({ permission_key: PERMISSION_KEY })
    .first('id');

  if (permission) {
    await knex('admin_role_permissions')
      .where({ permission_id: permission.id })
      .delete();
    await knex('admin_account_permissions')
      .where({ permission_id: permission.id })
      .delete();
    await knex('admin_permissions')
      .where({ id: permission.id })
      .delete();
  }
}
