import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add all shutdown types to incident_type enum
  await knex.raw(`
    ALTER TABLE server_incidents
    MODIFY COLUMN incident_type
    ENUM('crash', 'shutdown', 'reboot', 'copyover', 'maintenance', 'degraded', 'outage')
    NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove shutdown types from incident_type enum
  await knex.raw(`
    ALTER TABLE server_incidents
    MODIFY COLUMN incident_type
    ENUM('crash', 'maintenance', 'degraded', 'outage')
    NOT NULL
  `);
}
