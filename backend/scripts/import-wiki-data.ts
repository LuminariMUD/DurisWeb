/**
 * import objects and mobs from mud flatfiles into database
 * run with: pnpm wiki:publish
 *
 * The whole generation is parsed and validated before any published row is
 * touched, then swapped in one transaction. TRUNCATE is deliberately not used:
 * it commits implicitly, so a failure mid-load left the wiki empty. See
 * docs/ARCHITECTURE.md#generated-projections.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { PoolConnection } from 'mysql2/promise';

import { getBackendConfiguration } from '../src/config/environment.js';
import { pool, closeDatabaseConnection } from '../src/db/connection.js';
import { closeRedisConnection } from '../src/db/redis.js';
import {
  parseWikiSourceIdentity,
  type WikiSourceIdentity,
} from '../src/services/wikiGeneration.js';
import { listZones, parseMobFile, parseObjFile } from '../src/services/zoneBuilderParser.js';
import {
  ITEM_ALLOWED_RACES,
  ITEM_ALLOWED_CLASSES,
  CLASS_BITS,
  RACE_IDS,
  getSpellEffects,
  getSlotIds,
  getFlagIds,
} from '../src/constants/wikiConstants.js';

type Row = unknown[];

/** Child tables are cleared before their parents so foreign keys stay enforced. */
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

const INSERT_BATCH_SIZE = 500;
const executeFile = promisify(execFile);

