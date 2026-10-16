import type { Knex } from 'knex';
import { migrateHookAuditSchema } from '../src/db/hookAuditSchema.js';

export const config = { transaction: false };
export async function up(knex: Knex): Promise<void> {
  await migrateHookAuditSchema(knex, 'up');
}
export async function down(knex: Knex): Promise<void> {
  await migrateHookAuditSchema(knex, 'down');
}
