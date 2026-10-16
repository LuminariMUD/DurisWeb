import type { Knex } from 'knex';
import { migrateWebSessionSchema } from '../src/db/webSessionSchema.js';

// Applying this migration logs every website session out. Stop old writers first.
// The schema down is reversible; discarded credentials are never restored.
export const config = { transaction: false };
export async function up(knex: Knex): Promise<void> {
  await migrateWebSessionSchema(knex, 'cutover', 'up');
}
export async function down(knex: Knex): Promise<void> {
  await migrateWebSessionSchema(knex, 'cutover', 'down');
}
