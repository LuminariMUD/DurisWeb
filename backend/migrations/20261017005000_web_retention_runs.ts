import type { Knex } from 'knex';
import { migrateRetentionRunSchema } from '../src/db/retentionRunSchema.js';

export const config = { transaction: false };
export async function up(knex: Knex): Promise<void> {
  await migrateRetentionRunSchema(knex, 'up');
}
export async function down(knex: Knex): Promise<void> {
  await migrateRetentionRunSchema(knex, 'down');
}