/** Bind the recorded identity to the exact clean checkout that the parsers will read. */
async function verifySourceIdentity(
  sourceIdentity: WikiSourceIdentity,
  directory: string,
): Promise<void> {
  let status: string;
  let revision: string;
  let tree: string;
  try {
    status = String(
      (await executeFile('git', ['-C', directory, 'status', '--porcelain'], { encoding: 'utf8' }))
        .stdout,
    ).trim();
    revision = String(
      (await executeFile('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }))
        .stdout,
    ).trim();
    tree = String(
      (
        await executeFile('git', ['-C', directory, 'rev-parse', 'HEAD^{tree}'], {
          encoding: 'utf8',
        })
      ).stdout,
    ).trim();
  } catch {
    throw new Error('could not verify the selected MUD checkout source identity');
  }

  if (status !== '') throw new Error('refusing to publish from a dirty MUD checkout');
  if (revision !== sourceIdentity.revision || tree !== sourceIdentity.tree) {
    throw new Error('recorded source identity does not match the selected MUD checkout');
  }
}

const COLUMNS: Record<string, string> = {
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

// Every published statement is a literal so the MUD write allowlist scan can
// see and classify each one; no table name is interpolated at runtime.
const INSERT_SQL: Record<string, string> = {
  wiki_objects: `INSERT INTO wiki_objects (${COLUMNS.wiki_objects}) VALUES ?`,
  wiki_object_affects: `INSERT INTO wiki_object_affects (${COLUMNS.wiki_object_affects}) VALUES ?`,
  wiki_object_slots: `INSERT INTO wiki_object_slots (${COLUMNS.wiki_object_slots}) VALUES ?`,
  wiki_object_spell_effects: `INSERT INTO wiki_object_spell_effects (${COLUMNS.wiki_object_spell_effects}) VALUES ?`,
  wiki_object_classes: `INSERT INTO wiki_object_classes (${COLUMNS.wiki_object_classes}) VALUES ?`,
  wiki_object_races: `INSERT INTO wiki_object_races (${COLUMNS.wiki_object_races}) VALUES ?`,
  wiki_mobs: `INSERT INTO wiki_mobs (${COLUMNS.wiki_mobs}) VALUES ?`,
  wiki_mob_flags: `INSERT INTO wiki_mob_flags (${COLUMNS.wiki_mob_flags}) VALUES ?`,
};

const DELETE_SQL: Record<string, string> = {
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

const stripAnsi = (value: string): string => value.replace(/&[+=-][A-Za-z]|&[nN]/g, '');

/** Insert one statement's rows in bounded batches to keep packet size predictable. */
async function insertAll(connection: PoolConnection, sql: string, rows: Row[]): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
    await connection.query(sql, [batch]);
  }
}

/**
 * Parse every zone's flatfiles, stage a complete generation in memory, then
 * publish it atomically: all children are deleted before their parents inside
 * one transaction, and any failure rolls back to the previous generation.
 */
async function main(args: string[]) {
  console.log('importing wiki data from mud flatfiles...\n');

  const startTime = Date.now();
  let failed = false;

  try {
    const sourceIdentity = parseWikiSourceIdentity(args);
    await verifySourceIdentity(sourceIdentity, getBackendConfiguration().mud.directory);
    console.log('loading zones...');
    const { zones } = await listZones({ page: 1, limit: 10000 });
    console.log(`  found ${zones.length} zones\n`);

    const staged: Record<string, Row[]> = Object.fromEntries(
      PUBLISHED_TABLES.map((table) => [table, [] as Row[]]),
    );

    // ---- parse and stage objects (no published row is touched yet) ----
    console.log('parsing objects...');
    const seenVnums = new Set<number>();

    for (const zone of zones) {
      const objects = await parseObjFile(zone.id);
      if (objects.length === 0) continue;

      for (const obj of objects) {
        if (seenVnums.has(obj.vnum)) continue;
        seenVnums.add(obj.vnum);

        staged.wiki_objects.push([
          obj.vnum,
          stripAnsi(obj.shortDesc),
          obj.shortDesc,
          obj.itemType,
          obj.values[0] || 0,
          obj.weight,
          obj.extraFlags,
          obj.wearFlags,
          obj.antiFlags || 0,
          obj.antiFlags2 || 0,
          zone.number,
          JSON.stringify(obj.values.slice(0, 4)),
          obj.longDesc || null,
        ]);

        for (const apply of obj.applies) {
          if (apply.location > 0 && apply.modifier !== 0) {
            staged.wiki_object_affects.push([obj.vnum, apply.location, apply.modifier]);
          }
        }

        for (const slotId of getSlotIds(obj.wearFlags)) {
          staged.wiki_object_slots.push([obj.vnum, slotId]);
        }

        const effects = getSpellEffects(
          obj.bitvector || 0,
          obj.bitvector2 || 0,
          obj.bitvector3 || 0,
          obj.bitvector4 || 0,
        );
        for (const effect of effects) {
          staged.wiki_object_spell_effects.push([obj.vnum, effect]);
        }

        const antiFlags = obj.antiFlags || 0;
        const isAllowedClasses = (obj.extraFlags & ITEM_ALLOWED_CLASSES) !== 0;
        for (const classBit of CLASS_BITS) {
          if (antiFlags & classBit) {
            staged.wiki_object_classes.push([obj.vnum, classBit, isAllowedClasses]);
          }
        }

        const antiFlags2 = obj.antiFlags2 || 0;
        const isAllowedRaces = (obj.extraFlags & ITEM_ALLOWED_RACES) !== 0;
        for (const raceId of RACE_IDS) {
          if (antiFlags2 & (1 << (raceId - 1))) {
            staged.wiki_object_races.push([obj.vnum, raceId, isAllowedRaces]);
          }
        }
      }

      process.stdout.write(`\r  parsed ${staged.wiki_objects.length} objects from ${zone.id}...`);
    }
    console.log(
      `\n  done: ${staged.wiki_objects.length} objects, ${staged.wiki_object_affects.length} affects, ` +
        `${staged.wiki_object_slots.length} slots, ${staged.wiki_object_spell_effects.length} spell effects, ` +
        `${staged.wiki_object_classes.length} class restrictions, ${staged.wiki_object_races.length} race restrictions\n`,
    );

    // ---- parse and stage mobs ----
    console.log('parsing mobs...');
    const seenMobs = new Set<string>();

    for (const zone of zones) {
      const mobs = await parseMobFile(zone.id);
      if (mobs.length === 0) continue;

      for (const mob of mobs) {
        const key = `${zone.number}:${mob.vnum}`;
        if (seenMobs.has(key)) continue;
        seenMobs.add(key);

        staged.wiki_mobs.push([
          zone.number,
          mob.vnum,
          stripAnsi(mob.shortDesc),
          mob.shortDesc,
          mob.keywords,
          mob.level,
          mob.alignment,
          mob.mobClass,
          mob.species,
          mob.gold,
          mob.exp,
          mob.actFlags,
          mob.hitDice,
          mob.damDice,
          mob.ac,
          mob.thac0,
          mob.longDesc || null,
          mob.detailedDesc || null,
        ]);

        for (const flagId of getFlagIds(mob.actFlags)) {
          staged.wiki_mob_flags.push([zone.number, mob.vnum, flagId]);
        }
      }

      process.stdout.write(`\r  parsed ${staged.wiki_mobs.length} mobs from ${zone.id}...`);
    }
    console.log(
      `\n  done: ${staged.wiki_mobs.length} mobs, ${staged.wiki_mob_flags.length} flags\n`,
    );

    // Publishing an empty generation would silently take the wiki offline.
    if (staged.wiki_objects.length === 0 || staged.wiki_mobs.length === 0) {
      throw new Error(
        `refusing to publish an empty generation (${staged.wiki_objects.length} objects, ${staged.wiki_mobs.length} mobs)`,
      );
    }

    // ---- publish the complete generation in one transaction ----
    console.log('publishing generation...');
    const connection = await pool.getConnection();
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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nimport complete in ${elapsed}s`);
    console.log(`  objects: ${staged.wiki_objects.length}`);
    console.log(`  mobs: ${staged.wiki_mobs.length}`);
  } catch (error) {
    failed = true;
    console.error('\nimport failed; the previous generation is unchanged');
    console.error('error:', error);
  } finally {
    await closeDatabaseConnection();
    await closeRedisConnection();
    process.exit(failed ? 1 : 0);
  }
}

main(process.argv.slice(2));
