// Zone File Writer for DurisMUD
// Writes .wld, .mob, .obj files back to disk
// Uses zone ID (filename) as unique identifier

import * as fs from 'fs/promises';
import { constants as fsConstants } from 'fs';
import * as path from 'path';
import {
  Room,
  Mobile,
  ZoneObject,
  DIRECTION_INDEX,
  ResetCommand,
} from '../types/builder.js';
import { invalidateZoneFileMap, invalidateZoneIndexCache } from './zoneBuilderParser.js';
import logger, { isErrorWithCode } from '../utils/logger.js';
import { pool } from '../db/connection.js';
import type { RowDataPacket } from 'mysql2';
import { resolveSafeZoneDirectoryPath, resolveSafeZoneFilePath, UnsafeZonePathError } from '../utils/safeZonePath.js';

const MUD_DIR = process.env.MUD_DIR || '/home/resakse/Coding/DurisMUD';
const AREAS_DIR = path.join(MUD_DIR, 'areas');

// Cache for species short code to numeric index mapping
let speciesCodeMap: Map<string, number> | null = null;
// Cache for numeric index to short code (reverse lookup for writing)
let speciesIndexMap: Map<number, string> | null = null;

// Build mapping of species short code <-> numeric index from builder_flags table
async function buildSpeciesMaps(): Promise<void> {
  if (speciesCodeMap && speciesIndexMap) return;

  speciesCodeMap = new Map<string, number>();
  speciesIndexMap = new Map<number, string>();

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT value, short_code FROM builder_flags WHERE category = ? AND short_code IS NOT NULL',
      ['mob_race']
    );

    for (const row of rows) {
      if (row.short_code) {
        speciesCodeMap.set(row.short_code.toUpperCase(), row.value);
        speciesIndexMap.set(row.value, row.short_code);
      }
    }
  } catch (error) {
    logger.error('Failed to build species maps:', error);
  }
}

// Convert species code (e.g., "PH", "UG") to numeric index
async function speciesCodeToIndex(code: string): Promise<number> {
  await buildSpeciesMaps();
  const upperCode = code.toUpperCase();

  if (speciesCodeMap?.has(upperCode)) {
    return speciesCodeMap.get(upperCode)!;
  }

  // If code is already numeric, use it directly
  const numericValue = parseInt(code, 10);
  if (!isNaN(numericValue)) {
    return numericValue;
  }

  return 0; // Unknown code
}

// Convert numeric index to species short code (for writing)
async function speciesIndexToCode(index: number): Promise<string> {
  await buildSpeciesMaps();

  if (speciesIndexMap?.has(index)) {
    return speciesIndexMap.get(index)!;
  }

  // Fallback to numeric string if no code found
  return String(index);
}

// Helper to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper to read file
async function readFile(filePath: string): Promise<string> {
  return await fs.readFile(filePath, 'utf-8');
}

// Helper to ensure directory exists
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (isErrorWithCode(error) && error.code !== 'EEXIST') throw error;
  }
}

// Helper to create backup
async function createBackup(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }

  const backupPath = `${filePath}.bak`;
  const temporaryPath = `${backupPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    try {
      const backupStat = await fs.lstat(backupPath);
      if (backupStat.isSymbolicLink()) {
        throw new UnsafeZonePathError('Zone backup is a symbolic link');
      }
    } catch (error) {
      if (error instanceof UnsafeZonePathError) throw error;
      if (!(isErrorWithCode(error) && error.code === 'ENOENT')) throw error;
    }

    await fs.copyFile(filePath, temporaryPath, fsConstants.COPYFILE_EXCL);
    await fs.rename(temporaryPath, backupPath);
    return backupPath;
  } catch (error) {
    try {
      await fs.unlink(temporaryPath);
    } catch {
      // Temporary backup cleanup is best-effort.
    }
    if (error instanceof UnsafeZonePathError) throw error;
    return null;
  }
}

// Format room to .wld format
function formatRoom(room: Room): string {
  const lines: string[] = [];

  // Room number
  lines.push(`#${room.vnum}`);

  // Room name with ~
  lines.push(`${room.name}~`);

  // Room description with ~ on its own line
  lines.push(room.description);
  lines.push('~');

  // Zone number, room flags, sector type
  lines.push(`${room.zoneNumber} ${room.roomFlags} ${room.sectorType}`);

  // Exits (sorted by direction index)
  const sortedExits = [...room.exits].sort(
    (a, b) => DIRECTION_INDEX[a.direction] - DIRECTION_INDEX[b.direction]
  );

  for (const exit of sortedExits) {
    const dirIndex = DIRECTION_INDEX[exit.direction];
    lines.push(`D${dirIndex}`);

    // Exit description
    if (exit.description) {
      lines.push(exit.description);
    }
    lines.push('~');

    // Keywords
    lines.push(`${exit.keywords}~`);

    // Door flag, key, to_room
    lines.push(`${exit.doorFlag} ${exit.keyVnum} ${exit.toRoom}`);
  }

  // Extra descriptions
  for (const extra of room.extras) {
    lines.push('E');
    lines.push(`${extra.keywords}~`);
    lines.push(extra.description);
    lines.push('~');
  }

  // Optional fall chance
  if (room.fallChance !== undefined && room.fallChance > 0) {
    lines.push('F');
    lines.push(`${room.fallChance}`);
  }

  // Optional current
  if (room.currentSpeed !== undefined && room.currentDirection !== undefined) {
    lines.push('C');
    lines.push(`${room.currentSpeed} ${room.currentDirection}`);
  }

  // End of room
  lines.push('S');

  return lines.join('\n');
}

