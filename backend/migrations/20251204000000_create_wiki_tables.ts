import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Wiki continents reference table
  await knex.schema.createTable('wiki_continents', (table) => {
    table.integer('id').unsigned().primary();
    table.string('name', 100).notNullable();
    table.string('name_ansi', 255).nullable();
    table.integer('seed_room_vnum').unsigned().notNullable();
    table.integer('center_x').nullable();
    table.integer('center_y').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
  });

  // Wiki map positions (extracted from zone files)
  await knex.schema.createTable('wiki_map_positions', (table) => {
    table.integer('room_vnum').unsigned().primary();
    table.integer('x_coord').notNullable();
    table.integer('y_coord').notNullable();
    table.integer('z_coord').notNullable().defaultTo(0);
    table.tinyint('sector_type').unsigned().notNullable();
    table.integer('zone_number').unsigned().notNullable();
    table.string('zone_name', 255).nullable();
    table.string('room_name', 255).nullable();
    table.integer('continent_id').unsigned().nullable();
    table.boolean('is_map_room').notNullable().defaultTo(true);
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());

    // Indexes for spatial queries
    table.index(['x_coord', 'y_coord'], 'idx_wiki_map_coords');
    table.index('zone_number', 'idx_wiki_map_zone');
    table.index('continent_id', 'idx_wiki_map_continent');
  });

  // Zone entrances (where map rooms lead to other zones)
  await knex.schema.createTable('wiki_zone_entrances', (table) => {
    table.increments('id').unsigned().primary();
    table.integer('from_room_vnum').unsigned().notNullable();
    table.integer('to_room_vnum').unsigned().notNullable();
    table.integer('to_zone_number').unsigned().notNullable();
    table.string('to_zone_name', 255).nullable();
    table.string('direction', 20).notNullable();
    table.integer('x_coord').nullable();
    table.integer('y_coord').nullable();
    table.datetime('created_at').notNullable().defaultTo(knex.fn.now());

    // Unique constraint on from_room + direction
    table.unique(['from_room_vnum', 'direction'], { indexName: 'unique_entrance_direction' });

    // Indexes
    table.index('from_room_vnum', 'idx_wiki_entrance_from');
    table.index(['x_coord', 'y_coord'], 'idx_wiki_entrance_coords');
    table.index('to_zone_number', 'idx_wiki_entrance_to_zone');
  });

  // Seed the continents data (from MUD src/map.c)
  await knex('wiki_continents').insert([
    { id: 1, name: 'Good Continent', name_ansi: '&+WGood Continent', seed_room_vnum: 546926 },
    { id: 2, name: 'Evil Continent', name_ansi: '&+LEvil Continent', seed_room_vnum: 607066 },
    { id: 3, name: 'Ice Crag', name_ansi: '&+WIce &+CCrag', seed_room_vnum: 521504 },
    { id: 4, name: 'Khomani-Khan', name_ansi: '&+gKhomani-Khan', seed_room_vnum: 608451 },
    { id: 5, name: 'Undead Continent', name_ansi: '&+rUndead Continent', seed_room_vnum: 567408 },
    { id: 6, name: 'Jade Empire', name_ansi: '&+GJade &+gEmpire', seed_room_vnum: 644892 },
    { id: 7, name: 'Island of Dragons', name_ansi: '&+cIsland &+yof &+cDragons', seed_room_vnum: 643968 },
    { id: 8, name: 'Ceothia', name_ansi: '&+bCeothia', seed_room_vnum: 628685 },
    { id: 9, name: 'Fort Boyard', name_ansi: '&+rFort &+RBoyard', seed_room_vnum: 562323 },
    { id: 10, name: 'Venan\'Trut', name_ansi: '&+YVenan\'Trut', seed_room_vnum: 545016 },
    { id: 11, name: 'Shadow Island', name_ansi: '&+LShadow Island', seed_room_vnum: 513382 },
    { id: 12, name: 'Scorched Island', name_ansi: '&+rSc&+Ro&+Yrc&+Rh&+red &+rIsland', seed_room_vnum: 576166 },
    { id: 13, name: 'Tezcatlipoca', name_ansi: '&+rT&+Rez&+rca&+Rtl&+rip&+Ro&+rca', seed_room_vnum: 575445 },
    { id: 14, name: 'Moonshae Island', name_ansi: '&+YMoonshae &+GIsland', seed_room_vnum: 556818 },
  ]);

  // Create wiki_settings table for web-only settings
  await knex.schema.createTable('wiki_settings', (table) => {
    table.string('key', 100).primary();
    table.string('value', 255).notNullable();
    table.string('description', 500).nullable();
    table.datetime('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Insert default wiki settings
  await knex('wiki_settings').insert([
    {
      key: 'access_level',
      value: 'public',
      description: 'Wiki access level: public (anyone) or registered (logged in users only)'
    },
    {
      key: 'realtime_enabled',
      value: 'false',
      description: 'Whether real-time player/ship positions are enabled on the map'
    }
  ]);

  // Add wiki permission for viewing real-time map data
  await knex('admin_permissions').insert({
    permission_key: 'view_wiki_realtime',
    permission_name: 'View Wiki Realtime Map',
    description: 'View real-time player and ship positions on the wiki world map',
    category: 'wiki',
    sort_order: 50,
  });

  // Get permission ID
  const [viewWikiRealtime] = await knex('admin_permissions')
    .select('id')
    .where('permission_key', 'view_wiki_realtime');

  // Add to Full Admin role if it exists
  const [fullAdmin] = await knex('admin_roles')
    .select('id')
    .where('role_name', 'Full Admin');

  if (fullAdmin && viewWikiRealtime) {
    await knex('admin_role_permissions').insert({
      role_id: fullAdmin.id,
      permission_id: viewWikiRealtime.id,
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // Remove wiki permission
  const [permission] = await knex('admin_permissions')
    .select('id')
    .where('permission_key', 'view_wiki_realtime');

  if (permission) {
    await knex('admin_role_permissions')
      .where('permission_id', permission.id)
      .delete();
    await knex('admin_account_permissions')
      .where('permission_id', permission.id)
      .delete();
    await knex('admin_permissions')
      .where('permission_key', 'view_wiki_realtime')
      .delete();
  }

  // Drop tables in reverse order (respecting potential foreign keys)
  await knex.schema.dropTableIfExists('wiki_settings');
  await knex.schema.dropTableIfExists('wiki_zone_entrances');
  await knex.schema.dropTableIfExists('wiki_map_positions');
  await knex.schema.dropTableIfExists('wiki_continents');
}
