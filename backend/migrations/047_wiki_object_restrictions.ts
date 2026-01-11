import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // object class restrictions (allowed/anti classes)
  await knex.schema.createTable('wiki_object_classes', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('object_vnum').unsigned().notNullable();
    table.integer('class_id').unsigned().notNullable(); // class bit value
    table.boolean('is_allowed').notNullable().defaultTo(false); // true=allowed, false=restricted

    table.foreign('object_vnum').references('vnum').inTable('wiki_objects').onDelete('CASCADE');
    table.index('object_vnum', 'idx_wiki_obj_classes_vnum');
    table.index('class_id', 'idx_wiki_obj_classes_class');
    table.index(['object_vnum', 'class_id', 'is_allowed'], 'idx_wiki_obj_classes_compound');
  });

  // object race restrictions (allowed/anti races)
  await knex.schema.createTable('wiki_object_races', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('object_vnum').unsigned().notNullable();
    table.tinyint('race_id').unsigned().notNullable(); // race sequential id
    table.boolean('is_allowed').notNullable().defaultTo(false); // true=allowed, false=restricted

    table.foreign('object_vnum').references('vnum').inTable('wiki_objects').onDelete('CASCADE');
    table.index('object_vnum', 'idx_wiki_obj_races_vnum');
    table.index('race_id', 'idx_wiki_obj_races_race');
    table.index(['object_vnum', 'race_id', 'is_allowed'], 'idx_wiki_obj_races_compound');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wiki_object_races');
  await knex.schema.dropTableIfExists('wiki_object_classes');
}