// Write complete .wld file by zone ID
export async function writeWldFile(zoneId: string, rooms: Room[]): Promise<void> {
  const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'wld');
  await ensureDir(path.dirname(filePath));
  await createBackup(filePath);

  // Sort rooms by vnum
  const sortedRooms = [...rooms].sort((a, b) => a.vnum - b.vnum);

  const content = sortedRooms.map(formatRoom).join('\n');
  await fs.writeFile(filePath, content, 'utf-8');
}

// Parse .wld file by zone ID (local helper - reimplemented to avoid circular dep)
async function parseWldFileLocal(zoneId: string): Promise<Room[]> {
  const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'wld');
  if (!(await fileExists(filePath))) {
    return [];
  }
  const content = await readFile(filePath);
  const rooms: Room[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find room vnum
    const vnumMatch = lines[i]?.match(/^#(\d+)$/);
    if (!vnumMatch) {
      i++;
      continue;
    }

    const vnum = parseInt(vnumMatch[1], 10);
    if (vnum === 99999) break;
    i++;

    // Room name (until ~)
    let name = '';
    while (i < lines.length && !lines[i].includes('~')) {
      name += lines[i] + ' ';
      i++;
    }
    name = (name + (lines[i]?.replace('~', '') || '')).trim();
    i++;

    // Room description (until ~)
    let description = '';
    while (i < lines.length && !lines[i].includes('~')) {
      description += lines[i] + '\n';
      i++;
    }
    description = description.trim();
    i++;

    // Zone number, room flags, sector type
    const flagLine = lines[i]?.trim().split(/\s+/) || [];
    const zoneNumber = parseInt(flagLine[0], 10) || 0;
    const roomFlags = parseInt(flagLine[1], 10) || 0;
    const sectorType = parseInt(flagLine[2], 10) || 0;
    i++;

    const room: Room = {
      vnum,
      name,
      description,
      zoneNumber,
      roomFlags,
      sectorType,
      exits: [],
      extras: [],
    };

    // Parse directions and extras until S
    while (i < lines.length && lines[i]?.trim() !== 'S') {
      const line = lines[i]?.trim();
      if (!line) {
        i++;
        continue;
      }

      if (line.startsWith('D')) {
        // Direction
        const dirNum = parseInt(line.substring(1), 10);
        i++;

        // Description (until ~)
        let exitDesc = '';
        while (i < lines.length && !lines[i].includes('~')) {
          exitDesc += lines[i] + '\n';
          i++;
        }
        exitDesc = exitDesc.trim();
        i++;

        // Keywords (until ~)
        let keywords = '';
        while (i < lines.length && !lines[i].includes('~')) {
          keywords += lines[i];
          i++;
        }
        keywords = (keywords + (lines[i]?.replace('~', '') || '')).trim();
        i++;

        // Door flag, key, to_room
        const exitFlags = lines[i]?.trim().split(/\s+/) || [];
        const doorFlag = parseInt(exitFlags[0], 10) || 0;
        const keyVnum = parseInt(exitFlags[1], 10) || -1;
        const toRoom = parseInt(exitFlags[2], 10) || -1;
        i++;

        const directions = ['north', 'east', 'south', 'west', 'up', 'down'] as const;
        if (dirNum >= 0 && dirNum < 6) {
          room.exits.push({
            direction: directions[dirNum],
            description: exitDesc,
            keywords,
            doorFlag,
            keyVnum,
            toRoom,
          });
        }
      } else if (line === 'E') {
        // Extra description
        i++;
        let extraKeywords = '';
        while (i < lines.length && !lines[i].includes('~')) {
          extraKeywords += lines[i];
          i++;
        }
        extraKeywords = (extraKeywords + (lines[i]?.replace('~', '') || '')).trim();
        i++;

        let extraDesc = '';
        while (i < lines.length && !lines[i].includes('~')) {
          extraDesc += lines[i] + '\n';
          i++;
        }
        extraDesc = extraDesc.trim();
        i++;

        room.extras.push({ keywords: extraKeywords, description: extraDesc });
      } else {
        i++;
      }
    }
    i++; // Skip 'S'

    rooms.push(room);
  }

  return rooms;
}

