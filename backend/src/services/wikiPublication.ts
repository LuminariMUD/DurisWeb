import type { Pool, PoolConnection } from 'mysql2/promise';

import type { WikiSourceIdentity } from './wikiGeneration.js';

export type WikiPublicationRow = unknown[];

const PUBLISHED_TABLES = [
  'wiki_mob_flags',
  'wiki_object_races',
  'wiki_object_classes',
  'wiki_object_spell_effects',
  'wiki_object_slots',
  'wiki_object_affects',
  'wiki_mobs',
  'wiki_objects',
] as const;

type WikiPublishedTable = (typeof PUBLISHED_TABLES)[number];
export type WikiPublicationRows = Record<WikiPublishedTable, WikiPublicationRow[]>;

const COLUMNS: Record<WikiPublishedTable, string> = {
  wiki_objects:
    'vnum, name, name_ansi, type, level, weight, extra_flags, wear_flags, anti_flags, anti_flags2, zone_number, obj_values, description',
  wiki_object_affects: 'object_vnum, location, modifier',
  wiki_object_slots: 'object_vnum, slot_id',
  wiki_object_spell_effects: 'object_vnum, effect_name',
  wiki_object_classes: 'object_vnum, class_id, is_allowed',
  wiki_object_races: 'object_vnum, race_id, is_allowed',
  wiki_mobs:
    'zone_number, vnum, name, name_ansi, keywords, level, alignment, mob_class, species, gold, exp, act_flags, hit_dice, dam_dice, ac, thac0, long_desc, detailed_desc',
  wiki_mob_flags: 'zone_number, mob_vnum, flag_id',
};

const INSERT_SQL: Record<WikiPublishedTable, string> = {
  wiki_objects: `INSERT INTO wiki_objects (${COLUMNS.wiki_objects}) VALUES ?`,
  wiki_object_affects: `INSERT INTO wiki_object_affects (${COLUMNS.wiki_object_affects}) VALUES ?`,
  wiki_object_slots: `INSERT INTO wiki_object_slots (${COLUMNS.wiki_object_slots}) VALUES ?`,
  wiki_object_spell_effects: `INSERT INTO wiki_object_spell_effects (${COLUMNS.wiki_object_spell_effects}) VALUES ?`,
  wiki_object_classes: `INSERT INTO wiki_object_classes (${COLUMNS.wiki_object_classes}) VALUES ?`,
  wiki_object_races: `INSERT INTO wiki_object_races (${COLUMNS.wiki_object_races}) VALUES ?`,
  wiki_mobs: `INSERT INTO wiki_mobs (${COLUMNS.wiki_mobs}) VALUES ?`,
  wiki_mob_flags: `INSERT INTO wiki_mob_flags (${COLUMNS.wiki_mob_flags}) VALUES ?`,
};

const DELETE_SQL: Record<WikiPublishedTable, string> = {
  wiki_mob_flags: 'DELETE FROM wiki_mob_flags',
  wiki_object_races: 'DELETE FROM wiki_object_races',
  wiki_object_classes: 'DELETE FROM wiki_object_classes',
  wiki_object_spell_effects: 'DELETE FROM wiki_object_spell_effects',
  wiki_object_slots: 'DELETE FROM wiki_object_slots',
  wiki_object_affects: 'DELETE FROM wiki_object_affects',
  wiki_mobs: 'DELETE FROM wiki_mobs',
  wiki_objects: 'DELETE FROM wiki_objects',
};

const PUBLISH_GENERATION_SQL = `
  INSERT INTO wiki_reference_generations
    (id, source_revision, source_tree, object_count, mob_count, published_at)
  VALUES (1, ?, ?, ?, ?, UTC_TIMESTAMP())
  ON DUPLICATE KEY UPDATE
    source_revision = VALUES(source_revision),
    source_tree = VALUES(source_tree),
    object_count = VALUES(object_count),
    mob_count = VALUES(mob_count),
    published_at = VALUES(published_at)
`;

const INSERT_BATCH_SIZE = 500;

/** Allocate a complete empty staging area with one row list per published table. */
export function createWikiPublicationRows(): WikiPublicationRows {
  return {
    wiki_mob_flags: [],
    wiki_object_races: [],
    wiki_object_classes: [],
    wiki_object_spell_effects: [],
    wiki_object_slots: [],
    wiki_object_affects: [],
    wiki_mobs: [],
    wiki_objects: [],
  };
}

/** Refuse an aggregate that silently omitted malformed source input. */
export function assertNoRejectedWikiSourceInputs(before: number, after: number): void {
  if (
    !Number.isSafeInteger(before) ||
    !Number.isSafeInteger(after) ||
    before < 0 ||
    after < before
  ) {
    throw new Error('invalid rejected wiki source input counters');
  }
  if (after > before) {
    throw new Error(
      `refusing to publish a wiki generation with ${after - before} rejected source input(s)`,
    );
  }
}

/** Match the runtime preflight's minimum mob filter-metadata contract before touching SQL. */
function assertApplicableMobMetadata(staged: WikiPublicationRows): void {
  const hasClass = staged.wiki_mobs.some((row) => Number(row[7]) > 0);
  const hasRace = staged.wiki_mobs.some((row) => Number(row[8]) > 0);
  if (!hasClass || !hasRace || staged.wiki_mob_flags.length === 0) {
    throw new Error('refusing to publish a wiki generation without applicable mob filter metadata');
  }
}

/** Insert one statement's rows in bounded batches to keep packet size predictable. */
async function insertAll(
  connection: PoolConnection,
  sql: string,
  rows: WikiPublicationRow[],
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    await connection.query(sql, [batch]);
  }
}

/** Publish all staged rows and their source identity in one rollback-safe transaction. */
export async function publishWikiGeneration(
  database: Pick<Pool, 'getConnection'>,
  sourceIdentity: WikiSourceIdentity,
  staged: WikiPublicationRows,
): Promise<void> {
  if (staged.wiki_objects.length === 0 || staged.wiki_mobs.length === 0) {
    throw new Error(
      `refusing to publish an empty generation (${staged.wiki_objects.length} objects, ${staged.wiki_mobs.length} mobs)`,
    );
  }
  assertApplicableMobMetadata(staged);

  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();

    for (const table of PUBLISHED_TABLES) {
      await connection.query(DELETE_SQL[table]);
    }
    for (const table of [...PUBLISHED_TABLES].reverse()) {
      await insertAll(connection, INSERT_SQL[table], staged[table]);
    }
    await connection.query(PUBLISH_GENERATION_SQL, [
      sourceIdentity.revision,
      sourceIdentity.tree,
      staged.wiki_objects.length,
      staged.wiki_mobs.length,
    ]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
