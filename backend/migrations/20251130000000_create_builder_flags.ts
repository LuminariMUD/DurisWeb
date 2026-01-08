import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('builder_flags', (table) => {
    table.increments('id').unsigned().primary();
    table.string('category', 50).notNullable(); // e.g., 'obj_wear', 'obj_extra', 'mob_class'
    table.string('name', 100).notNullable(); // e.g., 'TAKE', 'WARRIOR', 'DARK'
    table.bigInteger('value').notNullable(); // The numeric value (can be large for BIT_32)
    table.string('description', 255).nullable(); // Human-readable description
    table.string('ansi_name', 255).nullable(); // ANSI-colored version (for classes/races)
    table.string('short_code', 10).nullable(); // Short code (e.g., 'War' for Warrior)
    table.tinyint('editable').unsigned().notNullable().defaultTo(1); // Whether it's editable in builder
    table.integer('sort_order').notNullable().defaultTo(0); // For display ordering
    table.string('source_file', 100).nullable(); // Which MUD source file it came from
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint on category + name
    table.unique(['category', 'name'], { indexName: 'unique_category_name' });

    // Index for category lookups
    table.index('category', 'idx_builder_flags_category');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('builder_flags');
}