// Update single room in .wld file by zone ID
export async function updateRoom(zoneId: string, room: Room): Promise<void> {
  const rooms = await parseWldFileLocal(zoneId);
  const index = rooms.findIndex(r => r.vnum === room.vnum);

  if (index >= 0) {
    rooms[index] = room;
  } else {
    rooms.push(room);
  }

  await writeWldFile(zoneId, rooms);
}

// Create new room by zone ID
export async function createRoom(zoneId: string, room: Room): Promise<Room> {
  const rooms = await parseWldFileLocal(zoneId);

  // Check if vnum already exists
  if (rooms.some(r => r.vnum === room.vnum)) {
    throw new Error(`Room with vnum ${room.vnum} already exists`);
  }

  rooms.push(room);
  await writeWldFile(zoneId, rooms);
  return room;
}

// Delete room by zone ID
export async function deleteRoom(zoneId: string, vnum: number): Promise<boolean> {
  const rooms = await parseWldFileLocal(zoneId);
  const index = rooms.findIndex(r => r.vnum === vnum);

  if (index < 0) {
    return false;
  }

  rooms.splice(index, 1);
  await writeWldFile(zoneId, rooms);
  return true;
}

// Format mobile to .mob format
async function formatMobile(mob: Mobile): Promise<string> {
  const lines: string[] = [];

  // Mob number
  lines.push(`#${mob.vnum}`);

  // Keywords
  lines.push(`${mob.keywords}~`);

  // Short description
  lines.push(`${mob.shortDesc}~`);

  // Long description
  lines.push(mob.longDesc);
  lines.push('~');

  // Detailed description
  lines.push(mob.detailedDesc);
  lines.push('~');

  // Action flags, affect1-4, alignment, S
  lines.push(`${mob.actFlags} ${mob.affFlags1} ${mob.affFlags2} ${mob.affFlags3} ${mob.affFlags4} ${mob.alignment} S`);

  // Species, hometown, class - convert species index to short code
  const speciesCode = await speciesIndexToCode(mob.species);
  lines.push(`${speciesCode} ${mob.hometown} ${mob.mobClass}`);

  // Level, thac0, ac, hp dice, dam dice
  lines.push(`${mob.level} ${mob.thac0} ${mob.ac} ${mob.hitDice} ${mob.damDice}`);

  // Gold, exp
  lines.push(`${mob.gold} ${mob.exp}`);

  // Position, default position, sex
  lines.push(`${mob.position} ${mob.defaultPosition} ${mob.sex}`);

  return lines.join('\n');
}

// Write complete .mob file by zone ID
export async function writeMobFile(zoneId: string, mobiles: Mobile[]): Promise<void> {
  const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'mob');
  await ensureDir(path.dirname(filePath));
  await createBackup(filePath);

  // Sort mobiles by vnum
  const sortedMobs = [...mobiles].sort((a, b) => a.vnum - b.vnum);

  // Format each mobile (async due to species code lookup)
  const formattedMobs = await Promise.all(sortedMobs.map(mob => formatMobile(mob)));
  const content = formattedMobs.join('\n') + '\n#99999\n$\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

