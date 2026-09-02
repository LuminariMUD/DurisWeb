// Zone Builder Streaming Service
// Provides SSE streaming for large zone files using async generators

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import logger from '../utils/logger.js';
import * as path from 'path';
import * as readline from 'readline';
import {
  RoomIndex,
  MobIndex,
  ObjIndex,
  Direction,
  DIRECTIONS,
  ResetCommand,
  ResetWithMetadata,
  EQUIP_SLOTS,
  DOOR_STATES,
} from '../types/builder.js';
import { parseZonFile } from './zoneBuilderParser.js';
import { resolveSafeZoneDirectoryPath, resolveSafeZoneFilePath } from '../utils/safeZonePath.js';
import { getCache, setCache, deleteCache, mapToObject, objectToMapNumeric } from '../db/redis.js';
import { getBackendConfiguration } from '../config/environment.js';

const MUD_DIR = getBackendConfiguration().mud.directory;
const AREAS_DIR = path.join(MUD_DIR, 'areas');

// Redis cache keys and TTL for global lookups
const REDIS_KEY_GLOBAL_MOBS = 'builder:global:mobs';
const REDIS_KEY_GLOBAL_OBJS = 'builder:global:objs';
const REDIS_KEY_GLOBAL_ROOMS = 'builder:global:rooms';
const GLOBAL_CACHE_TTL = 30 * 60; // 30 minutes in seconds

