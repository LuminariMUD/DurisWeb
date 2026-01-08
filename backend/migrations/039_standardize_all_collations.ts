import type { Knex } from 'knex';

/**
 * Migration to standardize all web tables to utf8mb4_unicode_ci collation.
 * This fixes collation mismatch errors when JOINing or UNIONing tables.
 *
 * Tables using utf8mb4_0900_ai_ci (MySQL 8 default) need to be converted.
 * Legacy MUD tables using latin1_swedish_ci are left unchanged.
 */

const TABLES_TO_CONVERT = [
  'account_login_history',
  'admin_account_permissions',
  'admin_account_roles',
  'admin_permission_audit',
  'admin_permissions',
  'admin_roles',
  'builder_activity_log',
  'builder_flags',
  'builder_mentions',
  'builder_notifications',
  'builder_proc_requests',
  'builder_zone_comments',
  'builder_zone_info',
  'builder_zone_info_history',
  'builder_zone_permissions',
  'deployment_log',
  'forum_permission_audit',
  'forum_post_images',
  'forum_settings',
  'frag_leaderboard',
  'gemini_analysis_log',
  'mud_backups',
  'mud_control_log',
  'mud_process_state',
  'mud_restores',
  'page_views',
  'pvp_battle_comments',
  'pvp_battle_favorites',
  'pvp_battle_likes',
  'server_incidents',
  'server_reboots',
  'suspicious_accounts',
  'terminal_logs',
  'terminal_sessions',
  'visitor_sessions',
  'web_settings',
  'wiki_continents',
  'wiki_map_positions',
  'wiki_settings',
  'wiki_zone_entrances',
];

export async function up(knex: Knex): Promise<void> {
  for (const table of TABLES_TO_CONVERT) {
    // Check if table exists before trying to alter it
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`
        ALTER TABLE \`${table}\`
        CONVERT TO CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
      `);
      console.log(`Converted ${table} to utf8mb4_unicode_ci`);
    } else {
      console.log(`Skipping ${table} - table does not exist`);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Revert to MySQL 8 default collation
  for (const table of TABLES_TO_CONVERT) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(`
        ALTER TABLE \`${table}\`
        CONVERT TO CHARACTER SET utf8mb4
        COLLATE utf8mb4_0900_ai_ci
      `);
    }
  }
}