// Parse .mob file by zone ID (local helper)
async function parseMobFileLocal(zoneId: string): Promise<Mobile[]> {
  const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'mob');
  if (!(await fileExists(filePath))) {
    return [];
  }
  const content = await readFile(filePath);
  const mobiles: Mobile[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const vnumMatch = lines[i]?.match(/^#(\d+)$/);
    if (!vnumMatch) { i++; continue; }
    const vnum = parseInt(vnumMatch[1], 10);
    if (vnum === 99999) break;
    i++;

    let keywords = '';
    while (i < lines.length && !lines[i].includes('~')) { keywords += lines[i]; i++; }
    keywords = (keywords + (lines[i]?.replace('~', '') || '')).trim();
    i++;

    let shortDesc = '';
    while (i < lines.length && !lines[i].includes('~')) { shortDesc += lines[i]; i++; }
    shortDesc = (shortDesc + (lines[i]?.replace('~', '') || '')).trim();
    i++;

    let longDesc = '';
    while (i < lines.length && !lines[i].includes('~')) { longDesc += lines[i] + '\n'; i++; }
    longDesc = longDesc.trim();
    i++;

    let detailedDesc = '';
    while (i < lines.length && !lines[i].includes('~')) { detailedDesc += lines[i] + '\n'; i++; }
    detailedDesc = detailedDesc.trim();
    i++;

    // Parse flag line - format varies:
    // 5 args: actFlags aff1 aff2 alignment S
    // 7 args: actFlags aff1 aff2 aff3 aff4 alignment S
    const flagLine = lines[i]?.trim().split(/\s+/) || [];
    const numArgs = flagLine.length;
    let actFlags = 0, affFlags1 = 0, affFlags2 = 0, affFlags3 = 0, affFlags4 = 0, alignment = 0;

    if (numArgs === 5) {
      actFlags = parseInt(flagLine[0], 10) || 0;
      affFlags1 = parseInt(flagLine[1], 10) || 0;
      affFlags2 = parseInt(flagLine[2], 10) || 0;
      alignment = parseInt(flagLine[3], 10) || 0;
    } else if (numArgs >= 7) {
      actFlags = parseInt(flagLine[0], 10) || 0;
      affFlags1 = parseInt(flagLine[1], 10) || 0;
      affFlags2 = parseInt(flagLine[2], 10) || 0;
      affFlags3 = parseInt(flagLine[3], 10) || 0;
      affFlags4 = parseInt(flagLine[4], 10) || 0;
      alignment = parseInt(flagLine[5], 10) || 0;
    } else {
      actFlags = parseInt(flagLine[0], 10) || 0;
      affFlags1 = parseInt(flagLine[1], 10) || 0;
      affFlags2 = parseInt(flagLine[2], 10) || 0;
      alignment = parseInt(flagLine[3], 10) || 0;
    }
    i++;

    const speciesLine = lines[i]?.trim().split(/\s+/) || [];
    // Species can be 2-char code (e.g., "PH") or numeric - convert to index
    const species = await speciesCodeToIndex(speciesLine[0] || '0');
    const hometown = parseInt(speciesLine[1], 10) || 0;
    const mobClass = parseInt(speciesLine[2], 10) || 0;
    i++;

    const statLine = lines[i]?.trim().split(/\s+/) || [];
    const level = parseInt(statLine[0], 10) || 1;
    const thac0 = parseInt(statLine[1], 10) || 20;
    const ac = parseInt(statLine[2], 10) || 100;
    const hitDice = statLine[3] || '1d10+0';
    const damDice = statLine[4] || '1d4+0';
    i++;

    const goldLine = lines[i]?.trim().split(/\s+/) || [];
    const gold = parseInt(goldLine[0], 10) || 0;
    const exp = parseInt(goldLine[1], 10) || 0;
    i++;

    const posLine = lines[i]?.trim().split(/\s+/) || [];
    const position = parseInt(posLine[0], 10) || 8;
    const defaultPosition = parseInt(posLine[1], 10) || 8;
    const sex = parseInt(posLine[2], 10) || 0;
    i++;

    mobiles.push({
      vnum, keywords, shortDesc, longDesc, detailedDesc,
      actFlags, affFlags1, affFlags2, affFlags3, affFlags4, alignment,
      species, hometown, mobClass, level, thac0, ac, hitDice, damDice,
      gold, exp, position, defaultPosition, sex,
    });
  }
  return mobiles;
}

// Update single mobile by zone ID
export async function updateMobile(zoneId: string, mobile: Mobile): Promise<void> {
  const mobiles = await parseMobFileLocal(zoneId);
  const index = mobiles.findIndex((m: Mobile) => m.vnum === mobile.vnum);

  if (index >= 0) {
    mobiles[index] = mobile;
  } else {
    mobiles.push(mobile);
  }

  await writeMobFile(zoneId, mobiles);
}

// Create new mobile by zone ID
export async function createMobile(zoneId: string, mobile: Mobile): Promise<Mobile> {
  const mobiles = await parseMobFileLocal(zoneId);

  if (mobiles.some((m: Mobile) => m.vnum === mobile.vnum)) {
    throw new Error(`Mobile with vnum ${mobile.vnum} already exists`);
  }

  mobiles.push(mobile);
  await writeMobFile(zoneId, mobiles);
  return mobile;
}

// Delete mobile by zone ID
export async function deleteMobile(zoneId: string, vnum: number): Promise<boolean> {
  const mobiles = await parseMobFileLocal(zoneId);
  const index = mobiles.findIndex((m: Mobile) => m.vnum === vnum);

  if (index < 0) {
    return false;
  }

  mobiles.splice(index, 1);
  await writeMobFile(zoneId, mobiles);
  return true;
}

// Format object to .obj format
function formatObject(obj: ZoneObject): string {
  const lines: string[] = [];

  // Object number
  lines.push(`#${obj.vnum}`);

  // Keywords
  lines.push(`${obj.keywords}~`);

  // Short description
  lines.push(`${obj.shortDesc}~`);

  // Long description
  lines.push(obj.longDesc);
  lines.push('~');

  // Action description
  lines.push(obj.actionDesc);
  lines.push('~');

  // Type line (11 values):
  // type, material, size(0), space(0), craftsmanship, damres(0),
  // extra_flags, wear_flags, extra2_flags, anti_flags, anti2_flags
  const material = obj.material || 0;
  const craftsmanship = obj.craftsmanship || 0;
  lines.push(`${obj.itemType} ${material} 0 0 ${craftsmanship} 0 ${obj.extraFlags} ${obj.wearFlags} ${obj.extraFlags2 || 0} ${obj.antiFlags || 0} ${obj.antiFlags2 || 0}`);

  // Values (8 values)
  const values = obj.values.slice(0, 8);
  while (values.length < 8) values.push(0);
  lines.push(values.join(' '));

  // Weight, cost, condition, and optional bitvectors (all on same line)
  // Format: weight cost condition [bitvector1] [bitvector2] [bitvector3] [bitvector4]
  let wccLine = `${obj.weight} ${obj.cost} ${obj.condition || 0}`;

  // Only include bitvectors if any are non-zero
  const hasBitvectors = obj.bitvector || obj.bitvector2 || obj.bitvector3 || obj.bitvector4;
  if (hasBitvectors) {
    wccLine += ` ${obj.bitvector || 0} ${obj.bitvector2 || 0} ${obj.bitvector3 || 0} ${obj.bitvector4 || 0}`;
  }
  lines.push(wccLine);

  // Applies
  for (const apply of obj.applies) {
    lines.push('A');
    lines.push(`${apply.location} ${apply.modifier}`);
  }

  // Extra descriptions
  for (const extra of obj.extras) {
    lines.push('E');
    lines.push(`${extra.keywords}~`);
    lines.push(extra.description);
    lines.push('~');
  }

  return lines.join('\n');
}

