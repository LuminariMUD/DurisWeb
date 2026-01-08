import type { Knex } from 'knex';

/**
 * Migration: Create admin_permission_audit table
 *
 * Phase 7: Audit Trail & Final Polish
 * This table tracks all changes to the admin permission system:
 * - Role assignments and revocations
 * - Individual permission grants and revocations
 *
 * Provides complete audit trail for accountability and troubleshooting.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_permission_audit', (table) => {
    table.increments('id').primary();
    table.string('account_name', 50).notNullable().comment('Account that performed the action');
    table.enum('action_type', [
      'assign_role',
      'revoke_role',
      'grant_permission',
      'revoke_permission',
    ]).notNullable();
    table.string('target_account', 50).notNullable().comment('Account that was affected');
    table.string('target_item', 100).notNullable().comment('Role name or permission key');
    table.integer('target_id').comment('Role ID or permission ID');
    table.text('notes').comment('Optional reason or context');
    table.string('ip_address', 45);
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes for performance
    table.index('account_name', 'idx_perm_audit_account');
    table.index('action_type', 'idx_perm_audit_action');
    table.index('target_account', 'idx_perm_audit_target');
    table.index('created_at', 'idx_perm_audit_created');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_permission_audit');
}