// Build global lookup maps for all mobs/objects/rooms across all zones
async function buildGlobalLookups(): Promise<{
  mobMap: Map<number, string>;
  objMap: Map<number, string>;
  roomMap: Map<number, string>;
}> {
  // Try Redis cache first
  const [cachedMobs, cachedObjs, cachedRooms] = await Promise.all([
    getCache<Record<string, string>>(REDIS_KEY_GLOBAL_MOBS),
    getCache<Record<string, string>>(REDIS_KEY_GLOBAL_OBJS),
    getCache<Record<string, string>>(REDIS_KEY_GLOBAL_ROOMS),
  ]);

  if (cachedMobs && cachedObjs && cachedRooms) {
    return {
      mobMap: objectToMapNumeric(cachedMobs),
      objMap: objectToMapNumeric(cachedObjs),
      roomMap: objectToMapNumeric(cachedRooms),
    };
  }

  const mobMap = new Map<number, string>();
  const objMap = new Map<number, string>();
  const roomMap = new Map<number, string>();

  const mobDir = resolveSafeZoneDirectoryPath(AREAS_DIR, 'mob');
  const objDir = resolveSafeZoneDirectoryPath(AREAS_DIR, 'obj');
  const wldDir = resolveSafeZoneDirectoryPath(AREAS_DIR, 'wld');

  // Helper to extract vnum and short desc from a file using streaming
  const extractShortDescs = async (filePath: string, map: Map<number, string>): Promise<void> => {
    if (!(await fileExists(filePath))) return;

    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      let currentVnum: number | null = null;
      let parseState: 'vnum' | 'keywords' | 'shortdesc' | 'skip' = 'vnum';
      let shortDescBuffer = '';

      rl.on('line', (line) => {
        const vnumMatch = line.match(/^#(\d+)$/);
        if (vnumMatch) {
          const vnum = parseInt(vnumMatch[1], 10);
          if (vnum === 99999) return; // End marker

          currentVnum = vnum;
          parseState = 'keywords';
          shortDescBuffer = '';
          return;
        }

        if (!currentVnum) return;

        if (parseState === 'keywords') {
          if (line.includes('~')) {
            parseState = 'shortdesc';
          }
          return;
        }

        if (parseState === 'shortdesc') {
          if (line.includes('~')) {
            shortDescBuffer += line.replace('~', '');
            map.set(currentVnum, shortDescBuffer.trim());
            parseState = 'skip';
          } else {
            shortDescBuffer += line;
          }
        }
      });

      rl.on('close', resolve);
      rl.on('error', reject);
    });
  };

  // Helper to extract room names from .wld files
  const extractRoomNames = async (filePath: string, map: Map<number, string>): Promise<void> => {
    if (!(await fileExists(filePath))) return;

    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      let currentVnum: number | null = null;
      let parseState: 'vnum' | 'name' | 'skip' = 'vnum';
      let nameBuffer = '';

      rl.on('line', (line) => {
        const vnumMatch = line.match(/^#(\d+)$/);
        if (vnumMatch) {
          currentVnum = parseInt(vnumMatch[1], 10);
          parseState = 'name';
          nameBuffer = '';
          return;
        }

        if (!currentVnum) return;

        if (parseState === 'name') {
          if (line.includes('~')) {
            nameBuffer += line.replace('~', '');
            map.set(currentVnum, nameBuffer.trim());
            parseState = 'skip';
          } else {
            nameBuffer += line;
          }
        }
      });

      rl.on('close', resolve);
      rl.on('error', reject);
    });
  };

  try {
    // Get all files in each directory
    const [mobFiles, objFiles, wldFiles] = await Promise.all([
      fsPromises.readdir(mobDir).catch(() => []),
      fsPromises.readdir(objDir).catch(() => []),
      fsPromises.readdir(wldDir).catch(() => []),
    ]);

    // Process all files in parallel (batched to avoid too many open files)
    const batchSize = 20;

    // Process mob files
    const mobPaths = mobFiles
      .filter((f) => f.endsWith('.mob'))
      .map((f) => resolveSafeZoneFilePath(AREAS_DIR, f.slice(0, -4), 'mob'));
    for (let i = 0; i < mobPaths.length; i += batchSize) {
      await Promise.all(mobPaths.slice(i, i + batchSize).map((p) => extractShortDescs(p, mobMap)));
    }

    // Process obj files
    const objPaths = objFiles
      .filter((f) => f.endsWith('.obj'))
      .map((f) => resolveSafeZoneFilePath(AREAS_DIR, f.slice(0, -4), 'obj'));
    for (let i = 0; i < objPaths.length; i += batchSize) {
      await Promise.all(objPaths.slice(i, i + batchSize).map((p) => extractShortDescs(p, objMap)));
    }

    // Process wld files
    const wldPaths = wldFiles
      .filter((f) => f.endsWith('.wld'))
      .map((f) => resolveSafeZoneFilePath(AREAS_DIR, f.slice(0, -4), 'wld'));
    for (let i = 0; i < wldPaths.length; i += batchSize) {
      await Promise.all(wldPaths.slice(i, i + batchSize).map((p) => extractRoomNames(p, roomMap)));
    }

    // Cache the results in Redis
    await Promise.all([
      setCache(REDIS_KEY_GLOBAL_MOBS, mapToObject(mobMap), GLOBAL_CACHE_TTL),
      setCache(REDIS_KEY_GLOBAL_OBJS, mapToObject(objMap), GLOBAL_CACHE_TTL),
      setCache(REDIS_KEY_GLOBAL_ROOMS, mapToObject(roomMap), GLOBAL_CACHE_TTL),
    ]);

    logger.info(
      `Built global lookups: ${mobMap.size} mobs, ${objMap.size} objects, ${roomMap.size} rooms`,
    );
  } catch (error) {
    logger.error('Error building global lookups:', error);
  }

  return { mobMap, objMap, roomMap };
}

// Invalidate global caches
export async function invalidateGlobalLookups(): Promise<void> {
  await Promise.all([
    deleteCache(REDIS_KEY_GLOBAL_MOBS),
    deleteCache(REDIS_KEY_GLOBAL_OBJS),
    deleteCache(REDIS_KEY_GLOBAL_ROOMS),
  ]);
}

