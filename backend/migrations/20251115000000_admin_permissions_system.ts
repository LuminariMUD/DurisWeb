import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create admin_permissions table - defines all available permissions
  await knex.schema.createTable('admin_permissions', (table) => {
    table.increments('id').primary();
    table.string('permission_key', 100).notNullable().unique();
    table.string('permission_name', 255).notNullable();
    table.text('description');
    table.string('category', 50).notNullable(); // 'content', 'zone', 'monitoring', 'configuration', 'system'
    table.integer('sort_order').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('category');
    table.index('sort_order');
  });

  // Create admin_roles table - defines roles that group permissions
  await knex.schema.createTable('admin_roles', (table) => {
    table.increments('id').primary();
    table.string('role_name', 100).notNullable().unique();
    table.text('description');
    table.boolean('is_system_role').defaultTo(false); // Cannot be deleted if true
    table.string('created_by', 50).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.index('is_system_role');
  });

  // Create admin_role_permissions junction table - links roles to permissions
  await knex.schema.createTable('admin_role_permissions', (table) => {
    table.increments('id').primary();
    table.integer('role_id').unsigned().notNullable();
    table.integer('permission_id').unsigned().notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.foreign('role_id').references('id').inTable('admin_roles').onDelete('CASCADE');
    table.foreign('permission_id').references('id').inTable('admin_permissions').onDelete('CASCADE');

    table.unique(['role_id', 'permission_id']);
    table.index('role_id');
    table.index('permission_id');
  });

  // Create admin_account_roles junction table - assigns roles to accounts
  await knex.schema.createTable('admin_account_roles', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable();
    table.integer('role_id').unsigned().notNullable();
    table.string('granted_by', 50).notNullable();
    table.timestamp('granted_at').defaultTo(knex.fn.now());

    table.foreign('role_id').references('id').inTable('admin_roles').onDelete('CASCADE');

    table.unique(['account_name', 'role_id']);
    table.index('account_name');
    table.index('role_id');
    table.index('granted_by');
    table.index('granted_at');
  });

  // Create admin_account_permissions table - individual permission overrides
  await knex.schema.createTable('admin_account_permissions', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable();
    table.integer('permission_id').unsigned().notNullable();
    table.string('granted_by', 50).notNullable();
    table.timestamp('granted_at').defaultTo(knex.fn.now());

    table.foreign('permission_id').references('id').inTable('admin_permissions').onDelete('CASCADE');

    table.unique(['account_name', 'permission_id']);
    table.index('account_name');
    table.index('permission_id');
    table.index('granted_by');
    table.index('granted_at');
  });

  // Seed the 15 core permissions
  const permissions = [
    // Content Management (6)
    { permission_key: 'manage_help_files', permission_name: 'Manage Help Files', description: 'Create, edit, and delete help files', category: 'content', sort_order: 1 },
    { permission_key: 'manage_news', permission_name: 'Manage News', description: 'Create, edit, and delete news posts', category: 'content', sort_order: 2 },
    { permission_key: 'manage_motd', permission_name: 'Manage MOTD & Static Pages', description: 'Edit MOTD, Wiz MOTD, Rules, Credits, Info, Wizlist, FAQ', category: 'content', sort_order: 3 },
    { permission_key: 'manage_forum_settings', permission_name: 'Manage Forum Settings', description: 'Edit forum settings and configuration', category: 'content', sort_order: 4 },
    { permission_key: 'manage_forum_categories', permission_name: 'Manage Forum Categories', description: 'Create, edit, and archive forum categories', category: 'content', sort_order: 5 },
    { permission_key: 'moderate_forum', permission_name: 'Moderate Forum', description: 'Moderate posts and threads (lock, pin, move, delete)', category: 'content', sort_order: 6 },

    // Zone & World (1)
    { permission_key: 'manage_zones', permission_name: 'Manage Zones', description: 'Create, edit, and delete zones and zone properties', category: 'zone', sort_order: 7 },

    // Server Monitoring (3)
    { permission_key: 'view_server_logs', permission_name: 'View Server Logs', description: 'View and download server logs', category: 'monitoring', sort_order: 8 },
    { permission_key: 'view_server_health', permission_name: 'View Server Health', description: 'View health metrics, crashes, and incidents', category: 'monitoring', sort_order: 9 },
    { permission_key: 'view_connection_logs', permission_name: 'View Connection Logs', description: 'View login/logout tracking and IP analysis', category: 'monitoring', sort_order: 10 },

    // MUD Configuration (4)
    { permission_key: 'manage_mud_properties', permission_name: 'Manage MUD Properties', description: 'Edit game properties and configuration', category: 'configuration', sort_order: 11 },
    { permission_key: 'manage_level_cap', permission_name: 'Manage Level Cap', description: 'View and modify level cap settings', category: 'configuration', sort_order: 12 },
    { permission_key: 'manage_timers', permission_name: 'Manage Timers', description: 'View and modify global game timers', category: 'configuration', sort_order: 13 },
    { permission_key: 'view_analytics', permission_name: 'View Analytics', description: 'View analytics dashboard and statistics', category: 'monitoring', sort_order: 14 },

    // System Administration (1)
    { permission_key: 'manage_permissions', permission_name: 'Manage Permissions', description: 'Assign roles and permissions to accounts (Overlord-only)', category: 'system', sort_order: 15 },
  ];

  await knex('admin_permissions').insert(permissions);

  // Seed default roles
  const roles = [
    { role_name: 'Content Editor', description: 'Can manage help files, news, and MOTD pages', is_system_role: true, created_by: 'system' },
    { role_name: 'Zone Manager', description: 'Can create and edit zones', is_system_role: true, created_by: 'system' },
    { role_name: 'Server Monitor', description: 'Can view server logs, health, and connection logs', is_system_role: true, created_by: 'system' },
    { role_name: 'Full Admin', description: 'All permissions except permission management', is_system_role: true, created_by: 'system' },
  ];

  await knex('admin_roles').insert(roles);

  // Get permission and role IDs for mapping
  const permissionsMap = await knex('admin_permissions').select('id', 'permission_key');
  const rolesMap = await knex('admin_roles').select('id', 'role_name');

  const getPermissionId = (key: string) => permissionsMap.find(p => p.permission_key === key)?.id;
  const getRoleId = (name: string) => rolesMap.find(r => r.role_name === name)?.id;

  // Assign permissions to Content Editor role
  const contentEditorId = getRoleId('Content Editor');
  if (contentEditorId) {
    await knex('admin_role_permissions').insert([
      { role_id: contentEditorId, permission_id: getPermissionId('manage_help_files')! },
      { role_id: contentEditorId, permission_id: getPermissionId('manage_news')! },
      { role_id: contentEditorId, permission_id: getPermissionId('manage_motd')! },
    ]);
  }

  // Assign permissions to Zone Manager role
  const zoneManagerId = getRoleId('Zone Manager');
  if (zoneManagerId) {
    await knex('admin_role_permissions').insert([
      { role_id: zoneManagerId, permission_id: getPermissionId('manage_zones')! },
      { role_id: zoneManagerId, permission_id: getPermissionId('view_server_logs')! },
    ]);
  }

  // Assign permissions to Server Monitor role
  const serverMonitorId = getRoleId('Server Monitor');
  if (serverMonitorId) {
    await knex('admin_role_permissions').insert([
      { role_id: serverMonitorId, permission_id: getPermissionId('view_server_logs')! },
      { role_id: serverMonitorId, permission_id: getPermissionId('view_server_health')! },
      { role_id: serverMonitorId, permission_id: getPermissionId('view_connection_logs')! },
      { role_id: serverMonitorId, permission_id: getPermissionId('view_analytics')! },
    ]);
  }

  // Assign all permissions except manage_permissions to Full Admin role
  const fullAdminId = getRoleId('Full Admin');
  if (fullAdminId) {
    const allPermsExceptManage = permissionsMap
      .filter(p => p.permission_key !== 'manage_permissions')
      .map(p => ({ role_id: fullAdminId, permission_id: p.id }));
    await knex('admin_role_permissions').insert(allPermsExceptManage);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order due to foreign key constraints
  await knex.schema.dropTableIfExists('admin_account_permissions');
  await knex.schema.dropTableIfExists('admin_account_roles');
  await knex.schema.dropTableIfExists('admin_role_permissions');
  await knex.schema.dropTableIfExists('admin_roles');
  await knex.schema.dropTableIfExists('admin_permissions');
}
