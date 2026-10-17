import type { Knex } from 'knex';
import { migrateReactionExportIndexSchema } from '../src/db/reactionExportIndexSchema.js';

export const config = { transaction: false };
export async function up(knex: Knex): Promise<void> {
  await migrateReactionExportIndexSchema(knex, 'up');
}
export async function down(knex: Knex): Promise<void> {
  await migrateReactionExportIndexSchema(knex, 'down');
}
