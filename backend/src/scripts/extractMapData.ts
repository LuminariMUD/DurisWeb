/**
 * Map Data Extraction Script
 *
 * Extracts map room positions from Surface and Underdark zones
 * and populates wiki_map_positions and wiki_zone_entrances tables.
 *
 * Run with: pnpm run extract-map-data
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { pool } from '../db/connection.js';
import logger from '../utils/logger.js';
import { resolveSafeZoneDirectoryPath, resolveSafeZoneFilePath } from '../utils/safeZonePath.js';

const MUD_DIR = process.env.MUD_DIR || '/home/resakse/Coding/DurisMUD';
const AREAS_DIR = path.join(MUD_DIR, 'areas');

// Map zone definitions from MUD src/map.h
const SURFACE_MAP_START = 500000;
const SURFACE_MAP_END = 659999;
const UD_MAP_START = 700000;
const UD_MAP_END = 859999;
const UD_ALATORIN_START = 120000;
const UD_ALATORIN_END = 123833;

// Newbie map range (between surface and underdark)
const NEWBIE_MAP_START = 660000;
const NEWBIE_MAP_END = 699999;

// Map layer z_coord values (matches frontend layer selector)
// 0 = Surface, -1 = Underdark, -2 = Alatorin (Depths), 1 = Newbie
const Z_SURFACE = 0;
const Z_UNDERDARK = -1;
const Z_ALATORIN = -2;
const Z_NEWBIE = 1;

// Direction names for exits
const DIRECTIONS = ['north', 'east', 'south', 'west', 'up', 'down', 'northwest', 'southwest', 'northeast', 'southeast'];

interface ParsedRoom {
  vnum: number;
  name: string;
  zoneNumber: number;
  sectorType: number;
  exits: Array<{
    direction: string;
    toRoom: number;
  }>;
}

interface ZoneInfo {
  number: number;
  name: string;
  mapx: number;
  mapy: number;
  startVnum: number;
}

// Read file content (normalizes Windows line endings)
async function readFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  } catch {
    return '';
  }
}

// Check if file exists
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Parse zone header to get mapx, mapy dimensions
async function parseZoneHeader(zonePath: string): Promise<ZoneInfo | null> {
  const content = await readFile(zonePath);
  if (!content) return null;

  const lines = content.split('\n');
  if (lines.length < 4) return null;

  // Line 1: #<zone_number>
  const zoneNumberMatch = lines[0].match(/^#(\d+)/);
  if (!zoneNumberMatch) return null;
  const zoneNumber = parseInt(zoneNumberMatch[1], 10);

  // Line 2: Zone name~
  const nameMatch = lines[1].match(/^(.+)~$/);
  const name = nameMatch ? nameMatch[1].trim() : `Zone ${zoneNumber}`;

  // Line 3: <top_vnum> <lifespan> <reset_mode> <min_level> <max_level> <life_type>
  // (We don't need top_vnum for map data extraction)

  // Line 4: <mapx> <mapy> (only for map zones)
  let mapx = 0;
  let mapy = 0;
  if (lines[3] && !lines[3].startsWith('*')) {
    const mapParts = lines[3].trim().split(/\s+/);
    if (mapParts.length >= 2) {
      mapx = parseInt(mapParts[0], 10);
      mapy = parseInt(mapParts[1], 10);
    }
  }

  // Calculate start vnum (for map zones, it's based on zone number)
  const startVnum = zoneNumber * 100;

  return { number: zoneNumber, name, mapx, mapy, startVnum };
}

// Parse rooms from a .wld file
async function parseWldFile(wldPath: string): Promise<ParsedRoom[]> {
  const content = await readFile(wldPath);
  if (!content) return [];

  const rooms: ParsedRoom[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Find room number
    while (i < lines.length && !lines[i].match(/^#\d+$/)) {
      i++;
    }
    if (i >= lines.length) break;

    const vnumMatch = lines[i].match(/^#(\d+)$/);
    if (!vnumMatch) {
      i++;
      continue;
    }
    const vnum = parseInt(vnumMatch[1], 10);
    i++;

    // Room name (until ~)
    let name = '';
    while (i < lines.length && !lines[i].includes('~')) {
      name += lines[i];
      i++;
    }
    if (i < lines.length) {
      name += lines[i].replace('~', '');
    }
    name = name.trim();
    i++;

    // Room description (until ~)
    while (i < lines.length && !lines[i].match(/^~$/)) {
      i++;
    }
    i++; // Skip the ~ line

    // Zone number, room flags, sector type
    if (i >= lines.length) break;
    const flagLine = lines[i].trim().split(/\s+/);
    const zoneNumber = parseInt(flagLine[0], 10) || 0;
    const sectorType = parseInt(flagLine[2], 10) || 0;
    i++;

    // Parse exits
    const exits: Array<{ direction: string; toRoom: number }> = [];

    while (i < lines.length) {
      const line = lines[i].trim();

      // End of room
      if (line === 'S') {
        i++;
        break;
      }

      // Direction exit (D0-D9)
      const dirMatch = line.match(/^D(\d+)$/);
      if (dirMatch) {
        const dirIndex = parseInt(dirMatch[1], 10);
        i++;

        // Skip exit description (until ~)
        while (i < lines.length && !lines[i].match(/^~$/)) {
          i++;
        }
        i++; // Skip ~

        // Skip keywords (until ~)
        while (i < lines.length && !lines[i].includes('~')) {
          i++;
        }
        i++; // Skip keywords~

        // Door flag, key, to_room
        const exitFlags = lines[i]?.trim().split(/\s+/) || ['0', '0', '-1'];
        const toRoom = parseInt(exitFlags[2], 10) || -1;
        i++;

        if (dirIndex >= 0 && dirIndex <= 9 && toRoom > 0) {
          exits.push({
            direction: DIRECTIONS[dirIndex],
            toRoom,
          });
        }
        continue;
      }

      // Extra description - skip
      if (line === 'E') {
        i++;
        // Skip keywords (until ~)
        while (i < lines.length && !lines[i].includes('~')) {
          i++;
        }
        i++;
        // Skip description (until ~)
        while (i < lines.length && !lines[i].match(/^~$/)) {
          i++;
        }
        i++;
        continue;
      }

      // Fall chance or Current - skip
      if (line === 'F' || line === 'C') {
        i++;
        i++; // Skip the value line
        continue;
      }

      i++;
    }

    rooms.push({ vnum, name, zoneNumber, sectorType, exits });
  }

  return rooms;
}

// Check if a room vnum is in a map zone
function isMapRoom(vnum: number): boolean {
  return (
    (vnum >= SURFACE_MAP_START && vnum <= SURFACE_MAP_END) ||
    (vnum >= UD_MAP_START && vnum <= UD_MAP_END) ||
    (vnum >= UD_ALATORIN_START && vnum <= UD_ALATORIN_END) ||
    (vnum >= NEWBIE_MAP_START && vnum <= NEWBIE_MAP_END)
  );
}

// Get the z_coord (layer) for a room based on the zone file base name
// This is more accurate than VNUM-based detection since newbiemaps overlaps with surface
function getZCoordForFile(baseName: string): number {
  switch (baseName) {
    case 'surface':
      return Z_SURFACE;
    case 'newbiemaps':
      return Z_NEWBIE;
    case 'underdark':
      return Z_UNDERDARK;
    case 'alatorin':
    case 'surfacekeeps': // Despite the name, this is "The Depths of Duris" (Alatorin) with VNUMs 120000-123833
      return Z_ALATORIN;
    default:
      return Z_SURFACE;
  }
}

// Calculate x,y coordinates for a map room based on its VNUM
// Each map type has a specific base VNUM and grid width
function calculateCoords(vnum: number): { x: number; y: number } {
  // Surface map: 500000-659999, 400 wide grid
  if (vnum >= SURFACE_MAP_START && vnum <= SURFACE_MAP_END) {
    const offset = vnum - SURFACE_MAP_START;
    return {
      x: offset % 400,
      y: Math.floor(offset / 400),
    };
  }

  // Newbie map: 660000-689999, 300 wide grid
  if (vnum >= NEWBIE_MAP_START && vnum <= NEWBIE_MAP_END) {
    const offset = vnum - NEWBIE_MAP_START;
    return {
      x: offset % 300,
      y: Math.floor(offset / 300),
    };
  }

  // Underdark map: 700000-859999, 400 wide grid
  if (vnum >= UD_MAP_START && vnum <= UD_MAP_END) {
    const offset = vnum - UD_MAP_START;
    return {
      x: offset % 400,
      y: Math.floor(offset / 400),
    };
  }

  // Alatorin (Depths): 120000-123833, 100 wide grid
  if (vnum >= UD_ALATORIN_START && vnum <= UD_ALATORIN_END) {
    const offset = vnum - UD_ALATORIN_START;
    return {
      x: offset % 100,
      y: Math.floor(offset / 100),
    };
  }

  // Default fallback
  return { x: 0, y: 0 };
}

// Build a map of zone number -> zone name from all .zon files
async function buildZoneNameMap(): Promise<Map<number, string>> {
  const zoneNameMap = new Map<number, string>();
  const zonDir = resolveSafeZoneDirectoryPath(AREAS_DIR, 'zon');

  try {
    const files = await fs.readdir(zonDir);
    const zonFiles = files.filter((f) => f.endsWith('.zon'));

    for (const zonFile of zonFiles) {
      const zonPath = resolveSafeZoneFilePath(AREAS_DIR, zonFile.slice(0, -4), 'zon');
      const zoneInfo = await parseZoneHeader(zonPath);
      if (zoneInfo) {
        zoneNameMap.set(zoneInfo.number, zoneInfo.name);
      }
    }
  } catch (err) {
    logger.error('Error building zone name map:', err);
  }

  return zoneNameMap;
}

// Global zone name map (populated once at start)
let zoneNameMap: Map<number, string> = new Map();

// Get zone name from zone files or database
async function getZoneName(zoneNumber: number): Promise<string | null> {
  // First try the zone file map
  const fileZoneName = zoneNameMap.get(zoneNumber);
  if (fileZoneName) {
    return fileZoneName;
  }

  // Fall back to database
  try {
    const [rows] = await pool.query<any[]>(
      'SELECT name FROM zones WHERE number = ?',
      [zoneNumber]
    );
    return rows.length > 0 ? rows[0].name : null;
  } catch {
    return null;
  }
}

// Build a map of room vnum -> zone file base name from all .wld files
// This is needed because multiple zones can share the same zone number (e.g., zone 1)
// By tracking which .wld file each room comes from, we can use the corresponding .zon file name
async function buildRoomToFileMap(): Promise<Map<number, string>> {
  const roomToFileMap = new Map<number, string>();
  const wldDir = path.join(AREAS_DIR, 'wld');

  try {
    const files = await fs.readdir(wldDir);
    const wldFiles = files.filter((f) => f.endsWith('.wld'));

    for (const wldFile of wldFiles) {
      const baseName = wldFile.replace('.wld', '');
      const wldPath = path.join(wldDir, wldFile);
      const rooms = await parseWldFile(wldPath);

      for (const room of rooms) {
        roomToFileMap.set(room.vnum, baseName);
      }
    }
  } catch (err) {
    logger.error('Error building room-to-file map:', err);
  }

  return roomToFileMap;
}

// Build a map of zone file base name -> zone name from all .zon files
async function buildFileToZoneNameMap(): Promise<Map<string, string>> {
  const fileToNameMap = new Map<string, string>();
  const zonDir = resolveSafeZoneDirectoryPath(AREAS_DIR, 'zon');

  try {
    const files = await fs.readdir(zonDir);
    const zonFiles = files.filter((f) => f.endsWith('.zon'));

    for (const zonFile of zonFiles) {
      const baseName = zonFile.replace('.zon', '');
      const zonPath = resolveSafeZoneFilePath(AREAS_DIR, zonFile.slice(0, -4), 'zon');
      const zoneInfo = await parseZoneHeader(zonPath);
      if (zoneInfo) {
        fileToNameMap.set(baseName, zoneInfo.name);
      }
    }
  } catch (err) {
    logger.error('Error building file-to-zone-name map:', err);
  }

  return fileToNameMap;
}

// Global maps (populated once at start)
let roomToFileMap: Map<number, string> = new Map();
let fileToZoneNameMap: Map<string, string> = new Map();

// Get zone name for a room VNUM by looking up which file it belongs to
function getZoneNameForRoom(roomVnum: number): string | null {
  const baseName = roomToFileMap.get(roomVnum);
  if (!baseName) return null;
  return fileToZoneNameMap.get(baseName) || null;
}

// Main extraction function
async function extractMapData(): Promise<void> {
  logger.info('Starting map data extraction...\n');

  // Build zone name map from .zon files (for fallback and zone number lookups)
  logger.info('Building zone name mapping from all .zon files...');
  zoneNameMap = await buildZoneNameMap();
  logger.info(`Mapped ${zoneNameMap.size} zone names.\n`);

  // Build file-based zone name map (more accurate - handles duplicate zone numbers)
  logger.info('Building file-to-zone-name mapping...');
  fileToZoneNameMap = await buildFileToZoneNameMap();
  logger.info(`Mapped ${fileToZoneNameMap.size} zone files to names.\n`);

  // Build a complete map of room vnum -> zone file base name from all .wld files
  logger.info('Building room-to-file mapping from all .wld files...');
  roomToFileMap = await buildRoomToFileMap();
  logger.info(`Mapped ${roomToFileMap.size} rooms to their zone files.\n`);

  // Find all zone files
  const zonDir = resolveSafeZoneDirectoryPath(AREAS_DIR, 'zon');
  const files = await fs.readdir(zonDir);
  const zonFiles = files.filter((f) => f.endsWith('.zon'));

  logger.info(`Found ${zonFiles.length} zone files\n`);

  // Track statistics
  let totalRooms = 0;
  let totalEntrances = 0;
  const mapZones: string[] = [];

  // Clear existing data
  logger.info('Clearing existing wiki map data...');
  await pool.query('DELETE FROM wiki_zone_entrances');
  await pool.query('DELETE FROM wiki_map_positions');
  logger.info('Done.\n');

  // Process each zone file
  for (const zonFile of zonFiles) {
    const baseName = zonFile.replace('.zon', '');
    const zonPath = resolveSafeZoneFilePath(AREAS_DIR, zonFile.slice(0, -4), 'zon');
    const wldPath = resolveSafeZoneFilePath(AREAS_DIR, baseName, 'wld');

    // Skip if no .wld file
    if (!(await fileExists(wldPath))) continue;

    // Parse zone header
    const zoneInfo = await parseZoneHeader(zonPath);
    if (!zoneInfo) continue;

    // Parse rooms
    const rooms = await parseWldFile(wldPath);
    if (rooms.length === 0) continue;

    // Check if this zone has map rooms
    const mapRooms = rooms.filter((r) => isMapRoom(r.vnum));
    if (mapRooms.length === 0) continue;

    mapZones.push(`${baseName} (Zone ${zoneInfo.number}): ${mapRooms.length} map rooms`);

    // Get zone name from database
    const dbZoneName = await getZoneName(zoneInfo.number);
    const zoneName = dbZoneName || zoneInfo.name;

    // Prepare batch insert data for positions
    const positionRows: any[] = [];
    // Store coords for entrance lookups
    const roomCoords: Map<number, { x: number; y: number }> = new Map();

    for (const room of mapRooms) {
      const coords = calculateCoords(room.vnum);
      roomCoords.set(room.vnum, coords);

      positionRows.push([
        room.vnum,
        coords.x,
        coords.y,
        getZCoordForFile(baseName), // z_coord based on zone file
        room.sectorType,
        zoneInfo.number,
        zoneName,
        room.name,
        null, // continent_id - will be updated later
        true, // is_map_room
      ]);
    }

    // Batch insert positions
    if (positionRows.length > 0) {
      const placeholders = positionRows.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = positionRows.flat();

      await pool.query(
        `INSERT INTO wiki_map_positions
         (room_vnum, x_coord, y_coord, z_coord, sector_type, zone_number, zone_name, room_name, continent_id, is_map_room)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
         x_coord = VALUES(x_coord),
         y_coord = VALUES(y_coord),
         z_coord = VALUES(z_coord),
         sector_type = VALUES(sector_type),
         zone_number = VALUES(zone_number),
         zone_name = VALUES(zone_name),
         room_name = VALUES(room_name),
         updated_at = NOW()`,
        values
      );

      totalRooms += positionRows.length;
    }

    // Process zone entrances (exits that lead to non-map rooms)
    const entranceRows: any[] = [];

    for (const room of mapRooms) {
      const coords = roomCoords.get(room.vnum);
      if (!coords) continue;

      for (const exit of room.exits) {
        const toVnum = exit.toRoom;

        // If exit leads to a non-map room, it's a zone entrance
        if (!isMapRoom(toVnum)) {
          // Get the zone file base name for the target room
          const toZoneFile = roomToFileMap.get(toVnum);
          if (!toZoneFile) {
            // Room doesn't exist in any .wld file, skip
            continue;
          }

          // Get zone name from the corresponding .zon file (not by zone number)
          // This correctly handles multiple zones with the same zone number
          const toZoneName = getZoneNameForRoom(toVnum);

          // Parse the target room's zone file to get zone number
          const toZonePath = path.join(AREAS_DIR, 'zon', `${toZoneFile}.zon`);
          const toZoneInfo = await parseZoneHeader(toZonePath);
          const toZoneNumber = toZoneInfo?.number || 0;

          entranceRows.push([
            room.vnum,
            toVnum,
            toZoneNumber,
            toZoneName,
            exit.direction,
            coords.x,
            coords.y,
          ]);
        }
      }
    }

    // Batch insert entrances
    if (entranceRows.length > 0) {
      const placeholders = entranceRows.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = entranceRows.flat();

      await pool.query(
        `INSERT INTO wiki_zone_entrances
         (from_room_vnum, to_room_vnum, to_zone_number, to_zone_name, direction, x_coord, y_coord)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE
         to_room_vnum = VALUES(to_room_vnum),
         to_zone_number = VALUES(to_zone_number),
         to_zone_name = VALUES(to_zone_name)`,
        values
      );

      totalEntrances += entranceRows.length;
    }

    process.stdout.write('.');
  }

  logger.info('\n\n--- Map Zones Processed ---');
  for (const zone of mapZones) {
    logger.info(`  ${zone}`);
  }

  logger.info('\n--- Summary ---');
  logger.info(`Total map rooms: ${totalRooms}`);
  logger.info(`Total zone entrances: ${totalEntrances}`);

  // Update continent centers based on seed rooms
  logger.info('\nUpdating continent centers...');
  const [continents] = await pool.query<any[]>('SELECT id, seed_room_vnum FROM wiki_continents');

  for (const continent of continents) {
    const [seedRoom] = await pool.query<any[]>(
      'SELECT x_coord, y_coord FROM wiki_map_positions WHERE room_vnum = ?',
      [continent.seed_room_vnum]
    );

    if (seedRoom.length > 0) {
      await pool.query(
        'UPDATE wiki_continents SET center_x = ?, center_y = ? WHERE id = ?',
        [seedRoom[0].x_coord, seedRoom[0].y_coord, continent.id]
      );
      logger.info(`  Continent ${continent.id}: center at (${seedRoom[0].x_coord}, ${seedRoom[0].y_coord})`);
    }
  }

  logger.info('\nMap data extraction complete!');
}

// Run the extraction
extractMapData()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Error extracting map data:', error);
    process.exit(1);
  });
