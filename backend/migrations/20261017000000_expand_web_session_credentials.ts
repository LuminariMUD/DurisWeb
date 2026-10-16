import type { Knex } from 'knex';
import { migrateWebSessionSchema } from '../src/db/webSessionSchema.js';

export const config = { transaction: false };
export async function up(knex: Knex): Promise<void> {
  await migrateWebSessionSchema(knex, 'expand', 'up');
}
export async function down(knex: Knex): Promise<void> {
  await migrateWebSessionSchema(knex, 'expand', 'down');
}
