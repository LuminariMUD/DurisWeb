import type { Knex } from 'knex';
import { migratePostImageRemovalSchema } from '../src/db/postImageRemovalSchema.js';

export const config = { transaction: false };
export async function up(knex: Knex): Promise<void> {
  await migratePostImageRemovalSchema(knex, 'up');
}
export async function down(knex: Knex): Promise<void> {
  await migratePostImageRemovalSchema(knex, 'down');
}