// Write complete .obj file by zone ID
export async function writeObjFile(zoneId: string, objects: ZoneObject[]): Promise<void> {
  const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'obj');
  await ensureDir(path.dirname(filePath));
  await createBackup(filePath);

  // Sort objects by vnum
  const sortedObjs = [...objects].sort((a, b) => a.vnum - b.vnum);

  const content = sortedObjs.map(formatObject).join('\n') + '\n#99999\n$\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

// Parse .obj file by zone ID (local helper - simplified)
async function parseObjFileLocal(zoneId: string): Promise<ZoneObject[]> {
  const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'obj');
  if (!(await fileExists(filePath))) {
    return [];
  }
  const content = await readFile(filePath);
  const objects: ZoneObject[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const vnumMatch = lines[i]?.match(/^#(\d+)$/);
    if (!vnumMatch) { i++; continue; }
    const vnum = parseInt(vnumMatch[1], 10);
    if (vnum === 99999) break;
    i++;

    let keywords = '';
    while (i < lines.length && !lines[i].includes('~')) { keywords += lines[i]; i++; }
    keywords = (keywords + (lines[i]?.replace('~', '') || '')).trim();
    i++;

    let shortDesc = '';
    while (i < lines.length && !lines[i].includes('~')) { shortDesc += lines[i]; i++; }
    shortDesc = (shortDesc + (lines[i]?.replace('~', '') || '')).trim();
    i++;

    let longDesc = '';
    while (i < lines.length && !lines[i].includes('~')) { longDesc += lines[i] + '\n'; i++; }
    longDesc = longDesc.trim();
    i++;

    let actionDesc = '';
    while (i < lines.length && !lines[i].includes('~')) { actionDesc += lines[i] + '\n'; i++; }
    actionDesc = actionDesc.trim();
    i++;

    // Type line (11 values):
    // type, material, size, space, craftsmanship, damres, extra_flags, wear_flags, extra2_flags, anti_flags, anti2_flags
    const typeLine = lines[i]?.trim().split(/\s+/) || [];
    const itemType = parseInt(typeLine[0], 10) || 12;
    const material = parseInt(typeLine[1], 10) || 0;
    // typeLine[2] = size (unused)
    // typeLine[3] = space (unused)
    const craftsmanship = parseInt(typeLine[4], 10) || 0;
    // typeLine[5] = damres (unused)
    const extraFlags = parseInt(typeLine[6], 10) || 0;
    const wearFlags = parseInt(typeLine[7], 10) || 0;
    const extraFlags2 = parseInt(typeLine[8], 10) || 0;
    const antiFlags = parseInt(typeLine[9], 10) || 0;
    const antiFlags2 = parseInt(typeLine[10], 10) || 0;
    i++;

    // Values (8 values)
    const valuesLine = lines[i]?.trim().split(/\s+/) || [];
    const values = valuesLine.slice(0, 8).map(v => parseInt(v, 10) || 0);
    while (values.length < 8) values.push(0);
    i++;

    // Weight, cost, condition, and optional bitvectors (all on same line)
    // Format: weight cost condition [bitvector1] [bitvector2] [bitvector3] [bitvector4]
    const wcrLine = lines[i]?.trim().split(/\s+/) || [];
    const weight = parseInt(wcrLine[0], 10) || 1;
    const cost = parseInt(wcrLine[1], 10) || 0;
    const condition = parseInt(wcrLine[2], 10) || 0;

    // Bitvectors are optional values 3-6 on the same line
    let bitvector: number | undefined;
    let bitvector2: number | undefined;
    let bitvector3: number | undefined;
    let bitvector4: number | undefined;

    if (wcrLine.length > 3 && wcrLine[3] !== '0') {
      bitvector = parseInt(wcrLine[3], 10) || undefined;
    } else if (wcrLine.length > 3) {
      const hasLaterBitvectors = wcrLine.slice(4).some(v => v !== '0');
      if (hasLaterBitvectors) {
        bitvector = parseInt(wcrLine[3], 10);
      }
    }
    if (wcrLine.length > 4 && wcrLine[4] !== '0') {
      bitvector2 = parseInt(wcrLine[4], 10) || undefined;
    } else if (wcrLine.length > 4 && bitvector !== undefined) {
      bitvector2 = parseInt(wcrLine[4], 10);
    }
    if (wcrLine.length > 5 && wcrLine[5] !== '0') {
      bitvector3 = parseInt(wcrLine[5], 10) || undefined;
    } else if (wcrLine.length > 5 && bitvector2 !== undefined) {
      bitvector3 = parseInt(wcrLine[5], 10);
    }
    if (wcrLine.length > 6 && wcrLine[6] !== '0') {
      bitvector4 = parseInt(wcrLine[6], 10) || undefined;
    }
    i++;

    const obj: ZoneObject = {
      vnum, keywords, shortDesc, longDesc, actionDesc,
      itemType, material, craftsmanship, extraFlags, extraFlags2, wearFlags, values,
      weight, cost, condition, applies: [], extras: [], antiFlags, antiFlags2,
      bitvector, bitvector2, bitvector3, bitvector4,
    };

    while (i < lines.length) {
      const line = lines[i]?.trim();
      if (!line || line.match(/^#\d+$/) || line === '$') break;
      if (line === 'A') {
        i++;
        const applyLine = lines[i]?.trim().split(/\s+/) || [];
        obj.applies.push({ location: parseInt(applyLine[0], 10) || 0, modifier: parseInt(applyLine[1], 10) || 0 });
      } else if (line === 'E') {
        i++;
        let extraKw = '';
        while (i < lines.length && !lines[i].includes('~')) { extraKw += lines[i]; i++; }
        extraKw = (extraKw + (lines[i]?.replace('~', '') || '')).trim();
        i++;
        let extraDesc = '';
        while (i < lines.length && !lines[i].includes('~')) { extraDesc += lines[i] + '\n'; i++; }
        extraDesc = extraDesc.trim();
        obj.extras.push({ keywords: extraKw, description: extraDesc });
      }
      // Note: X/T/U flags are now part of the 11-value type line, no longer separate lines
      i++;
    }
    objects.push(obj);
  }
  return objects;
}

// Update single object by zone ID
export async function updateObject(zoneId: string, object: ZoneObject): Promise<void> {
  const objects = await parseObjFileLocal(zoneId);
  const index = objects.findIndex((o: ZoneObject) => o.vnum === object.vnum);

  if (index >= 0) {
    objects[index] = object;
  } else {
    objects.push(object);
  }

  await writeObjFile(zoneId, objects);
}

// Create new object by zone ID
export async function createObject(zoneId: string, object: ZoneObject): Promise<ZoneObject> {
  const objects = await parseObjFileLocal(zoneId);

  if (objects.some((o: ZoneObject) => o.vnum === object.vnum)) {
    throw new Error(`Object with vnum ${object.vnum} already exists`);
  }

  objects.push(object);
  await writeObjFile(zoneId, objects);
  return object;
}

// Delete object by zone ID
export async function deleteObject(zoneId: string, vnum: number): Promise<boolean> {
  const objects = await parseObjFileLocal(zoneId);
  const index = objects.findIndex((o: ZoneObject) => o.vnum === vnum);

  if (index < 0) {
    return false;
  }

  objects.splice(index, 1);
  await writeObjFile(zoneId, objects);
  return true;
}

// Get next available vnum for a zone by ID
export async function getNextVnum(
  zoneId: string,
  type: 'room' | 'mob' | 'obj'
): Promise<number> {
  let items: { vnum: number }[] = [];

  switch (type) {
    case 'room':
      items = await parseWldFileLocal(zoneId);
      break;
    case 'mob':
      items = await parseMobFileLocal(zoneId);
      break;
    case 'obj':
      items = await parseObjFileLocal(zoneId);
      break;
  }

  if (items.length === 0) {
    // Need to derive zone number from first vnum or default
    return 0;
  }

  const maxVnum = Math.max(...items.map(i => i.vnum));
  return maxVnum + 1;
}

// Generate filesystem-safe base name from zone name
function sanitizeZoneName(zoneName: string): string {
  return zoneName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'unnamed';
}

// Create a new zone with initial files
// zoneNumber is the starting vnum range (e.g., 500 means vnums 50000-50099)
// zoneName is displayed name, zoneId is derived from sanitized zoneName
export async function createZone(
  zoneNumber: number,
  zoneName: string
): Promise<string> {  // Returns the zone ID
  // Generate base filename (zone ID) from zone name
  const zoneId = sanitizeZoneName(zoneName);

  // Check if any files with this zone ID already exist
  const zonPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'zon');
  if (await fileExists(zonPath)) {
    throw new Error(`Zone file ${zoneId}.zon already exists`);
  }

  // Ensure directories exist
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'wld'));
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'mob'));
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'obj'));
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'zon'));

  // Write basic .zon file
  // top_vnum is zoneNumber * 100 + 99 (e.g., zone 500 has top vnum 50099)
  const topVnum = zoneNumber * 100 + 99;
  const zonContent = `#1
${zoneName}~
${topVnum} 0 0 40 50 1
S
$
`;
  await fs.writeFile(zonPath, zonContent, 'utf-8');

  // Invalidate caches
  invalidateZoneFileMap();
  invalidateZoneIndexCache();

  // Create initial room
  const initialRoom: Room = {
    vnum: zoneNumber * 100,
    name: 'The Void',
    description: 'You are floating in an empty void. This is a new zone waiting to be built.',
    zoneNumber,
    roomFlags: 0,
    sectorType: 0,
    exits: [],
    extras: [],
  };

  // Write .wld file with initial room
  const wldPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'wld');
  const wldContent = formatRoom(initialRoom);
  await fs.writeFile(wldPath, wldContent, 'utf-8');

  // Write empty .mob file
  const mobPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'mob');
  await fs.writeFile(mobPath, '$\n', 'utf-8');

  // Write empty .obj file
  const objPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'obj');
  await fs.writeFile(objPath, '$\n', 'utf-8');

  return zoneId;
}

