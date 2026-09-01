/**
 * import objects and mobs from mud flatfiles into database
 * run with: npx tsx scripts/import-wiki-data.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { pool, closeDatabaseConnection } from '../src/db/connection.js';
import { closeRedisConnection } from '../src/db/redis.js';
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

async function main() {
  console.log('importing wiki data from mud flatfiles...\n');

  const startTime = Date.now();
  const connection = await pool.getConnection();

  try {
    // get all zones first (before transaction, read-only)
    console.log('loading zones...');
    const { zones } = await listZones({ page: 1, limit: 10000 });
    console.log(`  found ${zones.length} zones\n`);

    // start transaction for entire import
    await connection.beginTransaction();
    console.log('transaction started...\n');

    // truncate existing data (within transaction)
    console.log('clearing existing data...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE wiki_mob_flags');
    await connection.query('TRUNCATE TABLE wiki_mobs');
    await connection.query('TRUNCATE TABLE wiki_object_races');
    await connection.query('TRUNCATE TABLE wiki_object_classes');
    await connection.query('TRUNCATE TABLE wiki_object_spell_effects');
    await connection.query('TRUNCATE TABLE wiki_object_slots');
    await connection.query('TRUNCATE TABLE wiki_object_affects');
    await connection.query('TRUNCATE TABLE wiki_objects');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('  done\n');

    // import objects
    console.log('importing objects...');
    let totalObjects = 0;
    let totalAffects = 0;
    let totalSlots = 0;
    let totalSpellEffects = 0;
    let totalClasses = 0;
    let totalRaces = 0;
    const seenVnums = new Set<number>();

    for (const zone of zones) {
      const objects = await parseObjFile(zone.id);
      if (objects.length === 0) continue;

      for (const obj of objects) {
        if (seenVnums.has(obj.vnum)) continue;
        seenVnums.add(obj.vnum);

        const level = obj.values[0] || 0;
        await connection.query(
          `INSERT INTO wiki_objects
           (vnum, name, name_ansi, type, level, weight, extra_flags, wear_flags, anti_flags, anti_flags2, zone_number, obj_values, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            obj.vnum,
            obj.shortDesc.replace(/&[+=-][A-Za-z]|&[nN]/g, ''),
            obj.shortDesc,
            obj.itemType,
            level,
            obj.weight,
            obj.extraFlags,
            obj.wearFlags,
            obj.antiFlags || 0,
            obj.antiFlags2 || 0,
            zone.number,
            JSON.stringify(obj.values.slice(0, 4)),
            obj.longDesc || null,
          ],
        );
        totalObjects++;

        for (const apply of obj.applies) {
          if (apply.location > 0 && apply.modifier !== 0) {
            await connection.query(
              `INSERT INTO wiki_object_affects (object_vnum, location, modifier) VALUES (?, ?, ?)`,
              [obj.vnum, apply.location, apply.modifier],
            );
            totalAffects++;
          }
        }

        const slotIds = getSlotIds(obj.wearFlags);
        for (const slotId of slotIds) {
          await connection.query(
            `INSERT INTO wiki_object_slots (object_vnum, slot_id) VALUES (?, ?)`,
            [obj.vnum, slotId],
          );
          totalSlots++;
        }

        const effects = getSpellEffects(
          obj.bitvector || 0,
          obj.bitvector2 || 0,
          obj.bitvector3 || 0,
          obj.bitvector4 || 0,
        );
        for (const effect of effects) {
          await connection.query(
            `INSERT INTO wiki_object_spell_effects (object_vnum, effect_name) VALUES (?, ?)`,
            [obj.vnum, effect],
          );
          totalSpellEffects++;
        }

        const antiFlags = obj.antiFlags || 0;
        const isAllowedClasses = (obj.extraFlags & ITEM_ALLOWED_CLASSES) !== 0;
        for (const classBit of CLASS_BITS) {
          if (antiFlags & classBit) {
            await connection.query(
              `INSERT INTO wiki_object_classes (object_vnum, class_id, is_allowed) VALUES (?, ?, ?)`,
              [obj.vnum, classBit, isAllowedClasses],
            );
            totalClasses++;
          }
        }

        const antiFlags2 = obj.antiFlags2 || 0;
        const isAllowedRaces = (obj.extraFlags & ITEM_ALLOWED_RACES) !== 0;
        for (const raceId of RACE_IDS) {
          const raceBit = 1 << (raceId - 1);
          if (antiFlags2 & raceBit) {
            await connection.query(
              `INSERT INTO wiki_object_races (object_vnum, race_id, is_allowed) VALUES (?, ?, ?)`,
              [obj.vnum, raceId, isAllowedRaces],
            );
            totalRaces++;
          }
        }
      }

      process.stdout.write(`\r  processed ${totalObjects} objects from ${zone.id}...`);
    }
    console.log(
      `\n  done: ${totalObjects} objects, ${totalAffects} affects, ${totalSlots} slots, ${totalSpellEffects} spell effects, ${totalClasses} class restrictions, ${totalRaces} race restrictions\n`,
    );

    // import mobs
    console.log('importing mobs...');
    let totalMobs = 0;
    let totalFlags = 0;
    const seenMobs = new Set<string>();

    for (const zone of zones) {
      const mobs = await parseMobFile(zone.id);
      if (mobs.length === 0) continue;

      for (const mob of mobs) {
        const key = `${zone.number}:${mob.vnum}`;
        if (seenMobs.has(key)) continue;
        seenMobs.add(key);

        await connection.query(
          `INSERT INTO wiki_mobs
           (zone_number, vnum, name, name_ansi, keywords, level, alignment, mob_class, species, gold, exp, act_flags, hit_dice, dam_dice, ac, thac0, long_desc, detailed_desc)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            zone.number,
            mob.vnum,
            mob.shortDesc.replace(/&[+=-][A-Za-z]|&[nN]/g, ''),
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
          ],
        );
        totalMobs++;

        const flagIds = getFlagIds(mob.actFlags);
        for (const flagId of flagIds) {
          await connection.query(
            `INSERT INTO wiki_mob_flags (zone_number, mob_vnum, flag_id) VALUES (?, ?, ?)`,
            [zone.number, mob.vnum, flagId],
          );
          totalFlags++;
        }
      }

      process.stdout.write(`\r  processed ${totalMobs} mobs from ${zone.id}...`);
    }
    console.log(`\n  done: ${totalMobs} mobs, ${totalFlags} flags\n`);

    // commit transaction
    await connection.commit();
    console.log('transaction committed successfully\n');

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`import complete in ${elapsed}s`);
    console.log(`  objects: ${totalObjects}`);
    console.log(`  mobs: ${totalMobs}`);
  } catch (error) {
    // rollback on any error
    console.error('\nimport failed, rolling back...');
    await connection.rollback();
    console.error('rollback complete');
    console.error('error:', error);
    process.exit(1);
  } finally {
    connection.release();
    await closeDatabaseConnection();
    await closeRedisConnection();
    process.exit(0);
  }
}

main();
