/**
 * import objects and mobs from mud flatfiles into database
 * run with: pnpm wiki:publish
 *
 * The whole generation is parsed and validated before any published row is
 * touched, then swapped in one transaction. TRUNCATE is deliberately not used:
 * it commits implicitly, so a failure mid-load left the wiki empty. See
 * docs/ARCHITECTURE.md#generated-projections.
 */
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getBackendConfiguration } from '../src/config/environment.js';
import { pool, closeDatabaseConnection } from '../src/db/connection.js';
import { closeRedisConnection } from '../src/db/redis.js';
import { withMudRoot } from '../src/services/flatfileAccess.js';
import {
  createWikiPublicationRows,
  publishWikiGeneration,
  type WikiPublicationRows,
} from '../src/services/wikiPublication.js';
import {
  runWikiPublicationCommand,
  type WikiPublicationCommandDependencies,
} from '../src/services/wikiPublicationCommand.js';
import { withWikiSourceSnapshot } from '../src/services/wikiSourceSnapshot.js';
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

/** Remove MUD color codes from the plain-text search/display column. */
const stripAnsi = (value: string): string => value.replace(/&[+=-][A-Za-z]|&[nN]/g, '');

/** Parse every zone from the currently scoped immutable MUD root into memory. */
async function stageWikiGeneration(): Promise<WikiPublicationRows> {
  console.log('loading zones...');
  const { zones } = await listZones({ page: 1, limit: 10000 });
  console.log(`  found ${zones.length} zones\n`);

  const staged = createWikiPublicationRows();

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
  console.log(`\n  done: ${staged.wiki_mobs.length} mobs, ${staged.wiki_mob_flags.length} flags\n`);

  return staged;
}

/** Build production command dependencies without resolving environment configuration at import. */
function defaultCommandDependencies(): WikiPublicationCommandDependencies {
  return {
    sourceDirectory: getBackendConfiguration().mud.directory,
    stage: (sourceIdentity, sourceDirectory) =>
      withWikiSourceSnapshot(sourceIdentity, sourceDirectory, (snapshotRoot) =>
        withMudRoot(snapshotRoot, stageWikiGeneration),
      ),
    publish: async (sourceIdentity, staged) => {
      console.log('publishing generation...');
      await publishWikiGeneration(pool, sourceIdentity, staged);
    },
  };
}

/** Execute the publication command with production snapshot and transaction dependencies. */
async function runWikiPublication(args: string[]): Promise<WikiPublicationRows> {
  return runWikiPublicationCommand(args, defaultCommandDependencies());
}

/** Own CLI lifecycle and preserve the previous generation on every failure. */
async function main(args: string[]): Promise<void> {
  console.log('importing wiki data from mud flatfiles...\n');

  const startTime = Date.now();
  let failed = false;

  try {
    const staged = await runWikiPublication(args);

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
    process.exitCode = failed ? 1 : 0;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) void main(process.argv.slice(2));