// Helper to check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Fast count of items by scanning for #vnum patterns
export async function countZoneItems(
  zoneId: string,
): Promise<{ rooms: number; mobs: number; objects: number }> {
  const wldPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'wld');
  const mobPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'mob');
  const objPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'obj');

  const countVnums = async (filePath: string): Promise<number> => {
    if (!(await fileExists(filePath))) return 0;

    return new Promise((resolve, reject) => {
      let count = 0;
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        // Count lines that are exactly #number (room/mob/obj vnum markers)
        // Exclude #99999 which is end marker
        if (/^#\d+$/.test(line) && line !== '#99999') {
          count++;
        }
      });

      rl.on('close', () => resolve(count));
      rl.on('error', reject);
    });
  };

  const [rooms, mobs, objects] = await Promise.all([
    countVnums(wldPath),
    countVnums(mobPath),
    countVnums(objPath),
  ]);

  return { rooms, mobs, objects };
}

// Stream rooms from .wld file
export async function* streamRooms(zoneId: string, chunkSize = 50): AsyncGenerator<RoomIndex[]> {
  const wldPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'wld');

  if (!(await fileExists(wldPath))) {
    throw new Error(`Zone "${zoneId}" .wld file not found`);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(wldPath),
    crlfDelay: Infinity,
  });

  let currentRoom: Partial<RoomIndex> | null = null;
  let chunk: RoomIndex[] = [];
  let parseState: 'vnum' | 'name' | 'description' | 'flags' | 'exits' | 'extras' = 'vnum';
  let nameBuffer = '';
  let currentExits: { [key in Direction]?: number } = {};

  for await (const line of rl) {
    // Check for room vnum marker
    const vnumMatch = line.match(/^#(\d+)$/);
    if (vnumMatch) {
      // Save previous room if exists
      if (currentRoom && currentRoom.vnum !== undefined) {
        currentRoom.exits = currentExits;
        chunk.push(currentRoom as RoomIndex);

        // Yield chunk if full
        if (chunk.length >= chunkSize) {
          yield chunk;
          chunk = [];
        }
      }

      // Start new room
      currentRoom = { vnum: parseInt(vnumMatch[1], 10) };
      currentExits = {};
      parseState = 'name';
      nameBuffer = '';
      continue;
    }

    if (!currentRoom) continue;

    // Parse room name (until ~)
    if (parseState === 'name') {
      if (line.includes('~')) {
        nameBuffer += line.replace('~', '');
        currentRoom.name = nameBuffer.trim();
        parseState = 'description';
      } else {
        nameBuffer += line;
      }
      continue;
    }

    // Skip description (until standalone ~)
    if (parseState === 'description') {
      if (line === '~') {
        parseState = 'flags';
      }
      continue;
    }

    // Parse flags line (zone_num flags sector_type)
    if (parseState === 'flags') {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        currentRoom.sectorType = parseInt(parts[2], 10) || 0;
      }
      parseState = 'exits';
      continue;
    }

    // Parse exits and extras
    if (parseState === 'exits') {
      // End of room
      if (line.trim() === 'S') {
        parseState = 'vnum';
        continue;
      }

      // Direction exit (D0-D9: N, E, S, W, U, D, NE, NW, SE, SW)
      const dirMatch = line.match(/^D(\d+)$/);
      if (dirMatch) {
        const dirIndex = parseInt(dirMatch[1], 10);
        if (dirIndex >= 0 && dirIndex <= 9) {
          // We need to skip ahead to get the to_room value
          // This is tricky with line-by-line parsing, so we'll handle it in a sub-state
          // For now, we mark that we're parsing an exit
          currentRoom._currentDir = dirIndex;
          currentRoom._exitParseState = 'description';
        }
        continue;
      }

      // Handle exit parsing sub-states
      if (currentRoom._currentDir !== undefined && currentRoom._exitParseState) {
        if (currentRoom._exitParseState === 'description') {
          // Skip description until ~
          if (line === '~') {
            currentRoom._exitParseState = 'keywords';
          }
          continue;
        }

        if (currentRoom._exitParseState === 'keywords') {
          // Skip keywords until ~
          if (line.includes('~')) {
            currentRoom._exitParseState = 'flags';
          }
          continue;
        }

        if (currentRoom._exitParseState === 'flags') {
          // Parse door_flag key to_room
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const toRoom = parseInt(parts[2], 10);
            if (toRoom > 0) {
              const direction = DIRECTIONS[currentRoom._currentDir];
              currentExits[direction] = toRoom;
            }
          }
          delete currentRoom._currentDir;
          delete currentRoom._exitParseState;
          continue;
        }
      }

      // Extra description (E) - skip
      if (line === 'E') {
        currentRoom._extraParseState = 'keywords';
        continue;
      }

      if (currentRoom._extraParseState) {
        if (currentRoom._extraParseState === 'keywords' && line.includes('~')) {
          currentRoom._extraParseState = 'description';
          continue;
        }
        if (currentRoom._extraParseState === 'description' && line === '~') {
          delete currentRoom._extraParseState;
        }
        continue;
      }

      // Fall chance (F) - skip
      if (line === 'F') {
        currentRoom._skipNextLine = true;
        continue;
      }

      // Current (C) - skip
      if (line === 'C') {
        currentRoom._skipNextLine = true;
        continue;
      }

      if (currentRoom._skipNextLine) {
        delete currentRoom._skipNextLine;
        continue;
      }
    }
  }

  // Don't forget the last room
  if (currentRoom && currentRoom.vnum !== undefined) {
    currentRoom.exits = currentExits;
    // Clean up temporary parsing fields
    delete currentRoom._currentDir;
    delete currentRoom._exitParseState;
    delete currentRoom._extraParseState;
    delete currentRoom._skipNextLine;
    chunk.push(currentRoom as RoomIndex);
  }

  // Yield remaining chunk
  if (chunk.length > 0) {
    yield chunk;
  }
}

