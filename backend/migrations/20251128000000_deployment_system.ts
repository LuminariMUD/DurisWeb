import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create deployment_log table for audit trail
  await knex.schema.createTable('deployment_log', (table) => {
    table.increments('id').primary();
    table.string('account_name', 255).notNullable();
    table.string('ip_address', 45).nullable();
    table.string('action', 20).notNullable(); // 'deploy' or 'rollback'
    table.string('from_hash', 40).notNullable();
    table.string('to_hash', 40).notNullable();
    table.text('git_output').nullable(); // Full git fetch + checkout output
    table.boolean('compile_success').nullable();
    table.specificType('compile_output', 'MEDIUMTEXT').nullable(); // Full make output (can be large)
    table.timestamp('created_at').defaultTo(knex.fn.now());

    table.index('account_name', 'idx_deployment_account');
    table.index('created_at', 'idx_deployment_created');
  });

  // Add missing view_git_history permission (was used but never defined)
  await knex('admin_permissions').insert([
    {
      permission_key: 'view_git_history',
      permission_name: 'View Git History',
      description: 'View MUD codebase commit history',
      category: 'Monitoring',
    },
    {
      permission_key: 'manage_deployment',
      permission_name: 'Manage Deployment',
      description: 'Deploy or rollback MUD codebase to specific commits',
      category: 'System',
    },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('deployment_log');

  await knex('admin_permissions')
    .whereIn('permission_key', ['view_git_history', 'manage_deployment'])
    .del();
}