// Delete a zone (removes all zone files)
export async function deleteZone(zoneId: string): Promise<boolean> {
  const files = [
    resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'wld'),
    resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'mob'),
    resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'obj'),
    resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'zon'),
  ];

  let deletedAny = false;

  for (const filePath of files) {
    try {
      // Create backup before deleting
      await createBackup(filePath);
      await fs.unlink(filePath);
      deletedAny = true;
    } catch (error) {
      if (isErrorWithCode(error) && error.code !== 'ENOENT') {
        logger.error(`Failed to delete ${filePath}:`, error);
      }
    }
  }

  // Invalidate cache after deletion
  if (deletedAny) {
    invalidateZoneFileMap();
    invalidateZoneIndexCache();
  }

  return deletedAny;
}

// Clone a zone to a new zone
export async function cloneZone(
  sourceZoneId: string,
  targetZoneNumber: number,
  newZoneName?: string
): Promise<string> {
  // Parse source zone files using local parsers
  const rooms = await parseWldFileLocal(sourceZoneId);
  const mobs = await parseMobFileLocal(sourceZoneId);
  const objs = await parseObjFileLocal(sourceZoneId);

  if (rooms.length === 0) {
    throw new Error(`Source zone ${sourceZoneId} has no rooms`);
  }

  // Determine source zone number from first room's vnum
  const sourceZoneNumber = Math.floor(rooms[0].vnum / 100);

  // Calculate vnum offset
  const vnumOffset = (targetZoneNumber - sourceZoneNumber) * 100;

  // Remap room vnums and exits
  const remappedRooms: Room[] = rooms.map((room: Room) => ({
    ...room,
    vnum: room.vnum + vnumOffset,
    zoneNumber: targetZoneNumber,
    exits: room.exits.map((exit) => ({
      ...exit,
      toRoom: exit.toRoom >= 0 ? exit.toRoom + vnumOffset : exit.toRoom,
      keyVnum: exit.keyVnum > 0 ? exit.keyVnum + vnumOffset : exit.keyVnum,
    })),
  }));

  // Remap mob vnums
  const remappedMobs: Mobile[] = mobs.map((mob: Mobile) => ({
    ...mob,
    vnum: mob.vnum + vnumOffset,
  }));

  // Remap object vnums
  const remappedObjs: ZoneObject[] = objs.map((obj: ZoneObject) => ({
    ...obj,
    vnum: obj.vnum + vnumOffset,
  }));

  // Generate base filename for new zone
  const zoneName = newZoneName || `Clone of ${sourceZoneId}`;
  const newZoneId = sanitizeZoneName(zoneName);

  // Check if files with this base name already exist
  const zonPath = resolveSafeZoneFilePath(AREAS_DIR, newZoneId, 'zon');
  if (await fileExists(zonPath)) {
    throw new Error(`Zone file ${newZoneId}.zon already exists`);
  }

  // Ensure directories exist
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'wld'));
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'mob'));
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'obj'));
  await ensureDir(resolveSafeZoneDirectoryPath(AREAS_DIR, 'zon'));

  // Write .zon file FIRST so the mapping is available
  const zonContent = `#1
${zoneName}~
${targetZoneNumber * 100 + 99} 15 2
S
$
`;
  await fs.writeFile(zonPath, zonContent, 'utf-8');

  // Invalidate cache so the new zone is found
  invalidateZoneFileMap();
  invalidateZoneIndexCache();

  // Write .wld file
  const wldContent = remappedRooms.map(formatRoom).join('\n');
  await fs.writeFile(resolveSafeZoneFilePath(AREAS_DIR, newZoneId, 'wld'), wldContent, 'utf-8');

  // Write .mob file
  const formattedMobs = await Promise.all(remappedMobs.map(mob => formatMobile(mob)));
  const mobContent = formattedMobs.join('\n') + '\n#99999\n$\n';
  await fs.writeFile(resolveSafeZoneFilePath(AREAS_DIR, newZoneId, 'mob'), mobContent, 'utf-8');

  // Write .obj file
  const objContent = remappedObjs.map(formatObject).join('\n') + '\n#99999\n$\n';
  await fs.writeFile(resolveSafeZoneFilePath(AREAS_DIR, newZoneId, 'obj'), objContent, 'utf-8');

  return newZoneId;
}

