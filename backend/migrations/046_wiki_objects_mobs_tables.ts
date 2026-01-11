import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // main objects table
  await knex.schema.createTable('wiki_objects', (table) => {
    table.integer('vnum').unsigned().primary();
    table.string('name', 255).notNullable();
    table.string('name_ansi', 500).nullable();
    table.tinyint('type').unsigned().notNullable().defaultTo(0);
    table.integer('level').notNullable().defaultTo(0); // values[0], range -1000 to 1.5B
    table.integer('weight').notNullable().defaultTo(0); // can be negative
    table.integer('extra_flags').unsigned().notNullable().defaultTo(0);
    table.integer('wear_flags').unsigned().notNullable().defaultTo(0);
    table.integer('anti_flags').unsigned().notNullable().defaultTo(0);
    table.integer('anti_flags2').unsigned().notNullable().defaultTo(0);
    table.integer('zone_number').unsigned().notNullable();
    table.json('obj_values').nullable(); // array of 4 ints
    table.text('description').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.index('type', 'idx_wiki_objects_type');
    table.index('level', 'idx_wiki_objects_level');
    table.index('zone_number', 'idx_wiki_objects_zone');
  });

  // object affects (stat modifiers like +hit, +dam, +str)
  await knex.schema.createTable('wiki_object_affects', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('object_vnum').unsigned().notNullable();
    table.tinyint('location').unsigned().notNullable(); // affect type id
    table.smallint('modifier').notNullable();

    table.foreign('object_vnum').references('vnum').inTable('wiki_objects').onDelete('CASCADE');
    table.index('object_vnum', 'idx_wiki_obj_affects_vnum');
    table.index(['location', 'modifier'], 'idx_wiki_obj_affects_loc_mod');
  });

  // object wear slots
  await knex.schema.createTable('wiki_object_slots', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('object_vnum').unsigned().notNullable();
    table.tinyint('slot_id').unsigned().notNullable();

    table.foreign('object_vnum').references('vnum').inTable('wiki_objects').onDelete('CASCADE');
    table.index('object_vnum', 'idx_wiki_obj_slots_vnum');
    table.index('slot_id', 'idx_wiki_obj_slots_slot');
  });

  // object spell effects
  await knex.schema.createTable('wiki_object_spell_effects', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('object_vnum').unsigned().notNullable();
    table.string('effect_name', 100).notNullable();

    table.foreign('object_vnum').references('vnum').inTable('wiki_objects').onDelete('CASCADE');
    table.index('object_vnum', 'idx_wiki_obj_spells_vnum');
    table.index('effect_name', 'idx_wiki_obj_spells_name');
  });

  // main mobs table (composite pk: zone_number + vnum)
  await knex.schema.createTable('wiki_mobs', (table) => {
    table.integer('zone_number').unsigned().notNullable();
    table.integer('vnum').unsigned().notNullable();
    table.string('name', 255).notNullable();
    table.string('name_ansi', 500).nullable();
    table.string('keywords', 500).nullable();
    table.tinyint('level').unsigned().notNullable().defaultTo(1);
    table.smallint('alignment').notNullable().defaultTo(0);
    table.bigint('mob_class').unsigned().notNullable().defaultTo(0); // can be 4B+
    table.tinyint('species').unsigned().notNullable().defaultTo(0);
    table.integer('gold').unsigned().notNullable().defaultTo(0);
    table.integer('exp').unsigned().notNullable().defaultTo(0);
    table.integer('act_flags').unsigned().notNullable().defaultTo(0);
    table.string('hit_dice', 50).nullable();
    table.string('dam_dice', 50).nullable();
    table.smallint('ac').notNullable().defaultTo(0);
    table.smallint('thac0').notNullable().defaultTo(20); // range -180 to 500
    table.text('long_desc').nullable();
    table.text('detailed_desc').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());

    table.primary(['zone_number', 'vnum']);
    table.index('level', 'idx_wiki_mobs_level');
    table.index('alignment', 'idx_wiki_mobs_alignment');
    table.index('mob_class', 'idx_wiki_mobs_class');
    table.index('species', 'idx_wiki_mobs_species');
    table.index('zone_number', 'idx_wiki_mobs_zone');
  });

  // mob flags (parsed act flags for easy filtering)
  await knex.schema.createTable('wiki_mob_flags', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('zone_number').unsigned().notNullable();
    table.integer('mob_vnum').unsigned().notNullable();
    table.integer('flag_id').unsigned().notNullable();

    table.foreign(['zone_number', 'mob_vnum'])
      .references(['zone_number', 'vnum'])
      .inTable('wiki_mobs')
      .onDelete('CASCADE');
    table.index(['zone_number', 'mob_vnum'], 'idx_wiki_mob_flags_mob');
    table.index('flag_id', 'idx_wiki_mob_flags_flag');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('wiki_mob_flags');
  await knex.schema.dropTableIfExists('wiki_mobs');
  await knex.schema.dropTableIfExists('wiki_object_spell_effects');
  await knex.schema.dropTableIfExists('wiki_object_slots');
  await knex.schema.dropTableIfExists('wiki_object_affects');
  await knex.schema.dropTableIfExists('wiki_objects');
}