// Stream mobs from .mob file
export async function* streamMobs(zoneId: string, chunkSize = 50): AsyncGenerator<MobIndex[]> {
  const mobPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'mob');

  if (!(await fileExists(mobPath))) {
    return; // No mobs file, just return empty
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(mobPath),
    crlfDelay: Infinity,
  });

  let currentMob: Partial<MobIndex> | null = null;
  let chunk: MobIndex[] = [];
  let parseState:
    | 'vnum'
    | 'keywords'
    | 'shortdesc'
    | 'longdesc'
    | 'detaileddesc'
    | 'flags'
    | 'species'
    | 'stats'
    | 'gold'
    | 'position'
    | 'done' = 'vnum';
  let keywordsBuffer = '';
  let shortDescBuffer = '';

  for await (const line of rl) {
    // Check for mob vnum marker
    const vnumMatch = line.match(/^#(\d+)$/);
    if (vnumMatch) {
      const vnum = parseInt(vnumMatch[1], 10);

      // End marker
      if (vnum === 99999) break;

      // Save previous mob if exists
      if (currentMob && currentMob.vnum !== undefined) {
        chunk.push(currentMob as MobIndex);

        if (chunk.length >= chunkSize) {
          yield chunk;
          chunk = [];
        }
      }

      // Start new mob
      currentMob = { vnum };
      parseState = 'keywords';
      keywordsBuffer = '';
      shortDescBuffer = '';
      continue;
    }

    if (!currentMob) continue;

    // Parse keywords (until ~)
    if (parseState === 'keywords') {
      if (line.includes('~')) {
        keywordsBuffer += line.replace('~', '');
        currentMob.keywords = keywordsBuffer.trim();
        parseState = 'shortdesc';
      } else {
        keywordsBuffer += line + ' ';
      }
      continue;
    }

    // Parse short desc (until ~)
    if (parseState === 'shortdesc') {
      if (line.includes('~')) {
        shortDescBuffer += line.replace('~', '');
        currentMob.shortDesc = shortDescBuffer.trim();
        parseState = 'longdesc';
      } else {
        shortDescBuffer += line;
      }
      continue;
    }

    // Skip long desc (until standalone ~)
    if (parseState === 'longdesc') {
      if (line === '~') {
        parseState = 'detaileddesc';
      }
      continue;
    }

    // Skip detailed desc (until standalone ~)
    if (parseState === 'detaileddesc') {
      if (line === '~') {
        parseState = 'flags';
      }
      continue;
    }

    // Skip flags line
    if (parseState === 'flags') {
      parseState = 'species';
      continue;
    }

    // Skip species line
    if (parseState === 'species') {
      parseState = 'stats';
      continue;
    }

    // Parse stats line (level is first value)
    if (parseState === 'stats') {
      const parts = line.trim().split(/\s+/);
      currentMob.level = parseInt(parts[0], 10) || 1;
      parseState = 'gold';
      continue;
    }

    // Skip gold line
    if (parseState === 'gold') {
      parseState = 'position';
      continue;
    }

    // Skip position line, mob is complete
    if (parseState === 'position') {
      parseState = 'vnum'; // Ready for next mob
      continue;
    }
  }

  // Don't forget the last mob
  if (currentMob && currentMob.vnum !== undefined && currentMob.keywords) {
    chunk.push(currentMob as MobIndex);
  }

  if (chunk.length > 0) {
    yield chunk;
  }
}

