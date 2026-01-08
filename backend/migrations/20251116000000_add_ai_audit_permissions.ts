import type { Knex } from 'knex';

/**
 * Migration: Add AI Analysis and Audit Log permissions
 *
 * Adds two new permissions to allow delegation of sensitive admin tools:
 * - use_ai_analysis: Access to AI-powered log analysis
 * - view_audit_log: View audit logs for all admin actions
 *
 * These permissions are added to:
 * - Server Monitor role (for policing admins checking for cheating)
 * - Full Admin role
 */
export async function up(knex: Knex): Promise<void> {
  // Insert new permissions
  await knex('admin_permissions').insert([
    {
      permission_key: 'use_ai_analysis',
      permission_name: 'Use AI Analysis',
      description: 'Access AI-powered log analysis and anomaly detection',
      category: 'monitoring',
      sort_order: 16,
    },
    {
      permission_key: 'view_audit_log',
      permission_name: 'View Audit Log',
      description: 'View audit logs of all admin actions and changes',
      category: 'monitoring',
      sort_order: 17,
    },
  ]);

  // Get permission IDs
  const [useAiAnalysis] = await knex('admin_permissions')
    .select('id')
    .where('permission_key', 'use_ai_analysis');

  const [viewAuditLog] = await knex('admin_permissions')
    .select('id')
    .where('permission_key', 'view_audit_log');

  // Get role IDs
  const [serverMonitor] = await knex('admin_roles')
    .select('id')
    .where('role_name', 'Server Monitor');

  const [fullAdmin] = await knex('admin_roles')
    .select('id')
    .where('role_name', 'Full Admin');

  // Add permissions to Server Monitor role (for policing admins)
  if (serverMonitor && useAiAnalysis && viewAuditLog) {
    await knex('admin_role_permissions').insert([
      { role_id: serverMonitor.id, permission_id: useAiAnalysis.id },
      { role_id: serverMonitor.id, permission_id: viewAuditLog.id },
    ]);
  }

  // Add permissions to Full Admin role
  if (fullAdmin && useAiAnalysis && viewAuditLog) {
    await knex('admin_role_permissions').insert([
      { role_id: fullAdmin.id, permission_id: useAiAnalysis.id },
      { role_id: fullAdmin.id, permission_id: viewAuditLog.id },
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  // Get permission IDs
  const permissions = await knex('admin_permissions')
    .select('id')
    .whereIn('permission_key', ['use_ai_analysis', 'view_audit_log']);

  const permissionIds = permissions.map(p => p.id);

  // Remove from role_permissions junction table
  await knex('admin_role_permissions')
    .whereIn('permission_id', permissionIds)
    .delete();

  // Remove from account_permissions (if any granted individually)
  await knex('admin_account_permissions')
    .whereIn('permission_id', permissionIds)
    .delete();

  // Delete the permissions
  await knex('admin_permissions')
    .whereIn('permission_key', ['use_ai_analysis', 'view_audit_log'])
    .delete();
}