// Clone a room within the same zone
export async function cloneRoom(
  zoneId: string,
  sourceVnum: number,
  targetVnum?: number
): Promise<Room> {
  const rooms = await parseWldFileLocal(zoneId);

  // Find source room
  const sourceRoom = rooms.find(r => r.vnum === sourceVnum);
  if (!sourceRoom) {
    throw new Error(`Source room ${sourceVnum} not found in zone ${zoneId}`);
  }

  // Determine target vnum
  let newVnum: number;
  if (targetVnum !== undefined) {
    // Check if target vnum already exists
    if (rooms.some(r => r.vnum === targetVnum)) {
      throw new Error(`Room with vnum ${targetVnum} already exists`);
    }
    newVnum = targetVnum;
  } else {
    // Find next available vnum
    const maxVnum = Math.max(...rooms.map(r => r.vnum));
    newVnum = maxVnum + 1;
  }

  // Deep copy the room, without exits (user should set up new exits manually)
  const clonedRoom: Room = {
    vnum: newVnum,
    name: sourceRoom.name,
    description: sourceRoom.description,
    zoneNumber: sourceRoom.zoneNumber,
    roomFlags: sourceRoom.roomFlags,
    sectorType: sourceRoom.sectorType,
    exits: [], // Do NOT copy exits - user should connect new room manually
    extras: sourceRoom.extras.map(e => ({ ...e })), // Deep copy extras
    fallChance: sourceRoom.fallChance,
    currentSpeed: sourceRoom.currentSpeed,
    currentDirection: sourceRoom.currentDirection,
  };

  // Add cloned room and save
  rooms.push(clonedRoom);
  await writeWldFile(zoneId, rooms);

  return clonedRoom;
}

