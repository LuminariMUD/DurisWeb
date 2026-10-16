import type { Knex } from 'knex';

/** Preserve existing delivery keys and receipts while adding standard row metadata. */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE web_pvp_discord_destinations
    ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
    ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
  await knex.raw(`UPDATE web_pvp_discord_destinations
    SET created_at = activated_at, updated_at = activated_at`);
  await knex.raw(`ALTER TABLE web_pvp_discord_deliveries
    ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('web_pvp_discord_deliveries', (table) => {
    table.dropColumn('id');
  });
  await knex.schema.alterTable('web_pvp_discord_destinations', (table) => {
    table.dropColumns('id', 'created_at', 'updated_at');
  });
}