// Stream objects from .obj file
export async function* streamObjects(zoneId: string, chunkSize = 50): AsyncGenerator<ObjIndex[]> {
  const objPath = resolveSafeZoneFilePath(AREAS_DIR, zoneId, 'obj');

  if (!(await fileExists(objPath))) {
    return; // No objects file, just return empty
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(objPath),
    crlfDelay: Infinity,
  });

  let currentObj: Partial<ObjIndex> | null = null;
  let chunk: ObjIndex[] = [];
  let parseState:
    | 'vnum'
    | 'keywords'
    | 'shortdesc'
    | 'longdesc'
    | 'actiondesc'
    | 'type'
    | 'values'
    | 'weight'
    | 'extras' = 'vnum';
  let keywordsBuffer = '';
  let shortDescBuffer = '';

  for await (const line of rl) {
    // Check for object vnum marker
    const vnumMatch = line.match(/^#(\d+)$/);
    if (vnumMatch) {
      const vnum = parseInt(vnumMatch[1], 10);

      // End marker
      if (vnum === 99999) break;

      // Save previous object if exists
      if (currentObj && currentObj.vnum !== undefined) {
        chunk.push(currentObj as ObjIndex);

        if (chunk.length >= chunkSize) {
          yield chunk;
          chunk = [];
        }
      }

      // Start new object
      currentObj = { vnum };
      parseState = 'keywords';
      keywordsBuffer = '';
      shortDescBuffer = '';
      continue;
    }

    if (!currentObj) continue;

    // Parse keywords (until ~)
    if (parseState === 'keywords') {
      if (line.includes('~')) {
        keywordsBuffer += line.replace('~', '');
        currentObj.keywords = keywordsBuffer.trim();
        parseState = 'shortdesc';
      } else {
        keywordsBuffer += line + ' ';
      }
      continue;
    }

    // Parse short desc (until ~)
    if (parseState === 'shortdesc') {
      if (line.includes('~')) {
        shortDescBuffer += line.replace('~', '');
        currentObj.shortDesc = shortDescBuffer.trim();
        parseState = 'longdesc';
      } else {
        shortDescBuffer += line;
      }
      continue;
    }

    // Skip long desc (until standalone ~)
    if (parseState === 'longdesc') {
      if (line === '~') {
        parseState = 'actiondesc';
      }
      continue;
    }

    // Skip action desc (until standalone ~)
    if (parseState === 'actiondesc') {
      if (line === '~') {
        parseState = 'type';
      }
      continue;
    }

    // Parse type line (item_type is first value)
    if (parseState === 'type') {
      const parts = line.trim().split(/\s+/);
      currentObj.itemType = parseInt(parts[0], 10) || 0;
      parseState = 'values';
      continue;
    }

    // Skip values line
    if (parseState === 'values') {
      parseState = 'weight';
      continue;
    }

    // Skip weight line, object base is complete
    if (parseState === 'weight') {
      parseState = 'extras';
      continue;
    }

    // Skip extras section (A, E, X, T, U markers)
    // We stay in extras state until next #vnum or end
    if (parseState === 'extras') {
      // Just continue, the next #vnum will trigger save
      continue;
    }
  }

  // Don't forget the last object
  if (currentObj && currentObj.vnum !== undefined && currentObj.keywords) {
    chunk.push(currentObj as ObjIndex);
  }

  if (chunk.length > 0) {
    yield chunk;
  }
}