// Format reset command to .zon format
function formatResetCommand(reset: ResetCommand): string {
  // Format: CMD IF_FLAG ARG1 ARG2 ARG3 [ARG4] 100 0 0 0 [* comment]
  // The extra values (100, 0, 0, 0) are: load_chance, and reserved values
  const parts = [
    reset.command,
    reset.ifFlag,
    reset.arg1,
    reset.arg2,
    reset.arg3,
  ];

  // arg4 is only used for some commands (load_chance override)
  if (reset.arg4 !== undefined) {
    parts.push(reset.arg4);
  } else {
    parts.push(100); // Default 100% load chance
  }

  // Reserved values
  parts.push(0, 0, 0);

  let line = parts.join(' ');

  // Add comment if present
  if (reset.comment) {
    line += `        * ${reset.comment}`;
  }

  return line;
}

// Write zone resets to .zon file
// This preserves the zone header and replaces the reset section
export async function writeZoneResets(zoneId: string, resets: ResetCommand[]): Promise<void> {
  const filePath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'zon');

  if (!(await fileExists(filePath))) {
    throw new Error(`Zone file ${zoneId}.zon not found`);
  }

  // Create backup
  await createBackup(filePath);

  // Read existing file
  const content = await readFile(filePath);
  const lines = content.split('\n');

  // Find the header end (everything up to but not including first reset command or 'S')
  // Zone format is:
  // #<zone_type>
  // <name>~
  // <builders>~
  // <min_level>~
  // <top> <lifespan> <reset_mode>
  // <reset commands...>
  // S
  // $

  let headerEndIndex = 0;
  let i = 0;

  // Skip to zone number (#<number>)
  while (i < lines.length && !lines[i].match(/^#\d+$/)) {
    i++;
  }
  i++; // Skip #<number> line

  // Skip zone name (until ~)
  while (i < lines.length && !lines[i].includes('~')) {
    i++;
  }
  i++; // Skip name line with ~

  // Skip builders (until ~)
  while (i < lines.length && !lines[i].includes('~')) {
    i++;
  }
  i++; // Skip builders line with ~

  // Skip min/max level line
  i++;

  // Skip top/lifespan/reset_mode line
  i++;

  // Now we're at the start of reset commands
  headerEndIndex = i;

  // Extract header (everything before reset commands)
  const header = lines.slice(0, headerEndIndex).join('\n');

  // Format new resets
  const resetLines = resets.map(formatResetCommand);

  // Build new file content
  const newContent = [
    header,
    ...resetLines,
    'S',
    '$',
    '', // Trailing newline
  ].join('\n');

  // Write file
  await fs.writeFile(filePath, newContent, 'utf-8');

  // Invalidate caches
  invalidateZoneIndexCache();
}
