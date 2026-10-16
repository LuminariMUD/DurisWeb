import type { Knex } from 'knex';
import { migrateDataHoldSchema } from '../src/db/dataHoldSchema.js';

export const config = { transaction: false };
export async function up(knex: Knex): Promise<void> {
  await migrateDataHoldSchema(knex, 'up');
}
export async function down(knex: Knex): Promise<void> {
  await migrateDataHoldSchema(knex, 'down');
}
