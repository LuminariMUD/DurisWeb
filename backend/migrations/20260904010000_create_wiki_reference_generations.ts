import type { Knex } from 'knex';

/** Persist the identity and aggregate counts for the atomically published wiki projection. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('wiki_reference_generations', (table) => {
    table.tinyint('id').unsigned().primary();
    table.string('source_revision', 128).notNullable();
    table.string('source_tree', 128).notNullable();
    table.integer('object_count').unsigned().notNullable();
    table.integer('mob_count').unsigned().notNullable();
    table.datetime('published_at').notNullable();
  });
}

/** Remove only the DurisWeb-owned generation marker. */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wiki_reference_generations');
}
