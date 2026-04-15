import type { Knex } from 'knex';

/**
 * fix collation mismatch between mud tables and web tables
 * mud tables use utf8mb4_0900_ai_ci (mysql 8 default), web tables use utf8mb4_unicode_ci
 * this causes "illegal mix of collations" errors when joining tables
 */
export async function up(knex: Knex): Promise<void> {
  // disable foreign key checks during conversion
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');

  const tables = [
    'accounts',
    'account_characters',
    'account_ips',
    'guilds',
    'guild_ranks',
    'guild_members',
    'player_data',
  ];

  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(
        `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    }
  }

  // re-enable foreign key checks
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
}

export async function down(knex: Knex): Promise<void> {
  // revert to mysql 8 default collation (not recommended, but here for completeness)
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');

  const tables = [
    'accounts',
    'account_characters',
    'account_ips',
    'guilds',
    'guild_ranks',
    'guild_members',
    'player_data',
  ];

  for (const table of tables) {
    const exists = await knex.schema.hasTable(table);
    if (exists) {
      await knex.raw(
        `ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
      );
    }
  }

  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');
}