// Type augmentation for temporary parsing state
declare module '../types/builder.js' {
  interface RoomIndex {
    _currentDir?: number;
    _exitParseState?: 'description' | 'keywords' | 'flags';
    _extraParseState?: 'keywords' | 'description';
    _skipNextLine?: boolean;
  }
}

// Helper to enrich reset command with metadata
function enrichReset(
  reset: ResetCommand,
  index: number,
  mobMap: Map<number, string>,
  objMap: Map<number, string>,
  roomMap: Map<number, string>,
): ResetWithMetadata {
  const enriched: ResetWithMetadata = { ...reset, index };

  switch (reset.command) {
    case 'M': // Load Mobile: arg1=mob_vnum, arg2=max, arg3=room_vnum
      enriched.mobName = mobMap.get(reset.arg1);
      enriched.roomName = roomMap.get(reset.arg3);
      break;

    case 'O': // Load Object: arg1=obj_vnum, arg2=max, arg3=room_vnum
      enriched.objName = objMap.get(reset.arg1);
      enriched.roomName = roomMap.get(reset.arg3);
      break;

    case 'G': // Give Object: arg1=obj_vnum, arg2=max
      enriched.objName = objMap.get(reset.arg1);
      break;

    case 'E': // Equip Object: arg1=obj_vnum, arg2=max, arg3=equip_slot
      enriched.objName = objMap.get(reset.arg1);
      enriched.slotName =
        EQUIP_SLOTS.find((s) => s.value === reset.arg3)?.name || `Slot ${reset.arg3}`;
      break;

    case 'P': // Put in Container: arg1=obj_vnum, arg2=max, arg3=container_vnum
      enriched.objName = objMap.get(reset.arg1);
      enriched.containerName = objMap.get(reset.arg3);
      break;

    case 'D': // Set Door: arg1=room_vnum, arg2=direction, arg3=state
      enriched.roomName = roomMap.get(reset.arg1);
      enriched.directionName = DIRECTIONS[reset.arg2] || `Dir ${reset.arg2}`;
      enriched.stateName =
        DOOR_STATES.find((s) => s.value === reset.arg3)?.name || `State ${reset.arg3}`;
      break;

    case 'F': // Follow: arg1=follower_vnum, arg2=max, arg3=leader_vnum
      enriched.mobName = mobMap.get(reset.arg1);
      enriched.leaderName = mobMap.get(reset.arg3);
      break;

    case 'R': // Remove Object: arg1=obj_vnum, arg2=max, arg3=room_vnum
      enriched.objName = objMap.get(reset.arg1);
      enriched.roomName = roomMap.get(reset.arg3);
      break;
  }

  return enriched;
}

// Count resets in zone file
export async function countResets(zoneId: string): Promise<number> {
  const { resets } = await parseZonFile(zoneId);
  return resets.length;
}

// Stream resets from .zon file with enriched metadata
// Uses global lookups to resolve cross-zone references (mobs/objects/rooms from other zones)
export async function* streamResets(
  zoneId: string,
  chunkSize = 50,
): AsyncGenerator<ResetWithMetadata[]> {
  // Parse zone file and build global lookups in parallel
  const [{ resets }, { mobMap, objMap, roomMap }] = await Promise.all([
    parseZonFile(zoneId),
    buildGlobalLookups(),
  ]);

  // Enrich all resets with metadata from global lookups
  const enrichedResets = resets.map((reset, index) =>
    enrichReset(reset, index, mobMap, objMap, roomMap),
  );

  // Yield in chunks
  for (let i = 0; i < enrichedResets.length; i += chunkSize) {
    yield enrichedResets.slice(i, i + chunkSize);
  }
}
