import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE server_incidents
    MODIFY COLUMN detected_by VARCHAR(50) NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE server_incidents
    MODIFY COLUMN detected_by ENUM('exit_log','process_monitor','manual') NULL
  `);
}
